import { spawn } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { loadTest } from "./load-test.mjs";
const base = process.env.SMOKE_ORIGIN || "http://localhost:8080";
const cleanupOnly = process.argv.includes("--cleanup");
const retained = cleanupOnly
  ? JSON.parse(await readFile("artifacts/production-fixture.json", "utf8"))
  : undefined;
const id = retained?.id || randomUUID(),
  password = randomUUID() + randomUUID();
const fixture = resolve(process.env.OCR_FIXTURES || "artifacts/ocr");
async function database(action, projectId) {
  const script = `import pg from 'pg';import argon2 from 'argon2';let raw='';for await(const c of process.stdin)raw+=c;const data=JSON.parse(raw),p=new pg.Pool({connectionString:process.env.DATABASE_URL});try{if(data.action==='setup'){await p.query('INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',[data.id,'uat-'+data.id+'@example.test','Temporary automated UAT',await argon2.hash(data.password,{memoryCost:65536,timeCost:3,parallelism:1}),'admin']);}else if(data.action==='cleanup'){const c=await p.connect();try{await c.query('BEGIN');if(data.projectId){const owner=await c.query('SELECT id FROM projects WHERE id=$1 AND manager_id=$2',[data.projectId,data.id]);if(owner.rowCount){const docs=(await c.query('SELECT storage_key FROM documents WHERE project_id=$1',[data.projectId])).rows;await c.query('DELETE FROM documents WHERE project_id=$1',[data.projectId]);await c.query('DELETE FROM project_modules WHERE project_id=$1',[data.projectId]);await c.query('DELETE FROM progress_updates WHERE project_id=$1',[data.projectId]);await c.query('DELETE FROM project_members WHERE project_id=$1',[data.projectId]);await c.query('DELETE FROM projects WHERE id=$1',[data.projectId]);const{unlink}=await import('node:fs/promises');for(const d of docs)if(/^[a-f0-9-]{36}\\.(pdf|png|jpg)$/.test(d.storage_key))await unlink('/app/storage/documents/'+d.storage_key).catch(()=>{});}}await c.query('DELETE FROM audit_logs WHERE user_id=$1',[data.id]);await c.query('DELETE FROM users WHERE id=$1',[data.id]);await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}}finally{await p.end();}`;
  const p = spawn(
    "docker",
    [
      "compose",
      "-f",
      "compose.production.yaml",
      "exec",
      "-T",
      "backend",
      "node",
      "--input-type=module",
      "-e",
      script,
    ],
    { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  let error = "";
  p.stdout.resume();
  p.stderr.on("data", (v) => (error += v));
  p.stdin.end(JSON.stringify({ action, id, password, projectId }));
  await new Promise((ok, fail) => {
    p.on("error", fail);
    p.on("close", (c) => (c === 0 ? ok() : fail(new Error(error))));
  });
}
let projectId = retained?.projectId,
  retain = false,
  created = cleanupOnly;
try {
  if (cleanupOnly) {
    await database("cleanup", projectId);
    created = false;
    console.log("Synthetic fixtures removed.");
    process.exit(0);
  }
  await database("setup");
  created = true;
  const login = await fetch(base + "/api/auth/login", {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `uat-${id}@example.test`, password }),
  });
  if (!login.ok) throw new Error("Production login failed");
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const call = async (path, method = "GET", body) => {
    const r = await fetch(base + "/api" + path, {
      method,
      headers: {
        Origin: base,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(data)}`);
    return data;
  };
  const p = await call("/projects", "POST", {
    code: `UAT-${id.slice(0, 8)}`,
    name: "Synthetic OCR acceptance test",
    customer: "Synthetic fixture",
    start_date: "2026-11-17",
    end_date: "2026-12-17",
  });
  projectId = p.id;
  const results = [];
  for (const [name, mime] of [
    ["bast-text.pdf", "application/pdf"],
    ["bast-scan.png", "image/png"],
    ["bast-scan.pdf", "application/pdf"],
  ]) {
    const start = performance.now(),
      bytes = await readFile(resolve(fixture, name));
    const upload = await fetch(`${base}/api/projects/${projectId}/documents`, {
      method: "POST",
      headers: {
        Origin: base,
        Cookie: cookie,
        "Content-Type": mime,
        "X-File-Name": name,
      },
      body: bytes,
    });
    const document = await upload.json();
    if (!upload.ok)
      throw new Error("Upload failed: " + JSON.stringify(document));
    let detail;
    for (let n = 0; n < 180; n++) {
      detail = await call(`/documents/${document.id}`);
      if (detail.status === "needs_review") break;
      if (detail.status === "failed")
        throw new Error("OCR job failed for " + name);
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (
      detail.status !== "needs_review" ||
      detail.category !== "bast" ||
      !detail.extracted_data.fields.document_number
    )
      throw new Error("OCR extraction failed: " + name);
    const fields = Object.fromEntries(
      Object.entries(detail.extracted_data.fields).map(([k, v]) => [
        k,
        v.value,
      ]),
    );
    await call(`/documents/${document.id}/verify`, "PUT", {
      revision: detail.revision,
      category: "bast",
      fields,
      notes: "Compared with controlled synthetic BAST fixture.",
    });
    const verified = await call(`/documents/${document.id}`);
    if (verified.status !== "verified")
      throw new Error("Verification not persisted");
    const download = await fetch(`${base}/api/documents/${document.id}/file`, {
      headers: { Cookie: cookie },
    });
    if (!Buffer.from(await download.arrayBuffer()).equals(bytes))
      throw new Error("Original document integrity failed");
    results.push({
      name,
      status: verified.status,
      fields: Object.keys(fields),
      elapsed_ms: Math.round(performance.now() - start),
    });
  }
  const search = await call(`/projects/${projectId}/documents?q=BAST`);
  if (search.documents.length !== 3) throw new Error("Full-text search failed");
  const unauthorized = await fetch(
    `${base}/api/documents/${search.documents[0].id}/file`,
  );
  if (unauthorized.status !== 401)
    throw new Error("Private download authorization failed");
  const csrf = await fetch(base + "/api/projects", {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (csrf.status !== 403) throw new Error("Origin guard failed");
  const health = await fetch(base);
  if (
    !health.headers
      .get("content-security-policy")
      ?.includes("object-src 'none'")
  )
    throw new Error("Security headers missing");
  const load = await loadTest(base, cookie);
  if (load.failures || load.p95_ms > 2000)
    throw new Error("Local performance target failed: " + JSON.stringify(load));
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/production-smoke.json",
    JSON.stringify(
      {
        passed: true,
        origin: base,
        documents: results,
        load,
        checked_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  // Keep fixtures only when requested so the backup drill can verify document blobs.
  if (process.env.KEEP_SMOKE_FIXTURES === "true") {
    await writeFile(
      "artifacts/production-fixture.json",
      JSON.stringify({ id, projectId }),
    );
    retain = true;
    console.log(
      "Production smoke passed; fixtures retained for the backup drill.",
    );
  } else console.log("Production smoke passed; synthetic data cleaned up.");
} finally {
  if (created && !retain) await database("cleanup", projectId);
}
