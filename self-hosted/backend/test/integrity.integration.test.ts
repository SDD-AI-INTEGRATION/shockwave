import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import argon2 from "argon2";
import { createApp } from "../src/app.js";
import { migrate } from "../src/migrate.js";

test("Regression: finance, document references and closure integrity", { skip: !process.env.DATABASE_URL }, async (t) => {
  process.env.ASSISTANT_AI = "off";
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  const database = new Pool({ connectionString: process.env.DATABASE_URL });
  await database.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, options: `-c search_path=${schema},public` });
  const app = await createApp(pool);
  try {
    await migrate(pool);
    const password = randomUUID() + "Aa1!";
    const hash = await argon2.hash(password);
    const ids: Record<string, string> = {};
    for (const [name, role] of [["admin", "admin"], ["manager", "pm"], ["member", "pm"]]) {
      ids[name] = (await pool.query("INSERT INTO users(email,name,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id", [`${name}@integrity.test`, name, hash, role])).rows[0].id;
    }
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl(), origin = process.env.APP_ORIGIN || "http://localhost:3000";
    const cookies: Record<string, string> = {};
    for (const name of Object.keys(ids)) {
      const response = await fetch(base + "/api/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ email: `${name}@integrity.test`, password }) });
      assert.equal(response.status, 200);
      cookies[name] = response.headers.get("set-cookie")!.split(";")[0];
    }
    const call = async (path: string, method = "GET", body?: unknown, who = "manager") => {
      const response = await fetch(base + "/api" + path, { method, headers: { Origin: origin, Cookie: cookies[who], "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, body: await response.json() };
    };
    const project = async () => {
      const result = await call("/projects", "POST", { code: "CHECK-" + randomUUID().slice(0, 8), name: "Isolated integrity fixture", customer: "Synthetic", status: "active", start_date: "2026-10-01", end_date: "2027-01-31" });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      const id = result.body.id;
      await call(`/projects/${id}/members`, "POST", { user_id: ids.member });
      assert.equal((await call(`/projects/${id}/contract`, "PUT", { contract_number: "TEST-1000", contract_value: 1000 })).status, 200);
      return id as string;
    };
    const document = async (projectId: string, category = "pks", status = "needs_review") => (await pool.query("INSERT INTO documents(project_id,name,storage_key,mime_type,uploaded_by,status,category,extracted_data,size_bytes,checksum) VALUES($1,'Synthetic.pdf',$2,'application/pdf',$3,$4,$5,'{}',1,'x') RETURNING id,revision", [projectId, `${randomUUID()}.pdf`, ids.manager, status, category])).rows[0];
    const verify = (doc: { id: string; revision: number }, fields: Record<string, string>, apply: object, who = "manager", category = "pks") => call(`/documents/${doc.id}/verify`, "PUT", { revision: doc.revision, category, fields, notes: "Synthetic regression check", apply }, who);

    await t.test("OCR rejects excess terms atomically, including concurrent verification", async () => {
      const id = await project();
      await call(`/projects/${id}/milestones`, "POST", { name: "Existing term", amount: 600 });
      const doc = await document(id);
      assert.equal((await verify(doc, { termin_1: "50% after delivery" }, { milestones: true })).status, 400);
      assert.equal((await call(`/documents/${doc.id}`)).body.status, "needs_review");
      assert.equal((await call(`/projects/${id}/finance`)).body.milestones.length, 1);
      const concurrentId = await project();
      const a = await document(concurrentId), b = await document(concurrentId);
      const results = await Promise.all([a, b].map(d => verify(d, { termin_1: "60% after BAST" }, { milestones: true })));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
      assert.equal((await call(`/projects/${concurrentId}/finance`)).body.milestones.length, 1);
    });

    await t.test("OCR contract permissions match manual contract permissions", async () => {
      const id = await project();
      const doc = await document(id);
      assert.equal((await verify(doc, { contract_number: "REPLACED-BY-MEMBER" }, { contract: true }, "member")).status, 403);
      assert.equal((await call(`/projects/${id}/finance`)).body.contract.contract_number, "TEST-1000");
      assert.equal((await verify(doc, { contract_value: "Rp 1000" }, { contract: true }, "admin", "bast")).status, 400);
    });

    await t.test("Contract reductions cannot make existing terms exceed the contract", async () => {
      const id = await project();
      await call(`/projects/${id}/milestones`, "POST", { name: "Existing term", amount: 800 });
      assert.equal((await call(`/projects/${id}/contract`, "PUT", { contract_number: "LOW", contract_value: 700 }, "admin")).status, 400);
      const doc = await document(id);
      assert.equal((await verify(doc, { contract_value: "Rp 700" }, { contract: true }, "admin")).status, 400);
      const cr = (await call(`/projects/${id}/change-requests`, "POST", { title: "Reduce contract", type: "cost", reason: "Synthetic reduction check", changes: { new_contract_value: 700 } })).body;
      const approval = (await call(`/change-requests/${cr.id}/submit`, "POST")).body;
      assert.equal((await call(`/approvals/${approval.id}/decision`, "POST", { decision: "approved" }, "admin")).status, 400);
      assert.equal((await call(`/approvals/${approval.id}`)).body.status, "pending");
      assert.equal(Number((await call(`/projects/${id}/finance`)).body.contract.contract_value), 1000);
    });

    await t.test("Milestones require their own WBS task and a verified invoice", async () => {
      const id = await project();
      assert.equal((await call(`/projects/${id}/milestones`, "POST", { name: "Bad task", amount: 100, wbs_task_id: randomUUID() })).status, 400);
      const invoice = await document(id, "invoice");
      assert.equal((await call(`/projects/${id}/milestones`, "POST", { name: "Unverified invoice", amount: 100, requires_bast: false, invoice_document_id: invoice.id, invoice_number: "INV-1", invoice_date: "2026-11-17" })).status, 400);
      assert.equal((await call(`/projects/${id}/milestones`, "POST", { name: "Invoice without date", amount: 100, requires_bast: false, invoice_number: "INV-1" })).status, 400);
    });

    await t.test("Documents linked to billing, approval or evidence cannot be deleted", async () => {
      const id = await project();
      const bast = await document(id, "bast", "verified");
      assert.equal((await call(`/projects/${id}/milestones`, "POST", { name: "Protected BAST", amount: 100, bast_document_id: bast.id })).status, 201);
      assert.equal((await call(`/documents/${bast.id}`, "DELETE")).status, 409);
      const reviewed = await document(id, "report", "verified");
      assert.equal((await call("/approvals", "POST", { kind: "document", project_id: id, document_id: reviewed.id })).status, 201);
      assert.equal((await call(`/documents/${reviewed.id}`, "DELETE")).status, 409);
      const evidence = await document(id, "report", "verified");
      const action = (await call("/action-items", "POST", { project_id: id, text: "Evidence fixture", pic: "manager", due: "2026-11-17" })).body;
      assert.equal((await call(`/action-items/${action.id}`, "PATCH", { status: "done", evidence_document_id: evidence.id })).status, 200);
      assert.equal((await call(`/documents/${evidence.id}`, "DELETE")).status, 409);
      const unused = await document(id);
      assert.equal((await call(`/documents/${unused.id}`, "DELETE")).status, 200);
    });

    await t.test("Closure cannot omit, duplicate or downgrade mandatory checklist items", async () => {
      const id = await project();
      const closure = (await call(`/projects/${id}/closure`)).body.closure;
      const body = { ...closure, lessons: [{ id: randomUUID(), category: "technical", title: "Fixture lesson", insight: "Synthetic insight", recommendation: "", tags: "" }], handover: { recipient: "Fixture", date: "2026-11-17", notes: "" } };
      assert.equal((await call(`/projects/${id}/closure`, "PUT", { ...body, checklist: [] })).status, 400);
      assert.equal((await call(`/projects/${id}/closure`, "PUT", { ...body, checklist: closure.checklist.map((i: object) => ({ ...i, required: false, done: true })) })).status, 400);
      assert.equal((await call(`/projects/${id}/closure`, "PUT", { ...body, checklist: [...closure.checklist, closure.checklist[0]] })).status, 400);
      assert.equal((await call(`/projects/${id}/closure`, "PUT", body)).status, 200);
      assert.equal((await call(`/projects/${id}/closure/submit`, "POST")).status, 400);
    });

    await t.test("Concurrent first saves of a closure retain version conflict detection", async () => {
      const id = await project();
      const closure = (await call(`/projects/${id}/closure`)).body.closure;
      const results = await Promise.all([1, 2].map(n => call(`/projects/${id}/closure`, "PUT", { ...closure, summary: `Concurrent ${n}` })));
      assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
      assert.equal((await call(`/projects/${id}/closure`)).body.closure.version, 1);
    });
  } finally {
    await app.close();
    await pool.end();
    assert.match(schema, /^test_[a-f0-9]{32}$/);
    await database.query(`DROP SCHEMA ${schema} CASCADE`);
    await database.end();
  }
});
