import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  HttpCode,
} from "@nestjs/common";
import { Pool, type PoolClient } from "pg";
import type { Request } from "express";
import argon2 from "argon2";
import { z } from "zod";
import {
  currentUser,
  checkOrigin,
  projectAccess,
  validId,
  writeAccess,
} from "./access.js";
import { passwordSchema, projectSchema, type User } from "./security.js";
function input<T>(schema: z.ZodType<T>, body: unknown) {
  const r = schema.safeParse(body);
  if (!r.success)
    throw new BadRequestException(
      r.error.issues.map((i) => i.message).join(" "),
    );
  return r.data;
}
const person = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  name: z.string().trim().min(2).max(100),
  role: z.enum(["admin", "pm", "viewer"]),
  active: z.boolean(),
});
const hash = (password: string) =>
  argon2.hash(password, { memoryCost: 65536, timeCost: 3, parallelism: 1 });
@Controller("api")
export class AdministrationController {
  constructor(@Inject("DB") private db: Pool) {}
  private async admin(req: Request, mutate = false) {
    if (mutate) checkOrigin(req);
    const u = await currentUser(this.db, req);
    if (u.role !== "admin")
      throw new ForbiddenException("Khusus administrator.");
    return u;
  }
  private async tx<T>(fn: (c: PoolClient) => Promise<T>) {
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      const r = await fn(c);
      await c.query("COMMIT");
      return r;
    } catch (e) {
      await c.query("ROLLBACK");
      if ((e as { code?: string }).code === "23505")
        throw new ConflictException("Email atau kode sudah digunakan.");
      throw e;
    } finally {
      c.release();
    }
  }
  private async audit(c: PoolClient, u: User, action: string, id: string) {
    await c.query(
      "INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,$2,$3)",
      [u.id, action, id],
    );
  }
  @Get("admin/users") async users(@Req() req: Request) {
    await this.admin(req);
    return {
      users: (
        await this.db.query(
          "SELECT id,email,name,role,active,must_change_password,capacity,created_at FROM users ORDER BY name",
        )
      ).rows,
    };
  }
  @Post("admin/users") async create(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    const u = await this.admin(req, true),
      p = input(person.extend({ password: passwordSchema }), body),
      password = await hash(p.password);
    return this.tx(async (c) => {
      const row = (
        await c.query(
          "INSERT INTO users(email,name,role,active,password_hash,must_change_password) VALUES($1,$2,$3,$4,$5,true) RETURNING id,email,name,role,active",
          [p.email, p.name, p.role, p.active, password],
        )
      ).rows[0];
      await this.audit(c, u, "user.created", row.id);
      return row;
    });
  }
  @Patch("admin/users/:id") async update(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const u = await this.admin(req, true),
      p = input(person, body);
    validId(id);
    return this.tx(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(736492019)");
      const old = (
        await c.query("SELECT * FROM users WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!old) throw new BadRequestException("Pengguna tidak ditemukan.");
      if (
        old.active &&
        old.role === "admin" &&
        (!p.active || p.role !== "admin") &&
        Number(
          (
            await c.query(
              "SELECT count(*) FROM users WHERE role='admin' AND active AND id<>$1",
              [id],
            )
          ).rows[0].count,
        ) === 0
      )
        throw new ConflictException(
          "Minimal satu administrator aktif harus dipertahankan.",
        );
      await c.query(
        "UPDATE users SET email=$1,name=$2,role=$3,active=$4 WHERE id=$5",
        [p.email, p.name, p.role, p.active, id],
      );
      await c.query("DELETE FROM sessions WHERE user_id=$1", [id]);
      await this.audit(c, u, "user.updated", id);
      return { success: true };
    });
  }
  @Post("admin/users/:id/password") @HttpCode(200) async reset(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const u = await this.admin(req, true),
      p = input(z.object({ password: passwordSchema }), body);
    validId(id);
    return this.tx(async (c) => {
      const r = await c.query(
        "UPDATE users SET password_hash=$1,must_change_password=true WHERE id=$2",
        [await hash(p.password), id],
      );
      if (!r.rowCount)
        throw new BadRequestException("Pengguna tidak ditemukan.");
      await c.query("DELETE FROM sessions WHERE user_id=$1", [id]);
      await this.audit(c, u, "user.password_reset", id);
      return { success: true };
    });
  }
  @Post("auth/password") @HttpCode(200) async password(
    @Req() req: Request,
    @Body() body: unknown,
  ) {
    checkOrigin(req);
    const u = await currentUser(this.db, req),
      p = input(
        z.object({
          current_password: z.string().min(1).max(128),
          password: passwordSchema,
        }),
        body,
      );
    if (p.password === p.current_password)
      throw new BadRequestException("Gunakan password baru yang berbeda.");
    return this.tx(async (c) => {
      const account = (
        await c.query(
          "SELECT password_hash FROM users WHERE id=$1 FOR UPDATE",
          [u.id],
        )
      ).rows[0];
      if (!(await argon2.verify(account.password_hash, p.current_password)))
        throw new ForbiddenException("Password saat ini salah.");
      await c.query(
        "UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2",
        [await hash(p.password), u.id],
      );
      await c.query("DELETE FROM sessions WHERE user_id=$1", [u.id]);
      await this.audit(c, u, "user.password_changed", u.id);
      return {
        success: true,
        message: "Password diperbarui. Silakan masuk kembali.",
      };
    });
  }
  @Get("projects/:id/members") async members(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const u = await currentUser(this.db, req);
    await projectAccess(this.db, u, id);
    return {
      members: (
        await this.db.query(
          "SELECT u.id,u.name,u.email,u.role FROM users u JOIN project_members m ON m.user_id=u.id WHERE m.project_id=$1 ORDER BY u.name",
          [id],
        )
      ).rows,
    };
  }
  @Get("projects/:id/member-options") async memberOptions(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const u = await currentUser(this.db, req),
      p = await projectAccess(this.db, u, id);
    if (u.role !== "admin" && p.manager_id !== u.id)
      throw new ForbiddenException("Khusus admin atau manager proyek.");
    return {
      users: (
        await this.db.query(
          "SELECT id,name,email,role FROM users WHERE active ORDER BY name",
        )
      ).rows,
    };
  }
  @Post("projects/:id/members") async addMember(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    checkOrigin(req);
    const u = await currentUser(this.db, req),
      p = await projectAccess(this.db, u, id),
      v = input(z.object({ user_id: z.uuid() }), body);
    if (u.role !== "admin" && p.manager_id !== u.id)
      throw new ForbiddenException("Khusus admin atau manager proyek.");
    return this.tx(async (c) => {
      if (
        !(
          await c.query("SELECT id FROM users WHERE id=$1 AND active", [
            v.user_id,
          ])
        ).rowCount
      )
        throw new BadRequestException("Pengguna aktif tidak ditemukan.");
      await c.query(
        "INSERT INTO project_members(project_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id, v.user_id],
      );
      await this.audit(c, u, "project.member_added", id);
      return { success: true };
    });
  }
  @Delete("projects/:id/members/:userId") async removeMember(
    @Req() req: Request,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    checkOrigin(req);
    const u = await currentUser(this.db, req),
      p = await projectAccess(this.db, u, id);
    validId(userId);
    if (u.role !== "admin" && p.manager_id !== u.id)
      throw new ForbiddenException("Khusus admin atau manager proyek.");
    return this.tx(async (c) => {
      await c.query(
        "DELETE FROM project_members WHERE project_id=$1 AND user_id=$2",
        [id, userId],
      );
      await this.audit(c, u, "project.member_removed", id);
      return { success: true };
    });
  }
  @Patch("projects/:id") async project(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    checkOrigin(req);
    const u = await currentUser(this.db, req);
    writeAccess(u);
    const old = await projectAccess(this.db, u, id);
    if (u.role !== "admin" && old.manager_id !== u.id)
      throw new ForbiddenException("Khusus admin atau manager proyek.");
    const p = input(
      projectSchema
        .omit({ progress: true })
        .extend({ manager_id: z.uuid().optional() }),
      body,
    );
    if (p.manager_id && p.manager_id !== old.manager_id && u.role !== "admin")
      throw new ForbiddenException("Perubahan manager hanya oleh admin.");
    return this.tx(async (c) => {
      if (
        p.manager_id &&
        !(
          await c.query(
            "SELECT id FROM users WHERE id=$1 AND active AND role IN ('admin','pm')",
            [p.manager_id],
          )
        ).rowCount
      )
        throw new BadRequestException(
          "Manager harus merupakan admin/PM aktif.",
        );
      const tasks =
        (
          await c.query(
            "SELECT data FROM project_modules WHERE project_id=$1 AND kind='operations'",
            [id],
          )
        ).rows[0]?.data?.phases?.flatMap(
          (x: {
            tasks: {
              start: number;
              duration: number;
              actual: Record<string, number>;
            }[];
          }) => x.tasks,
        ) || [];
      const weeks =
        Math.ceil(
          (Date.parse(p.end_date) - Date.parse(p.start_date)) / 604800000,
        ) + 1;
      if (
        tasks.some(
          (t: {
            start: number;
            duration: number;
            actual: Record<string, number>;
          }) =>
            t.start + t.duration > weeks ||
            Object.keys(t.actual).some((k) => Number(k) >= weeks),
        )
      )
        throw new ConflictException(
          "Periode baru memotong jadwal atau histori WBS. Sesuaikan operasi terlebih dahulu.",
        );
      await c.query(
        "UPDATE projects SET code=$1,name=$2,customer=$3,description=$4,status=$5,start_date=$6,end_date=$7,manager_id=$8 WHERE id=$9",
        [
          p.code,
          p.name,
          p.customer,
          p.description,
          p.status,
          p.start_date,
          p.end_date,
          p.manager_id || old.manager_id,
          id,
        ],
      );
      await this.audit(c, u, "project.updated", id);
      return { success: true };
    });
  }
  @Delete("projects/:id") async archive(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    checkOrigin(req);
    const u = await currentUser(this.db, req),
      p = await projectAccess(this.db, u, id);
    if (u.role !== "admin" && p.manager_id !== u.id)
      throw new ForbiddenException("Khusus admin atau manager proyek.");
    return this.tx(async (c) => {
      await c.query("UPDATE projects SET archived_at=now() WHERE id=$1", [id]);
      await this.audit(c, u, "project.archived", id);
      return { success: true };
    });
  }
  @Get("admin/archives") async archives(@Req() req: Request) {
    await this.admin(req);
    return {
      projects: (
        await this.db.query(
          "SELECT id,code,name,archived_at FROM projects WHERE archived_at IS NOT NULL ORDER BY archived_at DESC",
        )
      ).rows,
    };
  }
  @Post("admin/archives/:id/restore") async restore(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const u = await this.admin(req, true);
    validId(id);
    return this.tx(async (c) => {
      await c.query("UPDATE projects SET archived_at=NULL WHERE id=$1", [id]);
      await this.audit(c, u, "project.restored", id);
      return { success: true };
    });
  }
  @Get("admin/audit") async logs(@Req() req: Request) {
    await this.admin(req);
    return {
      logs: (
        await this.db.query(
          "SELECT a.id,a.action,a.resource_id,a.created_at,u.name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 200",
        )
      ).rows,
    };
  }
  @Get("admin/operations") async operations(@Req() req: Request) {
    await this.admin(req);
    return {
      database: "ok",
      pool: {
        total: this.db.totalCount,
        idle: this.db.idleCount,
        waiting: this.db.waitingCount,
      },
      documents: (
        await this.db.query(
          "SELECT status,count(*)::int AS count,min(created_at) AS oldest FROM documents WHERE deleted_at IS NULL GROUP BY status",
        )
      ).rows,
    };
  }
}
