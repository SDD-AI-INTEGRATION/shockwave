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
import { audit, notify, parse, transaction } from "./db.js";
import { metrics, type Operations } from "./pmo-models.js";
import type { User } from "./security.js";
import { lockBilling } from "./finance.js";

export type ApprovalKind =
  | "baseline"
  | "weekly_report"
  | "document"
  | "change_request"
  | "closure";
export const approvalLabels: Record<ApprovalKind, string> = {
  baseline: "Baseline WBS",
  weekly_report: "Laporan mingguan",
  document: "Dokumen/BAST",
  change_request: "Change request",
  closure: "Penutupan proyek",
};
type Effect = (
  client: PoolClient,
  approval: { id: string; project_id: string; resource_id: string; snapshot: unknown },
  user: User,
) => Promise<void>;
const effects: Partial<
  Record<ApprovalKind, { approved?: Effect; closed?: Effect }>
> = {};
/** Modules that own a resource register what happens when it is decided. */
export function onApproval(
  kind: ApprovalKind,
  handlers: { approved?: Effect; closed?: Effect },
) {
  effects[kind] = handlers;
}

async function approversFor(
  client: Pool | PoolClient,
  projectId: string,
  role: "project_manager" | "pmo",
) {
  const r =
    role === "project_manager"
      ? await client.query(
          "SELECT manager_id AS id FROM projects WHERE id=$1",
          [projectId],
        )
      : await client.query(
          "SELECT id FROM users WHERE role='admin' AND active",
        );
  return r.rows.map((x) => String(x.id));
}

/** Creates a two-step approval; step 1 is skipped when the requester manages the project. */
export async function requestApproval(
  client: PoolClient,
  user: User,
  input: {
    project_id: string;
    kind: ApprovalKind;
    resource_id: string;
    title: string;
    snapshot: unknown;
  },
) {
  const project = (
    await client.query("SELECT manager_id,name FROM projects WHERE id=$1", [
      input.project_id,
    ])
  ).rows[0];
  const skipManager = project.manager_id === user.id;
  let approval;
  try {
    approval = (
      await client.query(
        "INSERT INTO approvals(project_id,kind,resource_id,title,snapshot,requested_by,current_step) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
        [
          input.project_id,
          input.kind,
          input.resource_id,
          input.title,
          JSON.stringify(input.snapshot ?? {}),
          user.id,
          skipManager ? 2 : 1,
        ],
      )
    ).rows[0];
  } catch (error) {
    if ((error as { code?: string }).code === "23505")
      throw new ConflictException(
        "Sudah ada permintaan persetujuan yang menunggu untuk item ini.",
      );
    throw error;
  }
  await client.query(
    "INSERT INTO approval_steps(approval_id,step,approver_role,decision,note,decided_at) VALUES($1,1,'project_manager',$2,$3,$4),($1,2,'pmo','pending','',NULL)",
    [
      approval.id,
      skipManager ? "skipped" : "pending",
      skipManager ? "Pengaju adalah PM proyek." : "",
      skipManager ? new Date() : null,
    ],
  );
  const role = skipManager ? "pmo" : "project_manager";
  await notify(
    client,
    (await approversFor(client, input.project_id, role)).filter(
      (id) => id !== user.id,
    ),
    {
      project_id: input.project_id,
      level: "info",
      title: `Persetujuan diperlukan: ${input.title}`,
      body: `${approvalLabels[input.kind]} · ${project.name} · diajukan ${user.name}`,
      key: `approval:${approval.id}:step${skipManager ? 2 : 1}`,
    },
  );
  await audit(client, user, `approval.requested.${input.kind}`, approval.id);
  return approval;
}

async function canDecide(
  db: Pool | PoolClient,
  user: User,
  approval: Record<string, unknown>,
) {
  if (approval.status !== "pending" || approval.requested_by === user.id)
    return false;
  const steps = (
    await db.query(
      "SELECT step,approver_role,decided_by FROM approval_steps WHERE approval_id=$1",
      [approval.id],
    )
  ).rows;
  if (steps.some((s) => s.decided_by === user.id)) return false;
  const step = steps.find((s) => s.step === approval.current_step);
  if (!step) return false;
  if (step.approver_role === "pmo") return user.role === "admin";
  const project = (
    await db.query("SELECT manager_id FROM projects WHERE id=$1", [
      approval.project_id,
    ])
  ).rows[0];
  return project?.manager_id === user.id || user.role === "admin";
}

const decisionSchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(2000).default(""),
  })
  .refine((v) => v.decision === "approved" || v.note.length >= 3, {
    message: "Alasan penolakan wajib diisi.",
  });

@Controller("api")
export class ApprovalsController {
  constructor(@Inject("DB") private readonly db: Pool) {}

  @Get("approvals") async list(
    @Req() req: Request,
    @Query("scope") scope = "inbox",
    @Query("project_id") projectId?: string,
  ) {
    const user = await currentUser(this.db, req);
    if (projectId) await projectAccess(this.db, user, projectId);
    const rows = (
      await this.db.query(
        `SELECT a.*,p.code AS project_code,p.name AS project_name,p.manager_id,u.name AS requester_name
         FROM approvals a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=a.requested_by
         WHERE p.archived_at IS NULL AND ($1='admin' OR p.manager_id=$2 OR a.requested_by=$2 OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$2))
         AND ($3::uuid IS NULL OR a.project_id=$3)
         ${scope === "mine" ? "AND a.requested_by=$2" : scope === "inbox" ? "AND a.status='pending'" : ""}
         ORDER BY a.requested_at DESC LIMIT 300`,
        [user.role, user.id, projectId ? validId(projectId) : null],
      )
    ).rows;
    const result = [];
    for (const a of rows) {
      const decidable = await canDecide(this.db, user, a);
      if (scope === "inbox" && !decidable) continue;
      result.push({ ...a, can_decide: decidable });
    }
    return { approvals: result };
  }

  @Get("approvals/:id") async detail(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const user = await currentUser(this.db, req);
    const a = (
      await this.db.query(
        "SELECT a.*,p.code AS project_code,p.name AS project_name,u.name AS requester_name FROM approvals a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=a.requested_by WHERE a.id=$1",
        [validId(id)],
      )
    ).rows[0];
    if (!a) throw new ForbiddenException("Persetujuan tidak dapat diakses.");
    await projectAccess(this.db, user, a.project_id);
    const steps = (
      await this.db.query(
        "SELECT s.*,u.name AS decided_by_name FROM approval_steps s LEFT JOIN users u ON u.id=s.decided_by WHERE s.approval_id=$1 ORDER BY s.step",
        [id],
      )
    ).rows;
    return { ...a, steps, can_decide: await canDecide(this.db, user, a) };
  }

  /** Requests for resources owned by this module: baseline, weekly report, document. */
  @Post("approvals") async create(@Req() req: Request, @Body() body: unknown) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    const input = parse(
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("baseline"), project_id: z.uuid() }),
        z.object({
          kind: z.literal("weekly_report"),
          project_id: z.uuid(),
          week: z.number().int().min(0).max(259),
        }),
        z.object({
          kind: z.literal("document"),
          project_id: z.uuid(),
          document_id: z.uuid(),
        }),
      ]),
      body,
    );
    const project = await projectAccess(this.db, user, input.project_id);
    return transaction(this.db, async (client) => {
      if (input.kind === "document") {
        await lockBilling(client, project.id);
        const d = (
          await client.query(
            "SELECT id,name,category,status,version_number,verified_fields FROM documents WHERE id=$1 AND project_id=$2 AND deleted_at IS NULL",
            [input.document_id, project.id],
          )
        ).rows[0];
        if (!d) throw new BadRequestException("Dokumen tidak ditemukan.");
        if (d.status !== "verified")
          throw new BadRequestException(
            "Dokumen harus diverifikasi sebelum diajukan untuk persetujuan.",
          );
        return requestApproval(client, user, {
          project_id: project.id,
          kind: "document",
          resource_id: d.id,
          title: `${d.category.toUpperCase()} · ${d.name} (v${d.version_number})`,
          snapshot: d,
        });
      }
      const ops = (
        await client.query(
          "SELECT data FROM project_modules WHERE project_id=$1 AND kind='operations'",
          [project.id],
        )
      ).rows[0]?.data as Operations | undefined;
      if (input.kind === "baseline") {
        if (!ops?.baseline)
          throw new BadRequestException("Simpan baseline WBS terlebih dahulu.");
        const tasks = ops.baseline.flatMap((p) => p.tasks);
        return requestApproval(client, user, {
          project_id: project.id,
          kind: "baseline",
          resource_id: "baseline",
          title: `Baseline WBS ${project.code}`,
          snapshot: {
            phases: ops.baseline,
            tasks: tasks.length,
            finish_week: Math.max(0, ...tasks.map((t) => t.start + t.duration)),
          },
        });
      }
      if (!ops?.phases.length)
        throw new BadRequestException("WBS proyek belum tersedia.");
      return requestApproval(client, user, {
        project_id: project.id,
        kind: "weekly_report",
        resource_id: `week:${input.week}`,
        title: `Laporan W${input.week} ${project.code}`,
        snapshot: {
          week: input.week,
          metrics: metrics(ops, input.week),
          report: ops.reports[String(input.week)] || null,
          open_issues: ops.issues.filter((i) => i.status !== "closed"),
        },
      });
    });
  }

  @Post("approvals/:id/decision") @HttpCode(200) async decide(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    validId(id);
    const input = parse(decisionSchema, body);
    return transaction(this.db, async (client) => {
      const a = (
        await client.query("SELECT * FROM approvals WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!a) throw new ForbiddenException("Persetujuan tidak dapat diakses.");
      if (a.status !== "pending")
        throw new ConflictException("Persetujuan sudah diputuskan.");
      if (!(await canDecide(client, user, a)))
        throw new ForbiddenException(
          "Anda bukan penyetuju pada tahap ini, atau Anda pengaju/penyetuju tahap sebelumnya.",
        );
      await client.query(
        "UPDATE approval_steps SET decision=$1,decided_by=$2,decided_at=now(),note=$3 WHERE approval_id=$4 AND step=$5",
        [input.decision, user.id, input.note, id, a.current_step],
      );
      const finalStep = a.current_step >= 2;
      if (input.decision === "approved" && !finalStep) {
        await client.query(
          "UPDATE approvals SET current_step=current_step+1 WHERE id=$1",
          [id],
        );
        await notify(
          client,
          (await approversFor(client, a.project_id, "pmo")).filter(
            (x) => x !== user.id && x !== a.requested_by,
          ),
          {
            project_id: a.project_id,
            level: "info",
            title: `Persetujuan tahap PMO: ${a.title}`,
            body: `Disetujui PM oleh ${user.name}.`,
            key: `approval:${id}:step2`,
          },
        );
      } else {
        const status = input.decision === "approved" ? "approved" : "rejected";
        await client.query(
          "UPDATE approvals SET status=$1,decided_at=now() WHERE id=$2",
          [status, id],
        );
        const effect = effects[a.kind as ApprovalKind];
        if (status === "approved") await effect?.approved?.(client, a, user);
        else await effect?.closed?.(client, a, user);
        await notify(client, [a.requested_by], {
          project_id: a.project_id,
          level: status === "approved" ? "info" : "amber",
          title: `${status === "approved" ? "Disetujui" : "Ditolak"}: ${a.title}`,
          body: input.note || `Diputuskan oleh ${user.name}.`,
          key: `approval:${id}:${status}`,
        });
      }
      await audit(client, user, `approval.${input.decision}`, id);
      return { success: true };
    });
  }

  @Post("approvals/:id/cancel") @HttpCode(200) async cancel(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    validId(id);
    return transaction(this.db, async (client) => {
      const a = (
        await client.query("SELECT * FROM approvals WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!a || (a.requested_by !== user.id && user.role !== "admin"))
        throw new ForbiddenException("Hanya pengaju atau admin yang dapat membatalkan.");
      if (a.status !== "pending")
        throw new ConflictException("Persetujuan sudah diputuskan.");
      await client.query(
        "UPDATE approvals SET status='cancelled',decided_at=now() WHERE id=$1",
        [id],
      );
      await effects[a.kind as ApprovalKind]?.closed?.(client, a, user);
      await audit(client, user, "approval.cancelled", id);
      return { success: true };
    });
  }
}
