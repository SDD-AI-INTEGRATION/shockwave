import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import type { Pool } from "pg";
import type { Request } from "express";
import { z } from "zod";
import { tokenHash, type User } from "./security.js";
import { allowedOrigins } from './network.js';
export function validId(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new BadRequestException("ID tidak valid.");
  return id;
}
export function checkOrigin(req: Request) {
  if (!req.headers.origin || !allowedOrigins().includes(req.headers.origin))
    throw new ForbiddenException("Origin tidak diizinkan.");
}
export async function currentUser(db: Pool, req: Request): Promise<User> {
  const token = req.cookies?.sw_session;
  if (typeof token !== "string" || token.length > 100)
    throw new UnauthorizedException("Silakan masuk kembali.");
  const result = await db.query(
    "SELECT u.id,u.name,u.email,u.role,u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active",
    [tokenHash(token)],
  );
  if (!result.rowCount)
    throw new UnauthorizedException("Sesi berakhir. Silakan masuk kembali.");
  if (
    result.rows[0].must_change_password &&
    !["/api/auth/me", "/api/auth/password", "/api/auth/logout"].includes(
      req.path,
    )
  )
    throw new ForbiddenException(
      "Ganti password sementara sebelum mengakses workspace.",
    );
  return result.rows[0];
}
export function writeAccess(user: User) {
  if (user.role === "viewer") throw new ForbiddenException("Akses hanya baca.");
}
export type AccessibleProject = {
  id: string;
  name: string;
  code: string;
  customer: string;
  manager_name: string;
  manager_id: string;
  progress: number;
  start_date: Date;
  end_date: Date;
};
export async function projectAccess(
  db: Pool,
  user: User,
  id: string,
): Promise<AccessibleProject> {
  const result = await db.query(
    `SELECT p.*,u.name AS manager_name FROM projects p JOIN users u ON u.id=p.manager_id WHERE p.id=$1 AND p.archived_at IS NULL AND ($2='admin' OR p.manager_id=$3 OR EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=$3))`,
    [validId(id), user.role, user.id],
  );
  if (!result.rowCount)
    throw new ForbiddenException("Proyek tidak dapat diakses.");
  return result.rows[0];
}
