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
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import { checkOrigin, currentUser, projectAccess, writeAccess } from "./access.js";
import { onApproval, requestApproval } from "./approvals.js";
import { audit, parse, transaction, visibleProjects } from "./db.js";
import { projectHealth } from "./insights.js";

export const defaultChecklist = [
  { id: "bast_final", label: "BAST akhir ditandatangani dan diverifikasi", required: true },
  { id: "billing", label: "Seluruh termin ditagihkan dan pembayaran dipantau", required: true },
  { id: "final_docs", label: "Dokumentasi akhir (as-built, manual, laporan akhir) diunggah", required: true },
  { id: "handover", label: "Serah terima ke klien/tim operasional selesai", required: true },
  { id: "risks_closed", label: "Risiko dan kendala ditutup atau dialihkan", required: true },
  { id: "actions_closed", label: "Tindak lanjut rapat selesai atau dialihkan", required: false },
  { id: "resources_released", label: "Resource, akses, dan lisensi proyek dilepas", required: false },
  { id: "lessons", label: "Lessons learned didokumentasikan", required: true },
].map((i) => ({ ...i, done: false, note: "" }));

const closureSchema = z.object({
  version: z.number().int().min(0),
  checklist: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        label: z.string().trim().min(2).max(250),
        required: z.boolean(),
        done: z.boolean(),
        note: z.string().trim().max(1000).default(""),
      }),
    )
    .max(40),
  handover: z.object({
    recipient: z.string().trim().max(200).default(""),
    date: z.union([z.iso.date(), z.literal("")]).default(""),
    notes: z.string().trim().max(5000).default(""),
  }),
  lessons: z
    .array(
      z.object({
        id: z.uuid(),
        category: z.enum(["planning", "technical", "stakeholder", "resource", "commercial", "quality", "other"]),
        title: z.string().trim().min(3).max(200),
        insight: z.string().trim().min(3).max(5000),
        recommendation: z.string().trim().max(5000).default(""),
        tags: z.string().trim().max(300).default(""),
      }),
    )
    .max(100),
  summary: z.string().trim().max(10000).default(""),
}).superRefine((value, ctx) => {
  const ids = value.checklist.map(i => i.id);
  if (new Set(ids).size !== ids.length)
    ctx.addIssue({ code: "custom", message: "ID checklist penutupan harus unik." });
  for (const required of defaultChecklist.filter(i => i.required)) {
    const item = value.checklist.find(i => i.id === required.id);
    if (!item || !item.required)
      ctx.addIssue({ code: "custom", message: `Checklist wajib tidak dapat dihapus atau dijadikan opsional: ${required.label}.` });
  }
  if (new Set(value.lessons.map(i => i.id)).size !== value.lessons.length)
    ctx.addIssue({ code: "custom", message: "ID lessons learned harus unik." });
});

onApproval("closure", {
  approved: async (client, a, user) => {
    await client.query(
      "UPDATE project_closures SET status='closed',updated_at=now() WHERE project_id=$1",
      [a.project_id],
    );
    await client.query(
      "UPDATE projects SET status='completed',closed_at=now() WHERE id=$1",
      [a.project_id],
    );
    await audit(client, user, "project.closed", a.project_id);
  },
  closed: async (client, a) => {
    await client.query(
      "UPDATE project_closures SET status='open',updated_at=now() WHERE project_id=$1",
      [a.project_id],
    );
  },
});

@Controller("api")
export class ClosureController {
  constructor(@Inject("DB") private readonly db: Pool) {}

  @Get("projects/:id/closure") async get(@Req() req: Request, @Param("id") id: string) {
    await projectAccess(this.db, await currentUser(this.db, req), id);
    const row = (
      await this.db.query("SELECT checklist,handover,lessons,summary,status,version,updated_at FROM project_closures WHERE project_id=$1", [id])
    ).rows[0];
    const [health] = await projectHealth(this.db, [id]);
    const approval = (
      await this.db.query(
        "SELECT id,status,current_step,requested_at FROM approvals WHERE project_id=$1 AND kind='closure' ORDER BY requested_at DESC LIMIT 1",
        [id],
      )
    ).rows[0];
    return {
      closure: row || {
        checklist: defaultChecklist,
        handover: { recipient: "", date: "", notes: "" },
        lessons: [],
        summary: "",
        status: "open",
        version: 0,
        updated_at: null,
      },
      readiness: {
        outstanding: health.finance.outstanding,
        unbilled: health.finance.unbilled,
        open_risks: health.risks.open,
        open_issues: health.issues_open,
        open_actions: health.actions.open,
        bast_verified: health.documents.bast_verified,
        documents_review: health.documents.needs_review,
        progress: health.progress,
      },
      approval: approval || null,
    };
  }

  @Put("projects/:id/closure") async save(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    await projectAccess(this.db, user, id);
    const input = parse(closureSchema, body);
    return transaction(this.db, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`closure:${id}`]);
      const old = (
        await client.query("SELECT status,version FROM project_closures WHERE project_id=$1 FOR UPDATE", [id])
      ).rows[0];
      if ((old?.version || 0) !== input.version)
        throw new ConflictException("Data penutupan berubah. Muat ulang sebelum menyimpan.");
      if (old && old.status !== "open")
        throw new ConflictException("Penutupan sedang diajukan atau sudah final.");
      await client.query(
        `INSERT INTO project_closures(project_id,checklist,handover,lessons,summary,updated_by) VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT(project_id) DO UPDATE SET checklist=$2,handover=$3,lessons=$4,summary=$5,updated_by=$6,updated_at=now(),version=project_closures.version+1`,
        [id, JSON.stringify(input.checklist), JSON.stringify(input.handover), JSON.stringify(input.lessons), input.summary, user.id],
      );
      await audit(client, user, "closure.saved", id);
      return { version: input.version + 1 };
    });
  }

  @Post("projects/:id/closure/submit") @HttpCode(200) async submit(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    const project = await projectAccess(this.db, user, id);
    if (user.role !== "admin" && project.manager_id !== user.id)
      throw new ForbiddenException("Penutupan diajukan oleh manager proyek atau admin.");
    return transaction(this.db, async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`closure:${id}`]);
      const c = (
        await client.query("SELECT * FROM project_closures WHERE project_id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!c) throw new BadRequestException("Simpan checklist penutupan terlebih dahulu.");
      if (c.status !== "open") throw new ConflictException("Penutupan sudah diajukan.");
      // Recheck persisted data too, including records saved before validation existed.
      parse(closureSchema, c);
      const missing = (c.checklist as { label: string; required: boolean; done: boolean }[])
        .filter((i) => i.required && !i.done)
        .map((i) => i.label);
      if (missing.length)
        throw new BadRequestException(`Checklist wajib belum selesai: ${missing.join("; ")}.`);
      if (!(c.lessons as unknown[]).length)
        throw new BadRequestException("Isi minimal satu lessons learned.");
      if (!c.handover.recipient || !c.handover.date)
        throw new BadRequestException("Lengkapi penerima dan tanggal serah terima.");
      await client.query("UPDATE project_closures SET status='pending' WHERE project_id=$1", [id]);
      return requestApproval(client, user, {
        project_id: id,
        kind: "closure",
        resource_id: id,
        title: `Penutupan proyek ${project.code} · ${project.name}`,
        snapshot: { checklist: c.checklist, handover: c.handover, lessons: c.lessons.length, summary: c.summary },
      });
    });
  }

  /**
   * Lessons learned from closed projects are organisational knowledge and are
   * visible to every signed-in user; documents stay limited to accessible projects.
   */
  @Get("knowledge") async knowledge(@Req() req: Request, @Query("q") q = "") {
    const user = await currentUser(this.db, req);
    const query = String(q).trim().slice(0, 200);
    const [lessons, documents] = await Promise.all([
      this.db.query(
        `SELECT p.id AS project_id,p.code,p.name,p.customer,p.pillar,p.closed_at,c.summary,l AS lesson
         FROM project_closures c JOIN projects p ON p.id=c.project_id, jsonb_array_elements(c.lessons) l
         WHERE c.status='closed' AND ($1='' OR c.search_vector @@ websearch_to_tsquery('simple',$1) OR l::text ILIKE '%'||$1||'%' OR p.name ILIKE '%'||$1||'%' OR p.customer ILIKE '%'||$1||'%')
         ORDER BY p.closed_at DESC NULLS LAST LIMIT 200`,
        [query],
      ),
      query
        ? this.db.query(
            `SELECT d.id,d.name,d.category,d.verified_at,p.code,p.name AS project_name FROM documents d JOIN projects p ON p.id=d.project_id
             WHERE ${visibleProjects} AND d.deleted_at IS NULL AND d.status='verified' AND (d.search_vector @@ websearch_to_tsquery('simple',$3) OR d.name ILIKE '%'||$3||'%')
             ORDER BY d.verified_at DESC LIMIT 50`,
            [user.role, user.id, query],
          )
        : Promise.resolve({ rows: [] }),
    ]);
    return { lessons: lessons.rows, documents: documents.rows };
  }
}
