import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import {
  checkOrigin,
  currentUser,
  projectAccess,
  validId,
  writeAccess,
} from "./access.js";
import { audit, parse, transaction, visibleProjects } from "./db.js";
import type { Action } from "./pmo-models.js";
import type { User } from "./security.js";
import { todayIso } from "./insights.js";
import { lockBilling } from "./finance.js";

/**
 * Upserts actions coming from a meeting review or MOM. The tracker owns status
 * and evidence once an item exists, so later syncs only refresh text/PIC/due.
 */
export async function syncActions(
  client: PoolClient,
  user: User,
  projectId: string,
  source: "meeting" | "mom",
  sourceId: string,
  label: string,
  actions: Action[],
) {
  for (const a of actions) {
    await client.query(
      `INSERT INTO action_items(id,project_id,source,source_id,source_label,text,pic,pic_user_id,due,status,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT id FROM users WHERE active AND lower(name)=lower($7) LIMIT 1),$8,$9,$10)
       ON CONFLICT(id) DO UPDATE SET text=EXCLUDED.text,pic=EXCLUDED.pic,pic_user_id=EXCLUDED.pic_user_id,due=EXCLUDED.due,source_label=EXCLUDED.source_label,updated_at=now()
       WHERE action_items.project_id=EXCLUDED.project_id`,
      [a.id, projectId, source, sourceId, label, a.text, a.pic, a.due, a.status, user.id],
    );
  }
}

/** Tracker statuses for carried-forward meeting actions. */
export async function trackerStatus(client: Pool | PoolClient, ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await client.query(
    "SELECT id,status FROM action_items WHERE id=ANY($1::uuid[])",
    [ids],
  );
  return new Map(rows.rows.map((r) => [String(r.id), String(r.status)]));
}

const updateSchema = z
  .object({
    status: z.enum(["not_started", "in_progress", "pending", "done", "cancelled"]),
    evidence: z.string().trim().max(5000).default(""),
    evidence_document_id: z.uuid().nullable().default(null),
    pic: z.string().trim().min(1).max(150).optional(),
    due: z.iso.date().optional(),
  })
  .refine(
    (v) => v.status !== "done" || v.evidence.length >= 3 || !!v.evidence_document_id,
    { message: "Bukti penyelesaian (catatan atau dokumen) wajib diisi untuk status selesai." },
  );

@Controller("api")
export class ActionsController {
  constructor(@Inject("DB") private readonly db: Pool) {}

  @Get("action-items") async list(
    @Req() req: Request,
    @Query("status") status = "open",
    @Query("project_id") projectId?: string,
    @Query("mine") mine?: string,
  ) {
    const user = await currentUser(this.db, req);
    if (projectId) validId(projectId);
    const params: unknown[] = [user.role, user.id, projectId || null];
    const clauses: string[] = [];
    if (status === "open") clauses.push("a.status NOT IN ('done','cancelled')");
    if (status === "done") clauses.push("a.status='done'");
    if (status === "overdue") {
      params.push(todayIso());
      clauses.push(`a.status NOT IN ('done','cancelled') AND a.due<$${params.length}::date`);
    }
    if (mine === "1") {
      params.push(user.name);
      clauses.push(
        `(a.pic_user_id=$2 OR (a.pic_user_id IS NULL AND lower(a.pic)=lower($${params.length})))`,
      );
    }
    const rows = await this.db.query(
      `SELECT a.*,p.code AS project_code,p.name AS project_name,d.name AS evidence_document_name,cu.name AS completed_by_name
       FROM action_items a JOIN projects p ON p.id=a.project_id
       LEFT JOIN documents d ON d.id=a.evidence_document_id
       LEFT JOIN users cu ON cu.id=a.completed_by
       WHERE ${visibleProjects} AND ($3::uuid IS NULL OR a.project_id=$3)
       ${clauses.map((c) => `AND ${c}`).join(" ")}
       ORDER BY (a.status IN ('done','cancelled')), a.due, a.created_at LIMIT 500`,
      params,
    );
    return { items: rows.rows, today: todayIso() };
  }

  @Post("action-items") async create(@Req() req: Request, @Body() body: unknown) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    const input = parse(
      z.object({
        project_id: z.uuid(),
        text: z.string().trim().min(3).max(250),
        pic: z.string().trim().min(1).max(150),
        due: z.iso.date(),
      }),
      body,
    );
    await projectAccess(this.db, user, input.project_id);
    return transaction(this.db, async (client) => {
      const row = (
        await client.query(
          `INSERT INTO action_items(id,project_id,source,source_label,text,pic,pic_user_id,due,created_by)
           VALUES(gen_random_uuid(),$1,'manual','Input manual',$2,$3,(SELECT id FROM users WHERE active AND lower(name)=lower($3) LIMIT 1),$4,$5) RETURNING *`,
          [input.project_id, input.text, input.pic, input.due, user.id],
        )
      ).rows[0];
      await audit(client, user, "action_item.created", row.id);
      return row;
    });
  }

  @Patch("action-items/:id") async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    const input = parse(updateSchema, body);
    const item = (
      await this.db.query("SELECT * FROM action_items WHERE id=$1", [validId(id)])
    ).rows[0];
    if (!item) throw new ForbiddenException("Tindak lanjut tidak dapat diakses.");
    await projectAccess(this.db, user, item.project_id);
    const done = input.status === "done";
    return transaction(this.db, async (client) => {
      await lockBilling(client, item.project_id);
      if (input.evidence_document_id) {
        const doc = await client.query("SELECT id FROM documents WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL", [input.evidence_document_id, item.project_id]);
        if (!doc.rowCount) throw new BadRequestException("Dokumen bukti harus berasal dari proyek yang sama dan belum dihapus.");
      }
      await client.query(
        `UPDATE action_items SET status=$1,evidence=$2,evidence_document_id=$3,pic=coalesce($4,pic),due=coalesce($5,due),
         completed_by=CASE WHEN $6 THEN $7::uuid ELSE NULL END,completed_at=CASE WHEN $6 THEN coalesce(completed_at,now()) ELSE NULL END,updated_at=now() WHERE id=$8`,
        [
          input.status,
          input.evidence,
          input.evidence_document_id,
          input.pic ?? null,
          input.due ?? null,
          done,
          user.id,
          id,
        ],
      );
      await audit(client, user, `action_item.${input.status}`, id);
      return { success: true };
    });
  }
}
