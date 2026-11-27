import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, dirname, basename, join } from "node:path";
import argon2 from "argon2";
import { createApp } from "../src/app.js";
import { migrate } from "../src/migrate.js";
test(
  "administration and document lifecycle enforce RBAC, password change, last admin, versions and verification",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const schema = `test_${randomUUID().replaceAll("-", "")}`,
      db = new Pool({ connectionString: process.env.DATABASE_URL });
    await db.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema},public`,
      }),
      folder = await mkdtemp(join(tmpdir(), "pmo-documents-test-")),
      original = process.env.STORAGE_DIR;
    process.env.STORAGE_DIR = folder;
    const app = await createApp(pool);
    try {
      await migrate(pool);
      const hash = await argon2.hash("test-password-original", {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
      await pool.query(
        "INSERT INTO users(email,name,password_hash,role) VALUES('admin@docs.test','Admin',$1,'admin'),('viewer@docs.test','Viewer',$1,'viewer'),('pm@docs.test','PM',$1,'pm')",
        [hash],
      );
      await app.listen(0, "127.0.0.1");
      const base = await app.getUrl(),
        origin = process.env.APP_ORIGIN || "http://localhost:3000";
      const call = (
        path: string,
        method = "GET",
        body?: unknown,
        cookie = "",
      ) =>
        fetch(base + "/api" + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            Cookie: cookie,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      async function login(email: string, password = "test-password-original") {
        const r = await call("/auth/login", "POST", { email, password });
        assert.equal(r.status, 200);
        return r.headers.get("set-cookie")!.split(";")[0];
      }
      const admin = await login("admin@docs.test"),
        viewer = await login("viewer@docs.test"),
        pm = await login("pm@docs.test");
      assert.equal(
        (await call("/admin/users", "GET", undefined, viewer)).status,
        403,
      );
      const self = (await pool.query("SELECT * FROM users WHERE role='admin'"))
        .rows[0];
      assert.equal(
        (
          await call(
            `/admin/users/${self.id}`,
            "PATCH",
            {
              email: self.email,
              name: self.name,
              role: "viewer",
              active: true,
            },
            admin,
          )
        ).status,
        409,
      );
      const created = await call(
        "/admin/users",
        "POST",
        {
          email: "new@docs.test",
          name: "New PM",
          role: "pm",
          active: true,
          password: "temporary-password-value",
        },
        admin,
      );
      assert.equal(created.status, 201);
      const person = (await created.json()) as { id: string };
      let newCookie = await login("new@docs.test", "temporary-password-value");
      assert.equal(
        (await call("/projects", "GET", undefined, newCookie)).status,
        403,
      );
      assert.equal(
        (
          await call(
            "/auth/password",
            "POST",
            {
              current_password: "temporary-password-value",
              password: "new-strong-password-value",
            },
            newCookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await call("/auth/me", "GET", undefined, newCookie)).status,
        401,
      );
      newCookie = await login("new@docs.test", "new-strong-password-value");
      assert.equal(
        (await call("/projects", "GET", undefined, newCookie)).status,
        200,
      );
      const p = (await (
        await call(
          "/projects",
          "POST",
          {
            code: "DOC-1",
            name: "Document project",
            customer: "Customer",
            start_date: "2026-11-17",
            end_date: "2026-12-17",
          },
          admin,
        )
      ).json()) as { id: string };
      const viewerId = (
        await pool.query("SELECT id FROM users WHERE role='viewer'")
      ).rows[0].id;
      assert.equal(
        (
          await call(
            `/projects/${p.id}/members`,
            "POST",
            { user_id: viewerId },
            admin,
          )
        ).status,
        201,
      );
      const upload = (
        content: Buffer,
        cookie = admin,
        type = "application/pdf",
        name = "test.pdf",
        root = "",
      ) =>
        fetch(
          `${base}/api/projects/${p.id}/documents${root ? "?root_id=" + root : ""}`,
          {
            method: "POST",
            headers: {
              Origin: origin,
              Cookie: cookie,
              "Content-Type": type,
              "X-File-Name": encodeURIComponent(name),
            },
            body: new Uint8Array(content),
          },
        );
      const pdf = Buffer.from(
        "%PDF-1.4\nSynthetic fixture for authorization only.",
      );
      assert.equal((await upload(pdf, viewer)).status, 403);
      assert.equal((await upload(Buffer.from("<script>"), admin)).status, 400);
      assert.equal(
        (await upload(pdf, admin, "image/png", "x.png")).status,
        400,
      );
      assert.equal(
        (await upload(pdf, admin, "application/pdf", "../secret.pdf")).status,
        400,
      );
      const firstResponse = await upload(pdf);
      assert.equal(firstResponse.status, 201);
      const first = (await firstResponse.json()) as { id: string };
      assert.equal(
        (await call(`/documents/${first.id}`, "GET", undefined, pm)).status,
        403,
      );
      const memberPm = (
        await pool.query("SELECT id FROM users WHERE email='pm@docs.test'")
      ).rows[0].id;
      assert.equal(
        (
          await call(
            `/projects/${p.id}/members`,
            "POST",
            { user_id: memberPm },
            admin,
          )
        ).status,
        201,
      );
      assert.equal(
        (
          await call(
            `/projects/${p.id}`,
            "PATCH",
            {
              code: "DOC-1",
              name: "Unauthorized edit",
              customer: "Customer",
              start_date: "2026-11-17",
              end_date: "2026-12-17",
            },
            pm,
          )
        ).status,
        403,
      );
      assert.equal(
        (await call(`/projects/${p.id}`, "DELETE", undefined, pm)).status,
        403,
      );
      assert.equal(
        (
          await call(
            `/admin/users/${person.id}/password`,
            "POST",
            { password: "replacement-temporary-password" },
            admin,
          )
        ).status,
        200,
      );
      assert.equal(
        (await call("/auth/me", "GET", undefined, newCookie)).status,
        401,
      );
      const download = await call(
        `/documents/${first.id}/file`,
        "GET",
        undefined,
        viewer,
      );
      assert.equal(download.status, 200);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), pdf);
      const versions = await Promise.all([
        upload(pdf, admin, "application/pdf", "v2.pdf", first.id),
        upload(pdf, admin, "application/pdf", "v3.pdf", first.id),
      ]);
      assert.deepEqual(
        versions.map((r) => r.status),
        [201, 201],
      );
      const v = await pool.query(
        "SELECT version_number FROM documents ORDER BY version_number",
      );
      assert.deepEqual(
        v.rows.map((x) => x.version_number),
        [1, 2, 3],
      );
      assert.equal(
        (
          await call(
            `/documents/${first.id}/verify`,
            "PUT",
            {
              revision: 0,
              category: "bast",
              fields: { number: "001" },
              notes: "Checked",
            },
            admin,
          )
        ).status,
        409,
      );
      await pool.query(
        "UPDATE documents SET status='needs_review',revision=1,raw_text='BAST Synthetic reference' WHERE id=$1",
        [first.id],
      );
      assert.equal(
        (
          await call(
            `/documents/${first.id}/verify`,
            "PUT",
            {
              revision: 1,
              category: "bast",
              fields: { document_number: "BAST-001" },
              notes: "Compared with original",
            },
            viewer,
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await call(
            `/documents/${first.id}/verify`,
            "PUT",
            {
              revision: 1,
              category: "bast",
              fields: { document_number: "BAST-001" },
              notes: "Compared with original",
            },
            admin,
          )
        ).status,
        200,
      );
      assert.equal(
        (
          await call(
            `/documents/${first.id}/verify`,
            "PUT",
            { revision: 1, category: "bast", fields: {}, notes: "duplicate" },
            admin,
          )
        ).status,
        409,
      );
      const search = (await (
        await call(
          `/projects/${p.id}/documents?q=Synthetic`,
          "GET",
          undefined,
          viewer,
        )
      ).json()) as { documents: unknown[] };
      assert.equal(search.documents.length, 1);
      assert.equal(
        (await call(`/documents/${first.id}`, "DELETE", undefined, admin))
          .status,
        200,
      );
      assert.equal(
        (await call(`/documents/${first.id}/file`, "GET", undefined, viewer))
          .status,
        403,
      );
      assert.equal(
        (await call(`/projects/${p.id}`, "DELETE", undefined, admin)).status,
        200,
      );
      assert.equal(
        (await call(`/projects/${p.id}/documents`, "GET", undefined, admin))
          .status,
        403,
      );
      assert.equal(
        (
          await call(
            `/admin/archives/${p.id}/restore`,
            "POST",
            undefined,
            admin,
          )
        ).status,
        201,
      );
      assert.ok(
        (
          await pool.query(
            "SELECT count(*) FROM audit_logs WHERE action LIKE 'document.%'",
          )
        ).rows[0].count >= 5,
      );
    } finally {
      await app.close();
      await pool.end();
      assert.match(schema, /^test_[a-f0-9]{32}$/);
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
      process.env.STORAGE_DIR = original;
      assert.equal(dirname(resolve(folder)), resolve(tmpdir()));
      assert.ok(basename(folder).startsWith("pmo-documents-test-"));
      await rm(folder, { recursive: true, force: true });
    }
  },
);
