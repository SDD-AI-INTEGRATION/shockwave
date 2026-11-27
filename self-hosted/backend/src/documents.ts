import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Req,
  Res,
  Body,
  Inject,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpCode,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Pool } from "pg";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import {
  currentUser,
  checkOrigin,
  projectAccess,
  validId,
  writeAccess,
} from "./access.js";
import { putObject, getObject, removeObject } from "./storage.js";
import { applyVerifiedDocument, lockBilling } from "./finance.js";
const MAX = 20 * 1024 * 1024;
export const documentCategories = [
  "spk",
  "pks",
  "bast",
  "invoice",
  "mom",
  "assignment",
  "report",
  "other",
] as const;
export function fileType(buffer: Buffer) {
  if (buffer.subarray(0, 5).toString() === "%PDF-")
    return { mime: "application/pdf", ext: "pdf" };
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return { mime: "image/png", ext: "png" };
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255)
    return { mime: "image/jpeg", ext: "jpg" };
  throw new BadRequestException(
    "Hanya PDF, PNG, dan JPEG yang valid diperbolehkan.",
  );
}
@Controller("api")
export class DocumentsController {
  constructor(@Inject("DB") private db: Pool) {}
  private async doc(req: Request, id: string, mutate = false) {
    if (mutate) checkOrigin(req);
    const u = await currentUser(this.db, req);
    if (mutate) writeAccess(u);
    validId(id);
    const d = (
      await this.db.query(
        "SELECT * FROM documents WHERE id=$1 AND deleted_at IS NULL",
        [id],
      )
    ).rows[0];
    if (!d) throw new ForbiddenException("Dokumen tidak dapat diakses.");
    await projectAccess(this.db, u, d.project_id);
    return { u, d };
  }
  @Get("projects/:id/documents") async list(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    await projectAccess(this.db, await currentUser(this.db, req), id);
    const q = String(req.query.q || "")
      .trim()
      .slice(0, 200);
    return {
      documents: (
        await this.db.query(
          `SELECT id,name,status,category,created_at,version_number,root_id,size_bytes,verified_at,error FROM documents WHERE project_id=$1 AND deleted_at IS NULL AND ($2='' OR search_vector @@ websearch_to_tsquery('simple',$2) OR name ILIKE '%'||$2||'%') ORDER BY created_at DESC LIMIT 300`,
          [id, q],
        )
      ).rows,
    };
  }
  @Post("projects/:id/documents") async upload(
    @Req() req: Request,
    @Param("id") projectId: string,
  ) {
    checkOrigin(req);
    const u = await currentUser(this.db, req);
    writeAccess(u);
    await projectAccess(this.db, u, projectId);
    const contentType = String(req.headers["content-type"] || "").split(";")[0];
    if (!["application/pdf", "image/png", "image/jpeg"].includes(contentType))
      throw new BadRequestException("Format unggahan tidak didukung.");
    if (Number(req.headers["content-length"]) > MAX)
      throw new BadRequestException("Ukuran dokumen maksimal 20 MB.");
    let name: string;
    try {
      name = decodeURIComponent(String(req.headers["x-file-name"] || ""));
    } catch {
      throw new BadRequestException("Nama file tidak valid.");
    }
    if (!name || name.length > 200 || /[\x00-\x1f\\/]/.test(name))
      throw new BadRequestException("Nama file tidak valid.");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX)
        throw new BadRequestException("Ukuran dokumen maksimal 20 MB.");
      chunks.push(Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks),
      type = fileType(bytes);
    if (type.mime !== contentType)
      throw new BadRequestException("Isi file tidak sesuai dengan tipe file.");
    const id = randomUUID(),
      key = `${id}.${type.ext}`,
      root = req.query.root_id ? validId(String(req.query.root_id)) : null;
    if (root) {
      const previous = await this.doc(req, root, true);
      if (previous.d.project_id !== projectId)
        throw new BadRequestException(
          "Versi harus berada dalam proyek yang sama.",
        );
    }
    await putObject(key, bytes, type.mime);
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      let rootId = root,
        version = 1;
      if (root) {
        const parent = (
          await c.query(
            "SELECT id,root_id FROM documents WHERE id=$1 FOR UPDATE",
            [root],
          )
        ).rows[0];
        rootId = parent.root_id || parent.id;
        await c.query("SELECT id FROM documents WHERE id=$1 FOR UPDATE", [
          rootId,
        ]);
        version =
          Number(
            (
              await c.query(
                "SELECT max(version_number) AS version FROM documents WHERE coalesce(root_id,id)=$1",
                [rootId],
              )
            ).rows[0].version,
          ) + 1;
      }
      const result = (
        await c.query(
          "INSERT INTO documents(id,project_id,name,storage_key,mime_type,uploaded_by,root_id,version_number,size_bytes,checksum) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,name,status,version_number",
          [
            id,
            projectId,
            name,
            key,
            type.mime,
            u.id,
            rootId,
            version,
            size,
            createHash("sha256").update(bytes).digest("hex"),
          ],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,'document.uploaded',$2)",
        [u.id, id],
      );
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      await removeObject(key).catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }
  @Get("documents/:id") async detail(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const { d } = await this.doc(req, id);
    const { storage_key, lease_token, ...safe } = d;
    return safe;
  }
  @Get("documents/:id/file") async download(
    @Req() req: Request,
    @Param("id") id: string,
    @Res() res: Response,
  ) {
    const { u, d } = await this.doc(req, id);
    const bytes = await getObject(d.storage_key);
    if (createHash("sha256").update(bytes).digest("hex") !== d.checksum)
      throw new ConflictException(
        "Integritas file tidak cocok. Hubungi administrator.",
      );
    await this.db.query(
      "INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,'document.downloaded',$2)",
      [u.id, id],
    );
    res.setHeader("Content-Type", d.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(d.name)}`,
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(bytes);
  }
  @Put("documents/:id/verify") async verify(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { u, d: document } = await this.doc(req, id, true);
    const p = z
      .object({
        revision: z.number().int().min(0),
        category: z.enum(documentCategories),
        fields: z.record(z.string().max(100), z.string().max(2000)),
        notes: z.string().trim().min(1).max(2000),
        apply: z
          .object({
            contract: z.boolean().optional(),
            milestones: z.boolean().optional(),
            milestone_id: z.uuid().nullable().optional(),
          })
          .default({}),
      })
      .safeParse(body);
    if (!p.success || Object.keys(p.success ? p.data.fields : {}).length > 50)
      throw new BadRequestException("Isian verifikasi tidak valid.");
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      await lockBilling(c, document.project_id);
      const d = (
        await c.query(
          "SELECT status,revision FROM documents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (!d) throw new ConflictException("Dokumen sudah dihapus. Muat ulang data.");
      if (d.status !== "needs_review" || d.revision !== p.data.revision)
        throw new ConflictException(
          "Hasil OCR berubah atau belum siap untuk verifikasi. Muat ulang.",
        );
      await c.query(
        "UPDATE documents SET status='verified',category=$1,verified_fields=$2,verified_by=$3,verified_at=now(),revision=revision+1 WHERE id=$4",
        [
          p.data.category,
          JSON.stringify({
            ...p.data.fields,
            _verification_note: p.data.notes,
          }),
          u.id,
          id,
        ],
      );
      await c.query(
        "INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,'document.verified',$2)",
        [u.id, id],
      );
      const applied = await applyVerifiedDocument(
        c,
        u,
        { id, project_id: document.project_id },
        p.data.category,
        p.data.fields,
        p.data.apply,
      );
      await c.query("COMMIT");
      return { success: true, applied };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  @Post("documents/:id/retry") @HttpCode(200) async retry(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const { u, d } = await this.doc(req, id, true);
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      await lockBilling(c, d.project_id);
      const r = await c.query(
        "UPDATE documents SET status='queued',attempts=0,error=NULL,claimed_at=NULL,lease_token=NULL,revision=revision+1 WHERE id=$1 AND status='failed' AND deleted_at IS NULL RETURNING id",
        [id],
      );
      if (!r.rowCount)
        throw new ConflictException(
          "Hanya pekerjaan gagal yang dapat dicoba ulang.",
        );
      await c.query(
        "INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,'document.retried',$2)",
        [u.id, id],
      );
      await c.query("COMMIT");
      return { success: true };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  @Delete("documents/:id") async remove(
    @Req() req: Request,
    @Param("id") id: string,
  ) {
    const { u, d } = await this.doc(req, id, true);
    const c = await this.db.connect();
    try {
      await c.query("BEGIN");
      await lockBilling(c, d.project_id);
      const used = (await c.query(
        `SELECT EXISTS(SELECT 1 FROM billing_milestones WHERE bast_document_id=$1 OR invoice_document_id=$1)
          OR EXISTS(SELECT 1 FROM action_items WHERE evidence_document_id=$1)
          OR EXISTS(SELECT 1 FROM approvals WHERE kind='document' AND resource_id=$1::text AND status IN ('pending','approved')) AS linked`,
        [id],
      )).rows[0].linked;
      if (used) throw new ConflictException("Dokumen masih dipakai oleh termin, persetujuan, atau bukti tindak lanjut. Lepaskan tautan yang dapat diubah atau unggah versi baru.");
      await c.query(
        "UPDATE documents SET deleted_at=now(),lease_token=NULL,revision=revision+1 WHERE id=$1",
        [id],
      );
      await c.query(
        "INSERT INTO audit_logs(user_id,action,resource_id) VALUES($1,'document.deleted',$2)",
        [u.id, id],
      );
      await c.query("COMMIT");
      return { success: true };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
