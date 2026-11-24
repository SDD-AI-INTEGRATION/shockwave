import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { privateIPv4 } from "../backend/dist/network.js";

const origin = process.argv[2];
if (
  !origin ||
  new URL(origin).origin !== origin ||
  !privateIPv4(new URL(origin).hostname)
)
  throw Error("Provide the explicit private LAN origin.");
const runtime =
  process.env.PMO_RUNTIME || join(process.env.LOCALAPPDATA, "ShockwavePMO");
const localhostOnly = process.argv.includes("--localhost-only");
const checkAssistant = process.argv.includes("--assistant");
const id = randomUUID(),
  password = randomUUID() + randomUUID();
async function account(action) {
  const code = `import pg from 'pg';import argon2 from 'argon2';let text='';for await(const chunk of process.stdin)text+=chunk;const v=JSON.parse(text),p=new pg.Pool({connectionString:process.env.DATABASE_URL});try{if(v.action==='create'){await p.query('INSERT INTO users(id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5)',[v.id,'lan-'+v.id+'@example.test','LAN smoke fixture',await argon2.hash(v.password,{memoryCost:65536,timeCost:3,parallelism:1}),'viewer']);}else{await p.query('DELETE FROM audit_logs WHERE user_id=$1',[v.id]);await p.query('DELETE FROM users WHERE id=$1',[v.id]);}}finally{await p.end();}`;
  const child = spawn(
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
      code,
    ],
    { cwd: runtime, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  );
  let error = "";
  child.stdout.resume();
  child.stderr.on("data", (value) => (error += value));
  child.stdin.end(JSON.stringify({ action, id, password }));
  await new Promise((ok, fail) => {
    child.on("error", fail);
    child.on("close", (status) => (status === 0 ? ok() : fail(Error(error))));
  });
}
let browser,
  created = false;
try {
  await account("create");
  created = true;
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  const checked = [];
  for (const base of [
    ...(localhostOnly ? [] : [origin]),
    `http://localhost:${new URL(origin).port || 80}`,
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(base);
    await page.getByLabel("Email perusahaan").fill(`lan-${id}@example.test`);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Masuk ke workspace", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Setiap proyek, dalam kendali." })
      .waitFor();
    await page.reload();
    await page
      .getByRole("heading", { name: "Setiap proyek, dalam kendali." })
      .waitFor();
    const cookie = (await context.cookies()).find(
      (value) => value.name === "sw_session",
    );
    if (!cookie?.httpOnly || cookie.secure || cookie.sameSite !== "Strict")
      throw Error("Unexpected LAN session cookie policy.");
    const me = await page.request.get(base + "/api/auth/me");
    if (!me.ok() || (await me.json()).user.id !== id)
      throw Error("LAN session not retained");
    let assistant;
    if (checkAssistant) {
      await page.getByRole('button', {name:'Asisten PMO',exact:true}).click();
      await page.getByRole('heading', {name:'Asisten PMO',exact:true}).waitFor();
      const response = await page.request.get(base + '/api/assistant/status');
      if (!response.ok()) throw Error('Assistant API unavailable');
      const {mode,provider,model} = await response.json();
      if(mode==='ai'){
        if(provider!=='openai')throw Error('Unexpected assistant provider');
        await page.getByText(`AI · OpenAI · ${model}`,{exact:true}).waitFor();
      }
      if (mode === 'rules') {
        await page.getByLabel('Pertanyaan', {exact:true}).fill('Ringkas progres minggu ini');
        await page.getByRole('button', {name:'Tanya',exact:true}).click();
        await page.locator('.pmo-turn .a').waitFor();
      }
      await mkdir('artifacts', {recursive:true});
      await page.screenshot({path:'artifacts/assistant-live-docker.png',fullPage:true});
      assistant = {visible:true,mode,provider,model,question_tested:mode==='rules'};
    }
    const hostile = await page.request.post(base + "/api/auth/logout", {
      headers: { Origin: "https://evil.example" },
    });
    if (hostile.status() !== 403) throw Error("Unlisted origin accepted");
    const logout = await page.request.post(base + "/api/auth/logout", {
      headers: { Origin: base },
    });
    if (!logout.ok()) throw Error("LAN logout rejected");
    const lanLogin = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ email: `lan-${id}@example.test`, password }),
    });
    if (!lanLogin.ok) throw Error("Explicit LAN origin was rejected by login");
    const lanCookie = lanLogin.headers.get("set-cookie").split(";")[0];
    const lanLogout = await fetch(base + "/api/auth/logout", {
      method: "POST",
      headers: { Origin: origin, Cookie: lanCookie },
    });
    if (!lanLogout.ok)
      throw Error("Explicit LAN origin was rejected by logout");
    checked.push({
      origin: base,
      login: true,
      reload: true,
      hostile_origin_rejected: true,
      logout: true,
      assistant,
    });
    await context.close();
  }
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    "artifacts/lan-smoke.json",
    JSON.stringify(
      {
        passed: true,
        lan_network_tested: !localhostOnly,
        lan_origin_checked: true,
        checked,
        checked_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(
    localhostOnly
      ? "Localhost browser and explicit LAN origin policy passed; LAN network access still requires a separate connectivity check."
      : "LAN and localhost browser login, session persistence, Origin guard, and logout passed.",
  );
} finally {
  await browser?.close();
  if (created) await account("cleanup");
}
