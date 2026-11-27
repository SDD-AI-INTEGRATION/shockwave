import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { backupKey, checksum } from "./backup.mjs";
import { command, decryptTo } from "./restore-drill.mjs";

// Recover to new volumes and a separate localhost port. Existing deployment is untouched.
const directory = resolve(process.argv[2] || "");
const project =
  process.argv[3] || `shockwave-recovery-${Date.now().toString(36)}`;
const port = Number(process.argv[4] || 8081);
if (
  !/^shockwave-recovery-[a-z0-9]{4,16}$/.test(project) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw new Error("Invalid recovery project or port.");
const password = backupKey(),
  manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  );
for (const key of ["database", "documents"])
  if ((await checksum(join(directory, `${key}.enc`))) !== manifest[key])
    throw new Error("Backup checksum mismatch: " + key);
const existing = (
  await command([
    "ps",
    "-a",
    "--filter",
    `label=com.docker.compose.project=${project}`,
    "--format",
    "{{.ID}}",
  ])
).trim();
const volumes = (
  await command(["volume", "ls", "--format", "{{.Name}}"])
).split(/\r?\n/);
if (existing || volumes.some((name) => name.startsWith(project + "_")))
  throw new Error("Recovery project already exists. Choose a fresh name.");
const configuration = join(directory, `${project}.env`);
const databasePassword = randomBytes(32).toString("hex");
await writeFile(
  configuration,
  `POSTGRES_PASSWORD=${databasePassword}\nWEB_PORT=${port}\n`,
  { flag: "wx", mode: 0o600 },
);
// Shell variables override --env-file in Compose; keep recovery and its saved config consistent.
process.env.POSTGRES_PASSWORD = databasePassword;
process.env.WEB_PORT = String(port);
const prefix = [
  "compose",
  "--env-file",
  configuration,
  "-p",
  project,
  "-f",
  "compose.production.yaml",
];
let started = false;
try {
  started = true;
  await command([...prefix, "up", "-d", "--wait", "database"]);
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
      "run",
      "--rm",
      "--no-deps",
      "-T",
      "backend",
      "tar",
      "-C",
      "/app/storage/documents",
      "-xf",
      "-",
    ],
    password,
  );
  // A restored environment must not accept old browser sessions.
  await command([
    ...prefix,
    "exec",
    "-T",
    "database",
    "psql",
    "-U",
    "shockwave",
    "-d",
    "shockwave",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    "DELETE FROM sessions; DELETE FROM login_attempts;",
  ]);
  await command([...prefix, "up", "-d", "--wait", "--no-build"]);
  const verify = `import pg from 'pg';import{readFile}from'node:fs/promises';import{createHash}from'node:crypto';const db=new pg.Pool({connectionString:process.env.DATABASE_URL});try{const docs=(await db.query('SELECT storage_key,checksum FROM documents')).rows;for(const doc of docs){if(!/^[a-f0-9-]{36}\\.(pdf|png|jpg)$/.test(doc.storage_key))throw Error('Invalid key');if(createHash('sha256').update(await readFile('/app/storage/documents/'+doc.storage_key)).digest('hex')!==doc.checksum)throw Error('Original checksum mismatch');}console.log(JSON.stringify({files_verified:docs.length,users:Number((await db.query('SELECT count(*) FROM users')).rows[0].count),projects:Number((await db.query('SELECT count(*) FROM projects')).rows[0].count)}));}finally{await db.end();}`;
  const counts = JSON.parse(
    await command([
      ...prefix,
      "exec",
      "-T",
      "backend",
      "node",
      "--input-type=module",
      "-e",
      verify,
    ]),
  );
  const report = {
    passed: true,
    project,
    origin: `http://localhost:${port}`,
    configuration,
    ...counts,
    checked_at: new Date().toISOString(),
  };
  await writeFile(
    join(directory, `${project}-report.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(
    `Recovery ready: ${report.origin}\nConfiguration: ${configuration}\nSign in with the account from the backup.`,
  );
} catch (error) {
  if (started) await command([...prefix, "down", "-v"]).catch(() => {});
  throw error;
}
