import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
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
import { onApproval, requestApproval } from "./approvals.js";
import { audit, parse, transaction } from "./db.js";
import type { Operations } from "./pmo-models.js";
import type { User } from "./security.js";
import { lockBilling, validateContractValue } from "./finance.js";

const changeSchema = z.object({
  title: z.string().trim().min(3).max(200),
  type: z.enum(["scope", "timeline", "cost", "pic"]),
  description: z.string().trim().max(5000).default(""),
  reason: z.string().trim().min(5).max(5000),
  impact: z.string().trim().max(5000).default(""),
  changes: z
    .object({
      new_end_date: z.iso.date().optional(),
      new_contract_value: z.number().min(0).max(1e14).optional(),
      new_manager_id: z.uuid().optional(),
      rebaseline: z.boolean().optional(),
    })
    .default({}),
});

const weeksBetween = (start: string, end: string) =>
  Math.ceil((Date.parse(end) - Date.parse(start)) / 604800000) + 1;
const isoDate = (v: Date | string) =>
  v instanceof Date
    ? new Date(v.getTime() - v.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10)
    : String(v).slice(0, 10);

export async function recordBaseline(
  client: PoolClient,
  user: User,
  projectId: string,
  phases: unknown,
  reason: string,
  changeRequestId: string | null = null,
) {
  await client.query(
    "INSERT INTO baseline_history(project_id,version,phases,reason,change_request_id,created_by) VALUES($1,(SELECT coalesce(max(version),0)+1 FROM baseline_history WHERE project_id=$1),$2,$3,$4,$5)",
    [projectId, JSON.stringify(phases), reason, changeRequestId, user.id],
  );
}

async function applyChange(client: PoolClient, crId: string, user: User) {
  const cr = (
    await client.query(
      "SELECT * FROM change_requests WHERE id=$1 FOR UPDATE",
      [crId],
    )
  ).rows[0];
  await lockBilling(client, cr.project_id);
  const project = (
    await client.query("SELECT * FROM projects WHERE id=$1 FOR UPDATE", [
      cr.project_id,
    ])
  ).rows[0];
  const c = cr.changes as z.infer<typeof changeSchema>["changes"];
  const opsRow = (
    await client.query(
      "SELECT data FROM project_modules WHERE project_id=$1 AND kind='operations' FOR UPDATE",
      [cr.project_id],
    )
  ).rows[0];
  const ops = opsRow?.data as Operations | undefined;
  if (c.new_end_date) {
    const start = isoDate(project.start_date);
    if (c.new_end_date < start)
      throw new BadRequestException("Tanggal selesai baru sebelum tanggal mulai.");
    const weeks = weeksBetween(start, c.new_end_date);
    const tasks = ops?.phases.flatMap((p) => p.tasks) || [];
    if (
      tasks.some(
        (t) =>
          t.start + t.duration > weeks ||
          Object.keys(t.actual).some((k) => Number(k) >= weeks),
      )
    )
      throw new ConflictException(
        "Tanggal selesai baru memotong jadwal/realisasi WBS. Sesuaikan WBS sebelum menyetujui.",
      );
    await client.query("UPDATE projects SET end_date=$1 WHERE id=$2", [
      c.new_end_date,
      cr.project_id,
    ]);
  }
  if (c.new_contract_value !== undefined) {
    await validateContractValue(client, cr.project_id, c.new_contract_value);
    await client.query("UPDATE projects SET contract_value=$1 WHERE id=$2", [
      c.new_contract_value,
      cr.project_id,
    ]);
  }
  if (c.new_manager_id) {
    const ok = await client.query(
      "SELECT id FROM users WHERE id=$1 AND active AND role IN ('admin','pm')",
      [c.new_manager_id],
    );
    if (!ok.rowCount)
      throw new BadRequestException("PIC/manager baru harus admin atau PM aktif.");
    await client.query("UPDATE projects SET manager_id=$1 WHERE id=$2", [
      c.new_manager_id,
      cr.project_id,
    ]);
  }
  if (c.rebaseline) {
    if (!ops?.phases.length)
      throw new BadRequestException("WBS belum tersedia untuk baseline baru.");
    await recordBaseline(
      client,
      user,
      cr.project_id,
      ops.phases,
      `${cr.number}: ${cr.title}`,
      cr.id,
    );
    await client.query(
      "UPDATE project_modules SET data=jsonb_set(data,'{baseline}',$1::jsonb),version=version+1,updated_by=$2,updated_at=now() WHERE project_id=$3 AND kind='operations'",
      [JSON.stringify(ops.phases), user.id, cr.project_id],
    );
  }
  await client.query(
    "UPDATE change_requests SET status='approved',applied_at=now() WHERE id=$1",
    [crId],
  );
  await audit(client, user, "change_request.applied", crId);
}

onApproval("change_request", {
  approved: (client, a, user) => applyChange(client, a.resource_id, user),
  closed: async (client, a) => {
    const status = (
      await client.query("SELECT status FROM approvals WHERE id=$1", [a.id])
    ).rows[0].status;
    await client.query("UPDATE change_requests SET status=$1 WHERE id=$2", [
      status === "rejected" ? "rejected" : "draft",
      a.resource_id,
    ]);
  },
});

@Controller("api")
export class ChangesController {
  constructor(@Inject("DB") private readonly db: Pool) {}

  private async editable(req: Request, id: string) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    const cr = (
      await this.db.query("SELECT * FROM change_requests WHERE id=$1", [
        validId(id),
      ])
    ).rows[0];
    if (!cr) throw new ForbiddenException("Change request tidak dapat diakses.");
    await projectAccess(this.db, user, cr.project_id);
    return { user, cr };
  }

  @Get("projects/:id/change-requests") async list(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await projectAccess(this.db, await currentUser(this.db, req), id);
    const rows = await this.db.query(
      `SELECT c.*,u.name AS created_by_name,
        (SELECT row_to_json(x) FROM (SELECT a.id,a.status,a.current_step FROM approvals a WHERE a.kind='change_request' AND a.resource_id=c.id::text ORDER BY a.requested_at DESC LIMIT 1) x) AS approval
       FROM change_requests c JOIN users u ON u.id=c.created_by WHERE c.project_id=$1 ORDER BY c.created_at DESC`,
      [id],
    );
    return { change_requests: rows.rows };
  }

  @Post("projects/:id/change-requests") async create(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    await projectAccess(this.db, user, id);
    const input = parse(changeSchema, body);
    return transaction(this.db, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `cr:${id}`,
      ]);
      const next =
        Number(
          (
            await client.query(
              "SELECT count(*) FROM change_requests WHERE project_id=$1",
              [id],
            )
          ).rows[0].count,
        ) + 1;
      const cr = (
        await client.query(
          "INSERT INTO change_requests(project_id,number,title,type,description,reason,impact,changes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *",
          [
            id,
            `CR-${String(next).padStart(3, "0")}`,
            input.title,
            input.type,
            input.description,
            input.reason,
            input.impact,
            JSON.stringify(input.changes),
            user.id,
          ],
        )
      ).rows[0];
      await audit(client, user, "change_request.created", cr.id);
      return cr;
    });
  }

  @Put("change-requests/:id") async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { user, cr } = await this.editable(req, id);
    if (cr.status !== "draft")
      throw new ConflictException("Hanya draf yang dapat diubah.");
    const input = parse(changeSchema, body);
    await this.db.query(
      "UPDATE change_requests SET title=$1,type=$2,description=$3,reason=$4,impact=$5,changes=$6 WHERE id=$7",
      [
        input.title,
        input.type,
        input.description,
        input.reason,
        input.impact,
        JSON.stringify(input.changes),
        id,
      ],
    );
    await audit(this.db, user, "change_request.updated", id);
    return { success: true };
  }

  @Post("change-requests/:id/submit") @HttpCode(200) async submit(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const { user, cr } = await this.editable(req, id);
    if (cr.status !== "draft" && cr.status !== "rejected")
      throw new ConflictException("Change request sudah diajukan atau selesai.");
    return transaction(this.db, async (client) => {
      const project = (
        await client.query(
          "SELECT p.code,p.end_date,p.contract_value,u.name AS manager_name FROM projects p JOIN users u ON u.id=p.manager_id WHERE p.id=$1",
          [cr.project_id],
        )
      ).rows[0];
      await client.query(
        "UPDATE change_requests SET status='pending' WHERE id=$1",
        [id],
      );
      return requestApproval(client, user, {
        project_id: cr.project_id,
        kind: "change_request",
        resource_id: cr.id,
        title: `${cr.number} ${cr.title} (${project.code})`,
        snapshot: {
          change_request: cr,
          before: {
            end_date: isoDate(project.end_date),
            contract_value: Number(project.contract_value),
            manager_name: project.manager_name,
          },
        },
      });
    });
  }

  @Post("change-requests/:id/cancel") @HttpCode(200) async cancel(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const { user, cr } = await this.editable(req, id);
    if (!["draft", "rejected"].includes(cr.status))
      throw new ConflictException(
        "Batalkan persetujuan yang menunggu melalui menu Persetujuan.",
      );
    await this.db.query(
      "UPDATE change_requests SET status='cancelled' WHERE id=$1",
      [id],
    );
    await audit(this.db, user, "change_request.cancelled", id);
    return { success: true };
  }

  @Get("projects/:id/baselines") async baselines(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await projectAccess(this.db, await currentUser(this.db, req), id);
    const rows = await this.db.query(
      "SELECT b.id,b.version,b.phases,b.reason,b.created_at,u.name AS created_by_name,c.number AS change_number FROM baseline_history b JOIN users u ON u.id=b.created_by LEFT JOIN change_requests c ON c.id=b.change_request_id WHERE b.project_id=$1 ORDER BY b.version",
      [id],
    );
    return { baselines: rows.rows };
  }
}
