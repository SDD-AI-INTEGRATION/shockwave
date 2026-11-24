import { createDecipheriv, scryptSync, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, open, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { backupKey, checksum, docker } from "./backup.mjs";
export async function command(args) {
  const p = docker(args, { stdio: ["ignore", "pipe", "pipe"] });
  let out = "",
    err = "";
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  await new Promise((ok, fail) => {
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(err || out))));
  });
  return out;
}
export async function decryptTo(file, args, password) {
  const handle = await open(file, "r");
  const info = await handle.stat();
  const header = Buffer.alloc(35),
    tag = Buffer.alloc(16);
  await handle.read(header, 0, 35, 0);
  await handle.read(tag, 0, 16, info.size - 16);
  await handle.close();
  if (header.subarray(0, 7).toString() !== "PMOBKP1")
    throw new Error("Invalid encrypted backup");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    scryptSync(password, header.subarray(7, 23), 32),
    header.subarray(23, 35),
  );
  decipher.setAuthTag(tag);
  const p = docker(args, { stdio: ["pipe", "pipe", "pipe"] });
  let err = "";
  p.stdout.resume();
  p.stderr.on("data", (v) => (err += v));
  const exit = new Promise((ok, fail) => {
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(err))));
  });
  await Promise.all([
    pipeline(
      createReadStream(file, { start: 35, end: info.size - 17 }),
      decipher,
      p.stdin,
    ),
    exit,
  ]);
}
export async function restoreDrill(directory) {
  const password = backupKey(),
    manifest = JSON.parse(
      await readFile(join(directory, "manifest.json"), "utf8"),
    );
  for (const key of ["database", "documents"])
    if ((await checksum(join(directory, `${key}.enc`))) !== manifest[key])
      throw new Error(`Checksum mismatch: ${key}`);
  const project = `shockwave-restore-${randomBytes(6).toString("hex")}`;
  if (!/^shockwave-restore-[a-f0-9]{12}$/.test(project))
    throw new Error("Unsafe restore project");
  process.env.RESTORE_PASSWORD = randomBytes(24).toString("hex");
  const prefix = [
    "compose",
    "-p",
    project,
    "-f",
    "deploy/compose.restore.yaml",
  ];
  try {
    await command([...prefix, "up", "-d", "--wait"]);
    await decryptTo(
      join(directory, "database.enc"),
      [
        ...prefix,
        "exec",
        "-T",
        "database",
        "pg_restore",
        "-U",
        "shockwave",
        "-d",
        "shockwave",
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
      ],
      password,
    );
    await decryptTo(
      join(directory, "documents.enc"),
      [
        ...prefix,
        "exec",
        "-T",
        "files",
        "tar",
        "-C",
        "/app/storage/documents",
        "-xf",
        "-",
      ],
      password,
    );
    const verify = `import pg from 'pg';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';const p=new pg.Pool({connectionString:process.env.DATABASE_URL});try{const rows=(await p.query('SELECT storage_key,checksum FROM documents')).rows;for(const d of rows){if(!/^[a-f0-9-]{36}\\.(pdf|png|jpg)$/.test(d.storage_key))throw Error('Unsafe key');if(createHash('sha256').update(await readFile('/app/storage/documents/'+d.storage_key)).digest('hex')!==d.checksum)throw Error('Document mismatch');}const counts=(await p.query('SELECT (SELECT count(*) FROM users) AS users,(SELECT count(*) FROM projects) AS projects,(SELECT count(*) FROM documents) AS documents')).rows[0];console.log(JSON.stringify({passed:true,counts,files_verified:rows.length}));}finally{await p.end();}`;
    const report = JSON.parse(
      (
        await command([
          ...prefix,
          "exec",
          "-T",
          "files",
          "node",
          "--input-type=module",
          "-e",
          verify,
        ])
      ).trim(),
    );
    await writeFile(
      join(directory, "restore-report.json"),
      JSON.stringify(
        { ...report, checked_at: new Date().toISOString() },
        null,
        2,
      ),
    );
    console.log(
      "Restore drill passed; all referenced document checksums matched.",
    );
    return report;
  } finally {
    await command([...prefix, "down", "-v"]);
    delete process.env.RESTORE_PASSWORD;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  restoreDrill(resolve(process.argv[2] || "")).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
