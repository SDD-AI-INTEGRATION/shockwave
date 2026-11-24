import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import argon2 from "argon2";
import { createApp } from "../src/app.js";
import { migrate } from "../src/migrate.js";
import { runEarlyWarning } from "../src/notifications.js";

test(
  "Governance: approvals, change requests, finance, action items, health, workload, closure, assistant",
  { skip: !process.env.DATABASE_URL },
  async () => {
    process.env.ASSISTANT_AI = "off";
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
      const hash = await argon2.hash("correct-pmo-test-password", { memoryCost: 65536, timeCost: 3, parallelism: 1 });
      for (const [email, role] of [["admin", "admin"], ["pm", "pm"], ["pm2", "pm"], ["viewer", "viewer"], ["outsider", "pm"]])
        await pool.query("INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$4)", [`${email}@pmo.test`, email, hash, role]);
      await app.listen(0, "127.0.0.1");
      const base = await app.getUrl(),
        origin = process.env.APP_ORIGIN || "http://localhost:3000";
      const call = async (path: string, method = "GET", body?: unknown, cookie = "") => {
        const r = await fetch(`${base}/api${path}`, {
          method,
          headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await r.text();
        return { status: r.status, body: text ? JSON.parse(text) : null };
      };
      const login = async (who: string) => {
        const r = await fetch(`${base}/api/auth/login`, {
          method: "POST",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: JSON.stringify({ email: `${who}@pmo.test`, password: "correct-pmo-test-password" }),
        });
        assert.equal(r.status, 200);
        return r.headers.get("set-cookie")!.split(";")[0];
      };
      const [admin, pm, pm2, viewer, outsider] = await Promise.all(["admin", "pm", "pm2", "viewer", "outsider"].map(login));
      const ids = Object.fromEntries((await pool.query("SELECT name,id FROM users")).rows.map((r) => [r.name, r.id]));

      // Project managed by pm, with pm2 and viewer as members.
      const project = (await call("/projects", "POST", { code: "GOV-1", name: "Migrasi BTN", customer: "Bank BTN", status: "active", start_date: "2026-10-01", end_date: "2026-12-31" }, pm)).body;
      for (const u of [ids.pm2, ids.viewer]) assert.equal((await call(`/projects/${project.id}/members`, "POST", { user_id: u }, pm)).status, 201);
      const taskId = randomUUID();
      const ops = {
        phases: [{ id: randomUUID(), name: "Fase 1", tasks: [{ id: taskId, name: "Instalasi", weight: 100, start: 0, duration: 4, pattern: "even", plan: [], actual: { "0": 10 } }] }],
        issues: [{ id: randomUUID(), task_id: "", category: "resource", description: "Akses server belum diberikan", impact: "high", action: "Eskalasi ke klien", pic: "pm", due: "2026-11-20", status: "open", week: 6 }],
        reports: { "6": { notes: "Instalasi tertunda", done: "", todo: "", next: "Selesaikan akses" } },
        baseline: [],
      };
      const saved = await call(`/projects/${project.id}/modules/operations`, "PUT", { version: 0, data: ops }, pm);
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
      assert.equal((await pool.query("SELECT version FROM baseline_history WHERE project_id=$1", [project.id])).rowCount, 1);

      // Baseline approval: requester = PM so step 1 is skipped; requester cannot approve.
      const baseline = (await call("/approvals", "POST", { kind: "baseline", project_id: project.id }, pm)).body;
      assert.equal(baseline.current_step, 2);
      assert.equal((await call("/approvals", "POST", { kind: "baseline", project_id: project.id }, pm)).status, 409);
      assert.equal((await call(`/approvals/${baseline.id}/decision`, "POST", { decision: "approved" }, pm)).status, 403);
      assert.equal((await call(`/approvals/${baseline.id}/decision`, "POST", { decision: "approved" }, viewer)).status, 403);
      assert.equal((await call("/approvals?scope=inbox", "GET", undefined, admin)).body.approvals.length, 1);
      assert.equal((await call(`/approvals/${baseline.id}/decision`, "POST", { decision: "approved" }, admin)).status, 200);
      assert.equal((await call(`/approvals/${baseline.id}`, "GET", undefined, pm)).body.status, "approved");

      // Weekly report by member pm2: PM step then PMO step; rejection needs a reason; one person cannot decide twice.
      const report = (await call("/approvals", "POST", { kind: "weekly_report", project_id: project.id, week: 6 }, pm2)).body;
      assert.equal(report.current_step, 1);
      assert.equal((await call(`/approvals/${report.id}/decision`, "POST", { decision: "rejected" }, pm)).status, 400);
      assert.equal((await call(`/approvals/${report.id}/decision`, "POST", { decision: "approved", note: "OK" }, admin)).status, 200);
      assert.equal((await call(`/approvals/${report.id}/decision`, "POST", { decision: "approved" }, admin)).status, 403);
      assert.equal((await call(`/approvals/${report.id}/decision`, "POST", { decision: "rejected", note: "Data realisasi kurang" }, outsider)).status, 403);
      await pool.query("UPDATE users SET role='admin' WHERE id=$1", [ids.outsider]);
      assert.equal((await call(`/approvals/${report.id}/decision`, "POST", { decision: "rejected", note: "Data realisasi kurang" }, outsider)).status, 200);
      const reportDetail = (await call(`/approvals/${report.id}`, "GET", undefined, pm2)).body;
      assert.equal(reportDetail.status, "rejected");
      assert.equal(reportDetail.steps[1].note, "Data realisasi kurang");
      await pool.query("UPDATE users SET role='pm' WHERE id=$1", [ids.outsider]);

      // Finance: contract, BAST gate before invoice, payment updates realised revenue.
      assert.equal((await call(`/projects/${project.id}/contract`, "PUT", { contract_number: "PKS-001", contract_value: 1000000000 }, pm)).status, 200);
      assert.equal((await call(`/projects/${project.id}/contract`, "PUT", { contract_number: "PKS-001", contract_value: 2000000000 }, pm)).status, 403);
      const ms = (await call(`/projects/${project.id}/milestones`, "POST", { name: "Termin 1", percentage: 30, due_date: "2026-11-01", wbs_task_id: taskId }, pm)).body;
      assert.equal(Number(ms.amount), 300000000);
      assert.equal((await call(`/projects/${project.id}/milestones`, "POST", { name: "Termin X", amount: 800000000 }, pm)).status, 400);
      const msBody = { name: "Termin 1", percentage: 30, amount: 300000000, due_date: "2026-11-01", wbs_task_id: taskId, requires_bast: true, invoice_number: "INV-1", invoice_date: "2026-11-05" };
      assert.equal((await call(`/milestones/${ms.id}`, "PUT", msBody, pm)).status, 400);
      const insertDoc = async (name: string) =>
        (await pool.query(
          "INSERT INTO documents(project_id,name,storage_key,mime_type,uploaded_by,status,extracted_data,size_bytes,checksum) VALUES($1,$2,$3,'application/pdf',$4,'needs_review','{}',1,'x') RETURNING id,revision",
          [project.id, name, `${randomUUID()}.pdf`, ids.pm],
        )).rows[0];
      const bast = await insertDoc("BAST Termin 1.pdf");
      const verified = await call(`/documents/${bast.id}/verify`, "PUT", { revision: bast.revision, category: "bast", fields: { document_number: "BAST-01" }, notes: "Sesuai asli", apply: { milestone_id: ms.id } }, pm);
      assert.equal(verified.status, 200, JSON.stringify(verified.body));
      assert.deepEqual(verified.body.applied, ["BAST Termin 1"]);
      const linked = (await call(`/projects/${project.id}/finance`, "GET", undefined, viewer)).body.milestones[0];
      assert.equal(linked.bast_document_id, bast.id);
      assert.equal((await call(`/milestones/${ms.id}`, "PUT", { ...msBody, bast_document_id: bast.id, paid_amount: 400000000, paid_date: "2026-11-10" }, pm)).status, 400);
      assert.equal((await call(`/milestones/${ms.id}`, "PUT", { ...msBody, bast_document_id: bast.id, paid_amount: 300000000, paid_date: "2026-11-10" }, pm)).status, 200);
      assert.equal(Number((await pool.query("SELECT revenue_actual FROM projects WHERE id=$1", [project.id])).rows[0].revenue_actual), 300000000);
      const pks = await insertDoc("PKS.pdf");
      const pksVerify = await call(`/documents/${pks.id}/verify`, "PUT", { revision: pks.revision, category: "pks", fields: { contract_number: "PKS-001", contract_value: "Rp 1.500.000.000", termin_2: "70% setelah BAST akhir" }, notes: "Cek", apply: { contract: true } }, pm);
      assert.equal(pksVerify.status, 403);
      const pksAdmin = await call(`/documents/${pks.id}/verify`, "PUT", { revision: pks.revision, category: "pks", fields: { contract_number: "PKS-001", contract_value: "Rp 1.000.000.000", termin_2: "70% setelah BAST akhir" }, notes: "Cek", apply: { contract: true, milestones: true } }, pm);
      assert.equal(pksAdmin.status, 200, JSON.stringify(pksAdmin.body));
      const finance = (await call(`/projects/${project.id}/finance`, "GET", undefined, pm)).body;
      assert.equal(finance.milestones.length, 2);
      assert.equal(Number(finance.milestones[1].amount), 700000000);
      assert.equal(finance.summary.paid, 300000000);
      assert.equal((await call(`/milestones/${ms.id}`, "DELETE", undefined, pm)).status, 409);

      // Change request: approval applies end date, contract value and a new baseline.
      const cr = (await call(`/projects/${project.id}/change-requests`, "POST", { title: "Perpanjangan migrasi", type: "timeline", reason: "Akses server terlambat dari klien", changes: { new_end_date: "2027-01-31", new_contract_value: 1100000000, rebaseline: true } }, pm2)).body;
      assert.equal(cr.number, "CR-001");
      const crApproval = (await call(`/change-requests/${cr.id}/submit`, "POST", undefined, pm2)).body;
      assert.equal((await call(`/approvals/${crApproval.id}/decision`, "POST", { decision: "approved" }, pm)).status, 200);
      assert.equal((await pool.query("SELECT end_date::text FROM projects WHERE id=$1", [project.id])).rows[0].end_date, "2026-12-31");
      assert.equal((await call(`/approvals/${crApproval.id}/decision`, "POST", { decision: "approved" }, admin)).status, 200);
      const after = (await pool.query("SELECT end_date::text,contract_value FROM projects WHERE id=$1", [project.id])).rows[0];
      assert.equal(after.end_date, "2027-01-31");
      assert.equal(Number(after.contract_value), 1100000000);
      const baselines = (await call(`/projects/${project.id}/baselines`, "GET", undefined, viewer)).body.baselines;
      assert.equal(baselines.length, 2);
      assert.equal(baselines[1].change_number, "CR-001");
      assert.equal((await call(`/projects/${project.id}/change-requests`, "GET", undefined, pm)).body.change_requests[0].status, "approved");
      const cr2 = (await call(`/projects/${project.id}/change-requests`, "POST", { title: "Ganti PM", type: "pic", reason: "Rotasi tim proyek", changes: { new_manager_id: ids.pm2 } }, pm)).body;
      const cr2Approval = (await call(`/change-requests/${cr2.id}/submit`, "POST", undefined, pm)).body;
      assert.equal((await call(`/approvals/${cr2Approval.id}/decision`, "POST", { decision: "rejected", note: "Belum ada pengganti" }, admin)).status, 200);
      assert.equal((await pool.query("SELECT status FROM change_requests WHERE id=$1", [cr2.id])).rows[0].status, "rejected");

      // Meeting decisions become tracked actions; done items need evidence and are not carried forward.
      const meeting = (await call("/meetings", "POST", { title: "Rapat Korporat", date: "2026-11-10", moderator: "Direktur", notulis: "PMO", participants: "Tim", notes: "", project_ids: [project.id] }, pm)).body;
      const [a1, a2] = [randomUUID(), randomUUID()];
      const review = { review: "updated", health: "attention", summary: "Akses server", items: [], actions: [
        { id: a1, text: "Kirim surat eskalasi", pic: "pm", due: "2026-11-12", status: "not_started", side: "internal" },
        { id: a2, text: "Uji koneksi", pic: "pm2", due: "2026-12-20", status: "in_progress", side: "internal" },
      ] };
      assert.equal((await call(`/meetings/${meeting.id}/reviews/${project.id}`, "PUT", { version: 1, review }, pm)).status, 200);
      assert.equal((await call(`/meetings/${meeting.id}/finalize`, "POST", { version: 2 }, pm)).status, 201);
      const items = (await call("/action-items?status=open", "GET", undefined, pm)).body.items;
      assert.equal(items.length, 2);
      // DATE columns must round-trip unchanged regardless of the server time zone.
      assert.equal(items.find((i: { id: string }) => i.id === a1).due, "2026-11-12");
      assert.match(items[0].source_label, /2026-11-10$/);
      assert.equal(items.find((i: { id: string }) => i.id === a2).pic_user_id, ids.pm2);
      assert.equal((await call(`/action-items/${a2}`, "PATCH", { status: "done" }, pm2)).status, 400);
      assert.equal((await call(`/action-items/${a2}`, "PATCH", { status: "done", evidence: "Ping 0% loss, log terlampir" }, pm2)).status, 200);
      assert.equal((await call(`/action-items/${a2}`, "PATCH", { status: "done", evidence: "x" }, viewer)).status, 403);
      assert.equal((await call("/action-items?status=overdue", "GET", undefined, pm)).body.items.length, 1);
      const next = (await call("/meetings", "POST", { title: "Rapat Lanjutan", date: "2026-11-17", moderator: "Direktur", notulis: "PMO", participants: "Tim", notes: "", project_ids: [project.id], previous_id: meeting.id }, pm)).body;
      const carried = (await call(`/meetings/${next.id}`, "GET", undefined, pm)).body.projects[0].review.actions;
      assert.deepEqual(carried.map((a: { id: string }) => a.id), [a1]);

      // Portfolio health, early warning (deduplicated), and workload scope.
      const health = (await call("/portfolio/health", "GET", undefined, pm)).body;
      assert.equal(health.projects.length, 1);
      const codes = health.projects[0].warnings.map((w: { code: string }) => w.code);
      assert.ok(codes.includes("actions_overdue"), codes.join());
      assert.ok(codes.includes("behind"), codes.join());
      assert.equal(health.projects[0].rag, "red");
      assert.equal((await call("/portfolio/health", "GET", undefined, outsider)).body.projects.length, 0);
      const first = await runEarlyWarning(pool);
      assert.ok(first.notifications > 0);
      assert.equal((await runEarlyWarning(pool)).notifications, 0);
      const notes = (await call("/notifications", "GET", undefined, pm)).body;
      assert.ok(notes.unread > 0);
      assert.equal((await call("/notifications/read-all", "POST", undefined, pm)).status, 200);
      assert.equal((await call("/notifications", "GET", undefined, pm)).body.unread, 0);
      const all = (await call("/resources/workload", "GET", undefined, admin)).body;
      assert.equal(all.scope, "all");
      assert.equal(all.people.find((p: { name: string }) => p.name === "pm").managed.length, 1);
      const self = (await call("/resources/workload", "GET", undefined, pm2)).body;
      assert.deepEqual(self.people.map((p: { name: string }) => p.name), ["pm2"]);
      assert.equal(self.people[0].load, 0.5);
      assert.equal((await call(`/admin/users/${ids.pm}/capacity`, "PATCH", { capacity: 1 }, pm)).status, 403);
      assert.equal((await call(`/admin/users/${ids.pm}/capacity`, "PATCH", { capacity: 1 }, admin)).status, 200);

      // Assistant (rule mode) answers from accessible data only.
      const answer = (await call("/assistant/ask", "POST", { question: "Apa blocker proyek BTN?" }, pm)).body;
      assert.equal(answer.mode, "rules");
      assert.match(answer.answer, /Akses server belum diberikan/);
      assert.match((await call("/assistant/ask", "POST", { question: "Proyek mana yang berisiko terlambat bulan ini?" }, pm)).body.answer, /GOV-1/);
      assert.doesNotMatch((await call("/assistant/ask", "POST", { question: "Ringkas progres minggu ini" }, outsider)).body.answer, /GOV-1/);

      // Closure: checklist gate, approval, project completed, lessons searchable by everyone.
      const closure = (await call(`/projects/${project.id}/closure`, "GET", undefined, pm)).body.closure;
      const lesson = { id: randomUUID(), category: "stakeholder", title: "Minta akses server sejak kickoff", insight: "Akses klien terlambat tiga minggu", recommendation: "Masukkan akses ke checklist kickoff", tags: "akses,klien" };
      assert.equal((await call(`/projects/${project.id}/closure`, "PUT", { ...closure, lessons: [lesson] }, pm)).status, 200);
      assert.equal((await call(`/projects/${project.id}/closure/submit`, "POST", undefined, pm)).status, 400);
      const done = { version: 1, checklist: closure.checklist.map((i: object) => ({ ...i, done: true })), handover: { recipient: "Tim Operasional BTN", date: "2026-12-30", notes: "" }, lessons: [lesson], summary: "Proyek selesai" };
      assert.equal((await call(`/projects/${project.id}/closure`, "PUT", done, pm)).status, 200);
      const closeApproval = (await call(`/projects/${project.id}/closure/submit`, "POST", undefined, pm)).body;
      assert.equal((await call(`/projects/${project.id}/closure`, "PUT", { ...done, version: 2 }, pm)).status, 409);
      assert.equal((await call(`/approvals/${closeApproval.id}/decision`, "POST", { decision: "approved" }, admin)).status, 200);
      const closed = (await pool.query("SELECT status,closed_at FROM projects WHERE id=$1", [project.id])).rows[0];
      assert.equal(closed.status, "completed");
      assert.ok(closed.closed_at);
      const kb = (await call("/knowledge?q=akses", "GET", undefined, outsider)).body;
      assert.equal(kb.lessons.length, 1);
      assert.equal(kb.lessons[0].lesson.title, lesson.title);
      assert.equal(kb.documents.length, 0);
    } finally {
      await app.close();
      await pool.end();
      assert.match(schema, /^test_[a-f0-9]{32}$/);
      await database.query(`DROP SCHEMA ${schema} CASCADE`);
      await database.end();
    }
  },
);
