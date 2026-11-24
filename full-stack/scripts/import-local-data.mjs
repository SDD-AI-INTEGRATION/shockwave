import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";

// One-time transfer into an empty deployment; never modifies the source database.
const source = "shockwave-pmo-validation-database-1";
const compose = ["compose", "-f", "compose.production.yaml"];
function processCommand(args, stdin = false) {
  const child = spawn("docker", args, {
    windowsHide: true,
    stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
  });
  let output = "",
    error = "";
  child.stdout.on("data", (chunk) => {
    if (!stdin) output += chunk;
  });
  child.stderr.on("data", (chunk) => (error += chunk));
  const finished = new Promise((ok, fail) => {
    child.on("error", fail);
    child.on("close", (code) =>
      code === 0
        ? ok(output.trim())
        : fail(new Error(error || "Docker command failed")),
    );
  });
  return { child, finished };
}
const label = await processCommand([
  "inspect",
  "--format",
  '{{ index .Config.Labels "com.docker.compose.project" }}',
  source,
]).finished;
if (label !== "shockwave-pmo-validation")
  throw new Error("Source deployment does not match.");
const documents = await processCommand([
  "exec",
  source,
  "psql",
  "-U",
  "shockwave",
  "-d",
  "shockwave",
  "-Atc",
  "SELECT count(*) FROM documents",
]).finished;
if (documents !== "0")
  throw new Error(
    "Source has documents. Use a complete database and storage migration instead.",
  );
const tables = [
  "users",
  "projects",
  "project_members",
  "project_modules",
  "progress_updates",
  "corporate_meetings",
  "corporate_meeting_projects",
  "audit_logs",
];
const target = processCommand(
  [
    ...compose,
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
  ],
  true,
);
const dump = spawn(
  "docker",
  [
    "exec",
    source,
    "pg_dump",
    "-U",
    "shockwave",
    "-d",
    "shockwave",
    "--data-only",
    "--no-owner",
    "--no-acl",
    ...tables.map((table) => "--table=" + table),
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let dumpError = "";
dump.stderr.on("data", (chunk) => (dumpError += chunk));
const dumped = new Promise((ok, fail) => {
  dump.on("error", fail);
  dump.on("close", (code) => (code === 0 ? ok() : fail(new Error(dumpError))));
});
const restored = target.finished;
// Attach the rejection handler before streaming so an early SQL rejection is handled.
restored.catch(() => {});
target.child.stdin.write(
  `BEGIN;\nLOCK TABLE ${tables.join(",")} IN SHARE ROW EXCLUSIVE MODE;\nDO $$ BEGIN IF EXISTS(SELECT 1 FROM users) OR EXISTS(SELECT 1 FROM projects) OR EXISTS(SELECT 1 FROM documents) OR EXISTS(SELECT 1 FROM corporate_meetings) THEN RAISE EXCEPTION 'Target must be empty; no data was imported'; END IF; END $$;\n`,
);
try {
  await Promise.all([
    pipeline(dump.stdout, target.child.stdin, { end: false }),
    dumped,
  ]);
  target.child.stdin.end("\nCOMMIT;\n");
  await restored;
  console.log(
    "Existing local accounts and project data imported. Passwords remain unchanged; sign in again.",
  );
} catch (error) {
  target.child.stdin.end("\nROLLBACK;\n");
  await restored.catch(() => {});
  throw error;
}
