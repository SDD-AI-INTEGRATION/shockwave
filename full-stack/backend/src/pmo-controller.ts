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
  Patch,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import {
  checkOrigin,
  currentUser,
  projectAccess,
  validId,
  writeAccess,
} from "./access.js";
import {
  emptyModule,
  meetingCreateSchema,
  meetingInfoSchema,
  metrics,
  moduleSchemas,
  reviewSchema,
  reviewText,
  type ModuleKind,
  type Mom,
  type Operations,
  type Review,
} from "./pmo-models.js";
import type { User } from "./security.js";
import { syncActions, trackerStatus } from "./actions.js";
import { recordBaseline } from "./changes.js";
function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new BadRequestException(
      result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("\n"),
    );
  return result.data;
}
const versionSchema = z.number().int().min(0);
const kindOf = (kind: string) => {
  if (!Object.hasOwn(moduleSchemas, kind))
    throw new BadRequestException("Modul tidak dikenal.");
  return kind as ModuleKind;
};
const accessSql = `($2='admin' OR NOT EXISTS(SELECT 1 FROM corporate_meeting_projects mp JOIN projects p ON p.id=mp.project_id WHERE mp.meeting_id=m.id AND p.manager_id<>$3 AND NOT EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.user_id=$3)))`;

@Controller("api")
export class PmoController {
  constructor(@Inject("DB") private readonly db: Pool) {}
  private async mutation(req: Request) {
    checkOrigin(req);
    const user = await currentUser(this.db, req);
    writeAccess(user);
    return user;
  }
  private async transaction<T>(run: (client: PoolClient) => Promise<T>) {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const result = await run(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  private async meetingAccess(user: User, id: string) {
    const result = await this.db.query(
      `SELECT m.* FROM corporate_meetings m WHERE m.id=$1 AND ${accessSql}`,
      [validId(id), user.role, user.id],
    );
    if (!result.rowCount)
      throw new ForbiddenException("Rapat tidak dapat diakses.");
    return result.rows[0];
  }
  private async draft(client: PoolClient, id: string, version: number) {
    const m = (
      await client.query(
        "SELECT * FROM corporate_meetings WHERE id=$1 FOR UPDATE",
        [id],
      )
    ).rows[0];
    if (m.status === "final")
      throw new ConflictException(
        "Rapat final terkunci dan tidak dapat diubah atau dihapus.",
      );
    if (m.version !== version)
      throw new ConflictException(
        "Data rapat berubah. Muat ulang sebelum menyimpan.",
      );
    return m;
  }
  private async audit(
    client: PoolClient,
    user: User,
    action: string,
    id: string,
  ) {
    await client.query(
      "INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,$2,$3)",
      [user.id, action, id],
    );
  }
  @Get("projects/:id/modules/:kind")
  async module(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("kind") kind: string,
  ) {
    await projectAccess(this.db, await currentUser(this.db, req), id);
    const key = kindOf(kind);
    const row = (
      await this.db.query(
        "SELECT data,version,updated_at FROM project_modules WHERE project_id=$1 AND kind=$2",
        [id, key],
      )
    ).rows[0];
    return row || { data: emptyModule(key), version: 0, updated_at: null };
  }
  @Put("projects/:id/modules/:kind")
  async saveModule(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("kind") kind: string,
    @Body() body: unknown,
  ) {
    const user = await this.mutation(req),
      project = await projectAccess(this.db, user, id),
      key = kindOf(kind);
    const input = parse(
      z.object({ version: versionSchema, data: z.unknown() }),
      body,
    );
    const data = parse(moduleSchemas[key] as z.ZodType, input.data);
    if (Buffer.byteLength(JSON.stringify(data)) > 1500000)
      throw new BadRequestException("Data modul maksimal 1,5 MB.");
    if (key === "operations") {
      const weeks =
        Math.ceil(
          (new Date(project.end_date).getTime() -
            new Date(project.start_date).getTime()) /
            604800000,
        ) + 1;
      const ops = data as Operations;
      if (
        ops.phases
          .flatMap((p) => p.tasks)
          .some(
            (t) =>
              t.start + t.duration > weeks ||
              Object.keys(t.actual).some((k) => Number(k) >= weeks),
          )
      )
        throw new BadRequestException(
          "Jadwal/realisasi aktivitas melewati periode proyek.",
        );
    }
    return this.transaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        `${id}:${key}`,
      ]);
      const old = (
        await client.query(
          "SELECT version,data FROM project_modules WHERE project_id=$1 AND kind=$2 FOR UPDATE",
          [id, key],
        )
      ).rows[0];
      if ((old?.version || 0) !== input.version)
        throw new ConflictException(
          "Data telah berubah. Muat ulang; perubahan Anda belum ditimpa.",
        );
      // A baseline is captured once and cannot be silently rewritten by later
      // imports; re-baselining goes through an approved change request.
      if (key === "operations" && old?.data.baseline)
        (data as Operations).baseline = old.data.baseline;
      else if (key === "operations" && (data as Operations).baseline) {
        (data as Operations).baseline = structuredClone(
          (data as Operations).phases,
        );
        await recordBaseline(
          client,
          user,
          id,
          (data as Operations).phases,
          "Baseline awal",
        );
      }
      if (key === "mom")
        for (const doc of (data as { documents: Mom[] }).documents)
          await syncActions(
            client,
            user,
            id,
            "mom",
            doc.id,
            `MOM ${doc.number} · ${doc.date}`,
            doc.actions,
          );
      await client.query(
        `INSERT INTO project_modules(project_id,kind,data,version,updated_by) VALUES($1,$2,$3,1,$4) ON CONFLICT(project_id,kind) DO UPDATE SET data=$3,version=project_modules.version+1,updated_by=$4,updated_at=now()`,
        [id, key, JSON.stringify(data), user.id],
      );
      if (key === "operations") {
        const ops = data as Operations,
          tasks = ops.phases.flatMap((p) => p.tasks);
        const latest = Math.max(
          0,
          ...tasks.flatMap((t) => Object.keys(t.actual).map(Number)),
        );
        const progress = Math.round(metrics(ops, latest).actual);
        if (tasks.length && progress !== project.progress) {
          await client.query("UPDATE projects SET progress=$1 WHERE id=$2", [
            progress,
            id,
          ]);
          await client.query(
            "INSERT INTO progress_updates(project_id,progress,user_id) VALUES($1,$2,$3)",
            [id, progress, user.id],
          );
        }
      }
      await this.audit(client, user, `module.${key}.saved`, id);
      return { data, version: input.version + 1 };
    });
  }
  @Patch("projects/:id/metadata")
  async metadata(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const user = await this.mutation(req);
    await projectAccess(this.db, user, id);
    const p = parse(
      z.object({
        pillar: z.string().trim().max(100),
        sub_pillar: z.string().trim().max(100),
        revenue_forecast: z.number().min(0).max(1e14),
        revenue_actual: z.number().min(0).max(1e14),
      }),
      body,
    );
    return this.transaction(async (client) => {
      await client.query(
        "UPDATE projects SET pillar=$1,sub_pillar=$2,revenue_forecast=$3,revenue_actual=$4 WHERE id=$5",
        [p.pillar, p.sub_pillar, p.revenue_forecast, p.revenue_actual, id],
      );
      await this.audit(client, user, "project.metadata_updated", id);
      return { success: true };
    });
  }
  @Get("meetings")
  async meetings(@Req() req: Request) {
    const user = await currentUser(this.db, req);
    const result = await this.db.query(
      `SELECT m.*,count(mp.project_id)::int AS total,count(mp.project_id) FILTER(WHERE mp.review->>'review'<>'pending')::int AS reviewed FROM corporate_meetings m JOIN corporate_meeting_projects mp ON mp.meeting_id=m.id WHERE $1::text IS NULL AND ${accessSql} GROUP BY m.id ORDER BY m.date DESC,m.created_at DESC`,
      [null, user.role, user.id],
    );
    return { meetings: result.rows };
  }
  @Get("meetings/:id")
  async meeting(@Req() req: Request, @Param("id") id: string) {
    const user = await currentUser(this.db, req),
      m = await this.meetingAccess(user, id);
    const rows = await this.db.query(
      "SELECT project_id,snapshot,previous_notes,review FROM corporate_meeting_projects WHERE meeting_id=$1 ORDER BY snapshot->>'name'",
      [id],
    );
    return { ...m, projects: rows.rows };
  }
  @Post("meetings")
  async createMeeting(@Req() req: Request, @Body() body: unknown) {
    const user = await this.mutation(req),
      input = parse(meetingCreateSchema, body);
    const projects: Awaited<ReturnType<typeof projectAccess>>[] = [];
    for (const id of input.project_ids)
      projects.push(await projectAccess(this.db, user, id));
    if (input.previous_id) {
      const previous = await this.meetingAccess(user, input.previous_id);
      if (
        previous.status !== "final" ||
        new Date(previous.date).toISOString().slice(0, 10) >= input.date
      )
        throw new BadRequestException(
          "Referensi harus rapat final sebelum tanggal rapat baru.",
        );
    }
    return this.transaction(async (client) => {
      const m = (
        await client.query(
          "INSERT INTO corporate_meetings(title,date,moderator,notulis,participants,notes,previous_id,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            input.title,
            input.date,
            input.moderator,
            input.notulis,
            input.participants,
            input.notes,
            input.previous_id,
            user.id,
          ],
        )
      ).rows[0];
      for (const p of projects) {
        const previous = input.previous_id
          ? ((
              await client.query(
                "SELECT review FROM corporate_meeting_projects WHERE meeting_id=$1 AND project_id=$2",
                [input.previous_id, p.id],
              )
            ).rows[0]?.review as Review | undefined)
          : undefined;
        // The central tracker is authoritative: actions closed there are not carried.
        const tracked = await trackerStatus(
          client,
          (previous?.actions || []).map((a) => a.id),
        );
        const review = {
          review: "pending",
          health: "unrated",
          summary: "",
          items: [],
          actions: (previous?.actions || [])
            .map((a) => ({
              ...a,
              status: (tracked.get(a.id) as typeof a.status) || a.status,
            }))
            .filter(
              (a) =>
                a.status !== "done" &&
                (a.status as string) !== "cancelled",
            ),
        };
        const snapshot = p;
        await client.query(
          "INSERT INTO corporate_meeting_projects(meeting_id,project_id,snapshot,previous_notes,review) VALUES($1,$2,$3,$4,$5)",
          [
            m.id,
            p.id,
            JSON.stringify(snapshot),
            previous ? reviewText(previous) : "",
            JSON.stringify(review),
          ],
        );
      }
      await this.audit(client, user, "meeting.created", m.id);
      return m;
    });
  }
  @Patch("meetings/:id")
  async updateMeeting(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const user = await this.mutation(req);
    await this.meetingAccess(user, id);
    const input = parse(
      z.object({ version: versionSchema, info: meetingInfoSchema }),
      body,
    );
    return this.transaction(async (client) => {
      const old = await this.draft(client, id, input.version),
        p = input.info;
      if (old.previous_id) {
        const prev = (
          await client.query(
            "SELECT date FROM corporate_meetings WHERE id=$1",
            [old.previous_id],
          )
        ).rows[0];
        if (new Date(prev.date).toISOString().slice(0, 10) >= p.date)
          throw new BadRequestException(
            "Tanggal harus setelah rapat referensi.",
          );
      }
      await client.query(
        "UPDATE corporate_meetings SET title=$1,date=$2,moderator=$3,notulis=$4,participants=$5,notes=$6,version=version+1 WHERE id=$7",
        [p.title, p.date, p.moderator, p.notulis, p.participants, p.notes, id],
      );
      await this.audit(client, user, "meeting.updated", id);
      return { version: input.version + 1 };
    });
  }
  @Put("meetings/:id/reviews/:projectId")
  async review(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("projectId") projectId: string,
    @Body() body: unknown,
  ) {
    const user = await this.mutation(req);
    await this.meetingAccess(user, id);
    validId(projectId);
    const input = parse(
      z.object({ version: versionSchema, review: reviewSchema }),
      body,
    );
    return this.transaction(async (client) => {
      await this.draft(client, id, input.version);
      const result = await client.query(
        "UPDATE corporate_meeting_projects SET review=$1 WHERE meeting_id=$2 AND project_id=$3",
        [JSON.stringify(input.review), id, projectId],
      );
      if (!result.rowCount)
        throw new BadRequestException("Proyek tidak termasuk rapat.");
      await client.query(
        "UPDATE corporate_meetings SET version=version+1 WHERE id=$1",
        [id],
      );
      await this.audit(client, user, "meeting.reviewed", id);
      return { version: input.version + 1 };
    });
  }
  @Post("meetings/:id/finalize")
  async finalize(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const user = await this.mutation(req);
    await this.meetingAccess(user, id);
    const input = parse(z.object({ version: versionSchema }), body);
    return this.transaction(async (client) => {
      const m = await this.draft(client, id, input.version);
      if (!m.moderator.trim() || !m.notulis.trim() || !m.participants.trim())
        throw new BadRequestException(
          "Moderator, notulis, dan peserta wajib diisi sebelum finalisasi.",
        );
      const projects = await client.query(
        "SELECT project_id,review FROM corporate_meeting_projects WHERE meeting_id=$1",
        [id],
      );
      if (
        !projects.rowCount ||
        projects.rows.some(
          (p) =>
            p.review.review === "pending" ||
            !reviewSchema.safeParse(p.review).success,
        )
      )
        throw new BadRequestException(
          "Semua proyek harus direview, termasuk proyek tanpa perubahan.",
        );
      await client.query(
        "UPDATE corporate_meetings SET status='final',finalized_at=now(),version=version+1 WHERE id=$1",
        [id],
      );
      // Every decision becomes a tracked action item with PIC and deadline.
      for (const p of projects.rows)
        await syncActions(
          client,
          user,
          p.project_id,
          "meeting",
          id,
          `${m.title} · ${new Date(m.date).toISOString().slice(0, 10)}`,
          (p.review as Review).actions,
        );
      await this.audit(client, user, "meeting.finalized", id);
      return { status: "final", version: input.version + 1 };
    });
  }
  @Delete("meetings/:id")
  async remove(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const user = await this.mutation(req);
    await this.meetingAccess(user, id);
    const input = parse(z.object({ version: versionSchema }), body);
    return this.transaction(async (client) => {
      await this.draft(client, id, input.version);
      await client.query("DELETE FROM corporate_meetings WHERE id=$1", [id]);
      await this.audit(client, user, "meeting.deleted", id);
      return { success: true };
    });
  }
}
