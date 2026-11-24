import { spawn } from "node:child_process";
import {
  createCipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
export function backupKey() {
  const p = process.env.BACKUP_PASSPHRASE;
  if (!p || p.length < 16)
    throw new Error(
      "BACKUP_PASSPHRASE minimal 16 karakter wajib diisi melalui environment.",
    );
  return p;
}
export async function checksum(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}
export function docker(args, options = {}) {
  return spawn("docker", args, { windowsHide: true, ...options });
}
export async function encryptProcess(args, file, password) {
  const salt = randomBytes(16),
    iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", scryptSync(password, salt, 32), iv),
    output = createWriteStream(file, { flags: "wx", mode: 0o600 });
  output.write(Buffer.concat([Buffer.from("PMOBKP1"), salt, iv]));
  const child = docker(args, { stdio: ["ignore", "pipe", "pipe"] });
  let errors = "";
  child.stderr.on("data", (v) => (errors += v.toString()));
  const exit = new Promise((ok, fail) => {
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0
        ? ok()
        : fail(new Error(`Backup command failed: ${errors.slice(-1000)}`)),
    );
  });
  await Promise.all([
    pipeline(child.stdout, cipher, output, { end: false }),
    exit,
  ]);
  output.end(cipher.getAuthTag());
  await new Promise((ok, fail) => {
    output.once("finish", ok);
    output.once("error", fail);
  });
}
export async function backup(
  directory = resolve(
    "backups",
    new Date().toISOString().replace(/[:.]/g, "-"),
  ),
) {
  const password = backupKey();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await encryptProcess(
    [
      "compose",
      "-f",
      "compose.production.yaml",
      "exec",
      "-T",
      "database",
      "pg_dump",
      "-U",
      "shockwave",
      "-d",
      "shockwave",
      "-Fc",
      "--no-owner",
      "--no-acl",
    ],
    join(directory, "database.enc"),
    password,
  );
  await encryptProcess(
    [
      "compose",
      "-f",
      "compose.production.yaml",
      "exec",
      "-T",
      "backend",
      "tar",
      "-C",
      "/app/storage/documents",
      "-cf",
      "-",
      ".",
    ],
    join(directory, "documents.enc"),
    password,
  );
  const manifest = {
    format: 1,
    created_at: new Date().toISOString(),
    database: await checksum(join(directory, "database.enc")),
    documents: await checksum(join(directory, "documents.enc")),
  };
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600 },
  );
  console.log(`Encrypted backup created: ${directory}`);
  return directory;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  backup(process.argv[2]).catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
