import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import argon2 from "argon2";
import { createApp } from "../src/app.js";
import { migrate } from "../src/migrate.js";
import type { Operations } from "../src/pmo-models.js";

test(
  "PMO: migrations, project isolation, optimistic concurrency, baseline, review/final locks and carry-forward",
  { skip: !process.env.DATABASE_URL },
  async () => {
    const schema = `test_${randomUUID().replaceAll("-", "")}`,
      database = new Pool({ connectionString: process.env.DATABASE_URL });
    await database.query(`CREATE SCHEMA ${schema}`);
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        options: `-c search_path=${schema},public`,
      }),
      app = await createApp(pool);
    try {
      await migrate(pool);
      await migrate(pool);
      assert.equal(
        (await pool.query("SELECT * FROM schema_migrations")).rowCount,
        4,
      );
      const hash = await argon2.hash("correct-pmo-test-password", {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      });
      for (const role of ["admin", "pm", "viewer"])
        await pool.query(
          "INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$2)",
          [`${role}@pmo.test`, role, hash],
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
        fetch(`${base}/api${path}`, {
          method,
          headers: {
            Origin: origin,
            "Content-Type": "application/json",
            Cookie: cookie,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      async function login(role: string) {
        const response = await call("/auth/login", "POST", {
          email: `${role}@pmo.test`,
          password: "correct-pmo-test-password",
        });
        assert.equal(response.status, 200);
        return response.headers.get("set-cookie")!.split(";")[0];
      }
      const admin = await login("admin"),
        pm = await login("pm"),
        viewer = await login("viewer");
      const p = (await (
        await call(
          "/projects",
          "POST",
          {
            code: "PMO-1",
            name: "Governance",
            customer: "Customer",
            start_date: "2026-11-17",
            end_date: "2026-12-31",
          },
          admin,
        )
      ).json()) as { id: string };
      const viewerId = (
        await pool.query("SELECT id FROM users WHERE role='viewer'")
      ).rows[0].id;
      await pool.query(
        "INSERT INTO project_members(project_id,user_id) VALUES($1,$2)",
        [p.id, viewerId],
      );
      assert.equal(
        (
          await call(
            `/projects/${p.id}/modules/operations`,
            "GET",
            undefined,
            pm,
          )
        ).status,
        403,
      );
      const empty = (await (
        await call(
          `/projects/${p.id}/modules/operations`,
          "GET",
          undefined,
          viewer,
        )
      ).json()) as { version: number };
      assert.equal(empty.version, 0);
      const task = {
        id: randomUUID(),
        name: "Development",
        weight: 100,
        start: 0,
        duration: 2,
        pattern: "even" as const,
        plan: [],
        actual: { 0: 25 },
      };
      const ops: Operations = {
        phases: [{ id: randomUUID(), name: "Delivery", tasks: [task] }],
        issues: [],
        reports: {},
      };
      const path = `/projects/${p.id}/modules/operations`;
      assert.equal(
        (await call(path, "PUT", { version: 0, data: ops }, viewer)).status,
        403,
      );
      assert.equal(
        (await call(path, "PUT", { version: 0, data: ops }, admin)).status,
        200,
      );
      assert.equal(
        (await pool.query("SELECT progress FROM projects WHERE id=$1", [p.id]))
          .rows[0].progress,
        25,
      );
      assert.equal(
        (await call(path, "PUT", { version: 0, data: ops }, admin)).status,
        409,
      );
      assert.equal(
        (
          await call(
            path,
            "PUT",
            { version: 1, data: { ...ops, baseline: ops.phases } },
            admin,
          )
        ).status,
        200,
      );
      const changed = structuredClone(ops);
      changed.phases[0].tasks[0].name = "Changed name";
      changed.baseline = changed.phases;
      const updated = (await (
        await call(path, "PUT", { version: 2, data: changed }, admin)
      ).json()) as { data: Operations };
      assert.equal(updated.data.baseline![0].tasks[0].name, "Development");
      const concurrent = await Promise.all([
        call(path, "PUT", { version: 3, data: changed }, admin),
        call(path, "PUT", { version: 3, data: changed }, admin),
      ]);
      assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 409]);
      const invalid = structuredClone(ops);
      invalid.phases[0].tasks[0].weight = 50;
      assert.equal(
        (await call(path, "PUT", { version: 4, data: invalid }, admin)).status,
        400,
      );
      assert.equal(
        (
          await call(
            `/projects/${p.id}/metadata`,
            "PATCH",
            {
              pillar: "Application",
              sub_pillar: "Banking",
              revenue_forecast: 1000,
              revenue_actual: 400,
            },
            admin,
          )
        ).status,
        200,
      );
      const meetingInfo = {
        title: "Weekly governance",
        date: "2026-11-23",
        moderator: "Moderator",
        notulis: "Notulis",
        participants: "PMO",
        notes: "",
      };
      const meeting = (await (
        await call(
          "/meetings",
          "POST",
          { ...meetingInfo, project_ids: [p.id], previous_id: null },
          admin,
        )
      ).json()) as { id: string };
      const mp = `/meetings/${meeting.id}`;
      assert.equal((await call(mp, "GET", undefined, pm)).status, 403);
      assert.equal((await call(mp, "GET", undefined, viewer)).status, 200);
      assert.equal(
        (await call(`${mp}/finalize`, "POST", { version: 1 }, admin)).status,
        400,
      );
      assert.equal(
        (
          await call(
            `${mp}/reviews/${p.id}`,
            "PUT",
            {
              version: 1,
              review: {
                review: "updated",
                health: "on_track",
                summary: "",
                items: [],
                actions: [],
              },
            },
            admin,
          )
        ).status,
        400,
      );
      const review = {
        review: "updated",
        health: "on_track",
        summary: "Delivery accepted",
        items: [],
        actions: [
          {
            id: randomUUID(),
            text: "Prepare release",
            pic: "PM",
            due: "2026-12-01",
            status: "in_progress",
            side: "internal",
          },
          {
            id: randomUUID(),
            text: "Completed action",
            pic: "QA",
            due: "2026-11-23",
            status: "done",
            side: "internal",
          },
        ],
      };
      assert.equal(
        (
          await call(
            `${mp}/reviews/${p.id}`,
            "PUT",
            { version: 1, review },
            admin,
          )
        ).status,
        200,
      );
      assert.equal(
        (await call(`${mp}/finalize`, "POST", { version: 2 }, viewer)).status,
        403,
      );
      assert.equal(
        (await call(`${mp}/finalize`, "POST", { version: 2 }, admin)).status,
        201,
      );
      assert.equal(
        (await call(mp, "PATCH", { version: 3, info: meetingInfo }, admin))
          .status,
        409,
      );
      assert.equal(
        (
          await call(
            `${mp}/reviews/${p.id}`,
            "PUT",
            { version: 3, review },
            admin,
          )
        ).status,
        409,
      );
      assert.equal(
        (await call(mp, "DELETE", { version: 3 }, admin)).status,
        409,
      );
      const second = (await (
        await call(
          "/meetings",
          "POST",
          {
            ...meetingInfo,
            date: "2026-11-30",
            project_ids: [p.id],
            previous_id: meeting.id,
          },
          admin,
        )
      ).json()) as { id: string };
      const detail = (await (
        await call(`/meetings/${second.id}`, "GET", undefined, admin)
      ).json()) as {
        projects: {
          previous_notes: string;
          review: { review: string; actions: unknown[] };
        }[];
      };
      assert.match(detail.projects[0].previous_notes, /Delivery accepted/);
      assert.equal(detail.projects[0].review.review, "pending");
      assert.equal(detail.projects[0].review.actions.length, 1);
      assert.equal(
        (await call(`/meetings/${second.id}`, "DELETE", { version: 1 }, admin))
          .status,
        200,
      );
      const hidden = (await (
        await call("/meetings", "GET", undefined, pm)
      ).json()) as { meetings: unknown[] };
      assert.equal(hidden.meetings.length, 0);
      assert.equal(
        (
          await pool.query(
            "SELECT * FROM audit_logs WHERE action='meeting.finalized'",
          )
        ).rowCount,
        1,
      );
    } finally {
      await app.close();
      await pool.end();
      assert.match(schema, /^test_[a-f0-9]{32}$/);
      await database.query(`DROP SCHEMA ${schema} CASCADE`);
      await database.end();
    }
  },
);
