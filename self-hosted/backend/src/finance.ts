import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
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
import { audit, parse, transaction } from "./db.js";
import { projectHealth } from "./insights.js";
import type { User } from "./security.js";

const money = z.number().min(0).max(1e14);
const optionalDate = z.union([z.iso.date(), z.null()]).default(null);
const milestoneSchema = z.object({
  name: z.string().trim().min(2).max(200),
  percentage: z.number().min(0).max(100).default(0),
  amount: money.default(0),
  due_date: optionalDate,
  wbs_task_id: z.uuid().nullable().default(null),
  requires_bast: z.boolean().default(true),
  notes: z.string().trim().max(2000).default(""),
  sort_order: z.number().int().min(0).max(1000).default(0),
});
const billingSchema = milestoneSchema.extend({
  bast_document_id: z.uuid().nullable().default(null),
  invoice_number: z.string().trim().max(100).default(""),
  invoice_date: optionalDate,
  invoice_document_id: z.uuid().nullable().default(null),
  paid_amount: money.default(0),
  paid_date: optionalDate,
});

/** "Rp 1.250.000.000,50" → 1250000000.5 */
export function parseRupiah(text: string) {
  const s = text
    .replace(/[^\d.,]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

async function syncRevenue(client: PoolClient, projectId: string) {
  await client.query(
    "UPDATE projects SET revenue_actual=(SELECT coalesce(sum(paid_amount),0) FROM billing_milestones WHERE project_id=$1) WHERE id=$1 AND EXISTS(SELECT 1 FROM billing_milestones WHERE project_id=$1)",
    [projectId],
  );
}

/** Every finance/document-reference mutation takes this lock before row locks. */
export async function lockBilling(client: PoolClient, projectId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`billing:${projectId}`]);
  return (await client.query("SELECT contract_value,manager_id FROM projects WHERE id=$1 FOR UPDATE", [projectId])).rows[0];
}

export async function validateContractValue(client: PoolClient, projectId: string, value: number) {
  const total = Number((await client.query("SELECT coalesce(sum(amount),0) AS total FROM billing_milestones WHERE project_id=$1", [projectId])).rows[0].total);
  if (value + 0.5 < total)
    throw new BadRequestException("Nilai kontrak tidak boleh lebih kecil dari total termin yang sudah tercatat.");
}

async function checkDocument(
  client: PoolClient,
  projectId: string,
  id: string | null,
  category?: string,
) {
  if (!id) return;
  const d = (
    await client.query(
      "SELECT status,category FROM documents WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL",
      [id, projectId],
    )
  ).rows[0];
  if (!d) throw new BadRequestException("Dokumen harus berasal dari proyek yang sama.");
  if (category && (d.status !== "verified" || d.category !== category))
    throw new BadRequestException(
      `Dokumen harus berupa ${category.toUpperCase()} yang sudah diverifikasi.`,
    );
}

async function validateBilling(
  client: PoolClient,
  projectId: string,
  m: z.infer<typeof billingSchema>,
  excludeId: string | null,
) {
  const p = (
    await client.query("SELECT contract_value FROM projects WHERE id=$1", [projectId])
  ).rows[0];
  const contract = Number(p.contract_value);
  if (!m.amount && m.percentage && contract)
    m.amount = Math.round(contract * m.percentage) / 100;
  if (contract) {
    const others = Number(
      (
        await client.query(
          "SELECT coalesce(sum(amount),0) AS total FROM billing_milestones WHERE project_id=$1 AND ($2::uuid IS NULL OR id<>$2)",
          [projectId, excludeId],
        )
      ).rows[0].total,
    );
    if (others + m.amount > contract + 0.5)
      throw new BadRequestException("Total nilai termin melebihi nilai kontrak.");
  }
  await checkDocument(client, projectId, m.bast_document_id, "bast");
  await checkDocument(client, projectId, m.invoice_document_id, "invoice");
  if (m.wbs_task_id) {
    const ops = (await client.query("SELECT data FROM project_modules WHERE project_id=$1 AND kind='operations'", [projectId])).rows[0]?.data;
    const tasks = ops?.phases?.flatMap((p: { tasks: { id: string }[] }) => p.tasks) || [];
    if (!tasks.some((t: { id: string }) => t.id === m.wbs_task_id))
      throw new BadRequestException("Aktivitas WBS harus berasal dari proyek yang sama.");
  }
  if ((m.invoice_number || m.invoice_document_id) && !m.invoice_date)
    throw new BadRequestException("Tanggal invoice wajib diisi saat mencatat invoice.");
  if (m.invoice_date && m.requires_bast && !m.bast_document_id)
    throw new BadRequestException(
      "Termin ini memerlukan BAST terverifikasi sebelum ditagihkan.",
    );
  if (m.paid_amount > m.amount + 0.5)
    throw new BadRequestException("Pembayaran melebihi nilai termin.");
  if (m.paid_amount && !m.invoice_date)
    throw new BadRequestException("Catat invoice sebelum pembayaran.");
  if (m.paid_amount && !m.paid_date)
    throw new BadRequestException("Tanggal pembayaran wajib diisi.");
}

/**
 * Applies human-verified document fields to project finance: contract
 * number/value, payment terms, BAST or invoice links. Called inside the
 * verification transaction so nothing is applied without verification.
 */
export async function applyVerifiedDocument(
  client: PoolClient,
  user: User,
  doc: { id: string; project_id: string },
  category: string,
  fields: Record<string, string>,
  apply: { contract?: boolean; milestones?: boolean; milestone_id?: string | null },
) {
  const applied: string[] = [];
  const project = await lockBilling(client, doc.project_id);
  if ((apply.contract || apply.milestones) && !["pks", "spk"].includes(category))
    throw new BadRequestException("Kontrak dan termin hanya dapat diterapkan dari PKS atau SPK.");
  if (apply.contract) {
    if (user.role !== "admin" && project.manager_id !== user.id)
      throw new ForbiddenException("Kontrak hanya dapat diubah oleh admin atau manager proyek.");
    const value = fields.contract_value ? parseRupiah(fields.contract_value) : null;
    const number = (fields.contract_number || fields.document_number || "").trim().slice(0, 100);
    if (value === null && !number)
      throw new BadRequestException("Field contract_number/contract_value kosong.");
    const current = Number(project.contract_value);
    if (current > 0 && value !== null && value !== current && user.role !== "admin")
      throw new ForbiddenException(
        "Nilai kontrak sudah ditetapkan; perubahan nilai melalui change request (tipe biaya).",
      );
    if (value !== null) {
      parse(money, value);
      await validateContractValue(client, doc.project_id, value);
    }
    await client.query(
      "UPDATE projects SET contract_number=CASE WHEN $1<>'' THEN $1 ELSE contract_number END,contract_value=coalesce($2,contract_value) WHERE id=$3",
      [number, value, doc.project_id],
    );
    applied.push("kontrak");
  }
  if (apply.milestones) {
    const terms = Object.entries(fields)
      .filter(([k, v]) => /^termin_\d+$/.test(k) && v.trim())
      .sort((a, b) => Number(a[0].split("_")[1]) - Number(b[0].split("_")[1]));
    if (!terms.length)
      throw new BadRequestException("Tidak ada field termin_N untuk dibuat menjadi termin.");
    const contract = Number(
      (await client.query("SELECT contract_value FROM projects WHERE id=$1", [doc.project_id]))
        .rows[0].contract_value,
    );
    for (const [key, text] of terms) {
      const index = Number(key.split("_")[1]);
      const pct = Number((text.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1] || "0").replace(",", "."));
      const rp = text.match(/Rp\.?\s*[\d.,]+/i)?.[0];
      const amount = rp ? parseRupiah(rp) || 0 : contract ? Math.round(contract * pct) / 100 : 0;
      const term = parse(billingSchema, { name: `Termin ${index}`, percentage: pct, amount, requires_bast: true, notes: `Dari dokumen terverifikasi: ${text.slice(0, 1500)}`, sort_order: index });
      await validateBilling(client, doc.project_id, term, null);
      await client.query(
        "INSERT INTO billing_milestones(project_id,name,percentage,amount,requires_bast,notes,sort_order) VALUES($1,$2,$3,$4,true,$5,$6)",
        [doc.project_id, term.name, term.percentage, term.amount, term.notes, term.sort_order],
      );
    }
    applied.push(`${terms.length} termin`);
  }
  if (apply.milestone_id) {
    const ms = (
      await client.query(
        "SELECT * FROM billing_milestones WHERE id=$1 AND project_id=$2 FOR UPDATE",
        [apply.milestone_id, doc.project_id],
      )
    ).rows[0];
    if (!ms) throw new BadRequestException("Termin tidak ditemukan pada proyek ini.");
    if (category === "bast") {
      await client.query("UPDATE billing_milestones SET bast_document_id=$1 WHERE id=$2", [doc.id, ms.id]);
      applied.push(`BAST ${ms.name}`);
    } else if (category === "invoice") {
      await checkDocument(client, doc.project_id, ms.bast_document_id, "bast");
      if (ms.requires_bast && !ms.bast_document_id)
        throw new BadRequestException("Termin ini memerlukan BAST terverifikasi sebelum invoice.");
      const date = /^\d{4}-\d{2}-\d{2}$/.test(fields.invoice_date || "") ? fields.invoice_date : null;
      await client.query(
        "UPDATE billing_milestones SET invoice_document_id=$1,invoice_number=$2,invoice_date=coalesce($3::date,invoice_date,CURRENT_DATE) WHERE id=$4",
        [doc.id, (fields.invoice_number || fields.document_number || ms.invoice_number || "").slice(0, 100), date, ms.id],
      );
      applied.push(`invoice ${ms.name}`);
    } else throw new BadRequestException("Hanya BAST atau invoice yang dapat ditautkan ke termin.");
  }
  if (applied.length) await audit(client, user, "document.applied_to_finance", doc.id);
  return applied;
}

@Controller("api")
export class FinanceController {
  constructor(@Inject("DB") private readonly db: Pool) {}

  private async manage(req: Request, projectId: string) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    const project = await projectAccess(this.db, user, projectId);
    return { user, project };
  }

  @Get("projects/:id/finance") async finance(@Req() req: Request, @Param("id") id: string) {
    const user = await currentUser(this.db, req);
    await projectAccess(this.db, user, id);
    const [project, milestones] = await Promise.all([
      this.db.query(
        "SELECT contract_number,contract_value,revenue_forecast,revenue_actual FROM projects WHERE id=$1",
        [id],
      ),
      this.db.query(
        `SELECT m.*,b.name AS bast_document_name,i.name AS invoice_document_name FROM billing_milestones m
         LEFT JOIN documents b ON b.id=m.bast_document_id LEFT JOIN documents i ON i.id=m.invoice_document_id
         WHERE m.project_id=$1 ORDER BY m.sort_order,m.created_at`,
        [id],
      ),
    ]);
    const [health] = await projectHealth(this.db, [id]);
    return {
      contract: project.rows[0],
      milestones: milestones.rows,
      summary: health.finance,
      warnings: health.warnings.filter((w) => /^(bast|billing|invoice)_/.test(w.code)),
    };
  }

  @Put("projects/:id/contract") async contract(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { user, project } = await this.manage(req, id);
    const input = parse(
      z.object({ contract_number: z.string().trim().max(100), contract_value: money }),
      body,
    );
    if (user.role !== "admin" && project.manager_id !== user.id)
      throw new ForbiddenException("Khusus admin atau manager proyek.");
    return transaction(this.db, async (client) => {
      const current = await lockBilling(client, id);
      if (Number(current.contract_value) > 0 && Number(current.contract_value) !== input.contract_value && user.role !== "admin")
        throw new ForbiddenException("Nilai kontrak yang sudah ditetapkan hanya dapat diubah melalui change request (tipe biaya).");
      await validateContractValue(client, id, input.contract_value);
      await client.query(
        "UPDATE projects SET contract_number=$1,contract_value=$2 WHERE id=$3",
        [input.contract_number, input.contract_value, id],
      );
      await audit(client, user, "project.contract_updated", id);
      return { success: true };
    });
  }

  @Post("projects/:id/milestones") async create(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { user } = await this.manage(req, id);
    const input = parse(billingSchema, body);
    return transaction(this.db, async (client) => {
      await lockBilling(client, id);
      await validateBilling(client, id, input, null);
      const row = (
        await client.query(
          `INSERT INTO billing_milestones(project_id,name,percentage,amount,due_date,wbs_task_id,requires_bast,notes,sort_order,bast_document_id,invoice_number,invoice_date,invoice_document_id,paid_amount,paid_date)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [id, input.name, input.percentage, input.amount, input.due_date, input.wbs_task_id, input.requires_bast, input.notes, input.sort_order, input.bast_document_id, input.invoice_number, input.invoice_date, input.invoice_document_id, input.paid_amount, input.paid_date],
        )
      ).rows[0];
      await syncRevenue(client, id);
      await audit(client, user, "billing.created", row.id);
      return row;
    });
  }

  @Put("milestones/:id") async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const row = (
      await this.db.query("SELECT project_id FROM billing_milestones WHERE id=$1", [validId(id)])
    ).rows[0];
    if (!row) throw new ForbiddenException("Termin tidak dapat diakses.");
    const { user } = await this.manage(req, row.project_id);
    const input = parse(billingSchema, body);
    return transaction(this.db, async (client) => {
      await lockBilling(client, row.project_id);
      const current = await client.query("SELECT id FROM billing_milestones WHERE id=$1 FOR UPDATE", [id]);
      if (!current.rowCount) throw new ConflictException("Termin sudah dihapus. Muat ulang data.");
      await validateBilling(client, row.project_id, input, id);
      await client.query(
        `UPDATE billing_milestones SET name=$1,percentage=$2,amount=$3,due_date=$4,wbs_task_id=$5,requires_bast=$6,notes=$7,sort_order=$8,bast_document_id=$9,invoice_number=$10,invoice_date=$11,invoice_document_id=$12,paid_amount=$13,paid_date=$14 WHERE id=$15`,
        [input.name, input.percentage, input.amount, input.due_date, input.wbs_task_id, input.requires_bast, input.notes, input.sort_order, input.bast_document_id, input.invoice_number, input.invoice_date, input.invoice_document_id, input.paid_amount, input.paid_date, id],
      );
      await syncRevenue(client, row.project_id);
      await audit(client, user, "billing.updated", id);
      return { success: true };
    });
  }

  @Delete("milestones/:id") async remove(@Req() req: Request, @Param("id") id: string) {
    const row = (
      await this.db.query("SELECT project_id FROM billing_milestones WHERE id=$1", [validId(id)])
    ).rows[0];
    if (!row) throw new ForbiddenException("Termin tidak dapat diakses.");
    const { user } = await this.manage(req, row.project_id);
    return transaction(this.db, async (client) => {
      await lockBilling(client, row.project_id);
      const current = (await client.query("SELECT invoice_date FROM billing_milestones WHERE id=$1 FOR UPDATE", [id])).rows[0];
      if (!current) throw new ConflictException("Termin sudah dihapus. Muat ulang data.");
      if (current.invoice_date) throw new ConflictException("Termin yang sudah ditagihkan tidak dapat dihapus.");
      await client.query("DELETE FROM billing_milestones WHERE id=$1", [id]);
      await syncRevenue(client, row.project_id);
      await audit(client, user, "billing.deleted", id);
      return { success: true };
    });
  }
}
