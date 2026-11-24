import { chromium } from "playwright";
import { Pool } from "pg";
import argon2 from "argon2";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { createApp } from "../backend/dist/app.js";
import { migrate } from "../backend/dist/migrate.js";

dotenv.config({ path: resolve("backend/.env"), quiet: true });
if (!process.env.DATABASE_URL)
  throw new Error("DATABASE_URL diperlukan untuk tes browser.");
const webPort=Number(process.env.TEST_WEB_PORT||3000),apiPort=Number(process.env.TEST_API_PORT||4000),webOrigin=`http://localhost:${webPort}`;
process.env.APP_ORIGIN = webOrigin;
process.env.ASSISTANT_AI = 'off';
const schema = `test_${randomUUID().replaceAll("-", "")}`;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  options: `-c search_path=${schema},public`,
});
let app, web, browser, page;
const errors = [];
try {
  await db.query(`CREATE SCHEMA ${schema}`);
  await migrate(pool);
  const password = randomUUID() + randomUUID();
  await pool.query(
    `INSERT INTO users(email,name,password_hash,role) VALUES('qa@example.test','QA Manager',$1,'admin')`,
    [
      await argon2.hash(password, {
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      }),
    ],
  );
  app = await createApp(pool);
  await app.listen(apiPort, "127.0.0.1");
  web = spawn(
    process.execPath,
    [resolve("node_modules/next/dist/bin/next"), "start", "-p", String(webPort)],
    {
      cwd: resolve("frontend"),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env:{...process.env,NODE_ENV:'production'},
    },
  );
  let webError = "";
  web.stderr.on("data", (v) => (webError += v.toString()));
  web.on("error", (e) => {
    webError = e.message;
  });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (web.exitCode !== null) throw new Error(`Frontend gagal: ${webError}`);
    try {
      if ((await fetch(webOrigin)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error("Frontend belum siap.");
  browser = await chromium.launch({
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: true,
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500)
      errors.push(`API ${response.status()} ${response.url()}`);
  });
  await page.goto(webOrigin);
  await page.getByRole("heading", { name: "Masuk ke workspace" }).waitFor();
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/login-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Email perusahaan").fill("qa@example.test");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page
    .getByRole("button", { name: "Masuk ke workspace", exact: true })
    .click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Email atau password salah." })
    .waitFor();
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Masuk ke workspace", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Setiap proyek, dalam kendali." })
    .waitFor();
  await page
    .getByRole("button", { name: "Ciutkan sidebar", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      document.querySelector(".sidebar").getBoundingClientRect().width <= 100,
  );
  await page
    .getByRole("button", { name: "Perluas sidebar", exact: true })
    .click();
  await page.getByRole("button", { name: "Proyek baru", exact: true }).click();
  await page.getByLabel("Nama proyek").fill("Implementasi Core Banking");
  await page.getByLabel("Kode proyek").fill("QA-001");
  await page.getByLabel("Pelanggan", { exact: true }).fill("Bank Mitra");
  await page.getByLabel("Tanggal mulai").fill("2026-11-17");
  await page.getByLabel("Target selesai").fill("2026-12-17");
  await page.getByLabel("Status proyek").selectOption("active");
  await page.getByRole("button", { name: "Buat proyek", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Detail Implementasi Core Banking",
      exact: true,
    })
    .click();
  await page.getByRole("slider").fill("45");
  await page.getByRole("button", { name: "Simpan progres" }).click();
  await page.getByText("45%", { exact: true }).first().waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Setiap proyek, dalam kendali." })
    .waitFor();
  await page.getByText("45%", { exact: true }).first().waitFor();
  await page.screenshot({
    path: "artifacts/dashboard-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Timeline", exact: true }).click();
  await page.getByRole("heading", { name: "Timeline proyek" }).waitFor();
  await page.getByText("45% terealisasi").waitFor();
  // Prototype feature regression checks use only the isolated fixture schema.
  await page.getByRole("button", { name: "WBS", exact: true }).click();
  await page
    .getByRole("button", { name: "Terapkan template", exact: true })
    .click();
  await page.getByLabel("Nama aktivitas 1", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Simpan operasi", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Perubahan tersimpan" })
    .waitFor();
  await page
    .getByRole("button", { name: "Simpan baseline", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Baseline tersimpan", exact: true })
    .waitFor();
  const workbookEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor", exact: true }).click();
  const workbook = await workbookEvent;
  await workbook.saveAs("artifacts/operations-roundtrip.xlsx");
  const { default: readExcel } = await import("read-excel-file/node");
  const sheets = await readExcel(
    resolve("artifacts/operations-roundtrip.xlsx"),
  );
  if (
    !sheets.some((s) => s.sheet === "WBS") ||
    !sheets.some((s) => s.sheet === "Actual")
  )
    throw new Error("Operations export is missing required sheets.");
  await page
    .getByLabel("Impor Operations", { exact: true })
    .setInputFiles("artifacts/operations-roundtrip.xlsx");
  await page
    .getByRole("status")
    .filter({ hasText: "Perubahan belum disimpan" })
    .waitFor();
  await page
    .getByRole("button", { name: "Simpan operasi", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Perubahan tersimpan" })
    .waitFor();
  await page.getByRole("button", { name: "Timeline WBS", exact: true }).click();
  await page
    .getByRole("heading", { name: "Timeline WBS", exact: true })
    .waitFor();
  await page.getByRole("columnheader", { name: "W0", exact: true }).waitFor();
  await page.getByLabel('Dependency Analisis & desain',{exact:true}).selectOption({label:'Inisiasi'});
  await page.getByRole('button',{name:'Susun jadwal dependency',exact:true}).click();
  await page.getByRole('button',{name:'Simpan operasi',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Perubahan tersimpan'}).waitFor();
  const persistedOperations=(await pool.query("SELECT data FROM project_modules WHERE kind='operations'")).rows[0].data;
  if(persistedOperations.phases[1].tasks[0].dependencies.length!==1)throw Error('Dependency was not persisted');
  await page.screenshot({
    path: "artifacts/wbs-timeline-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Laporan", exact: true }).click();
  await page.getByLabel("Realisasi Inisiasi", { exact: true }).fill("40");
  await page
    .getByLabel("Catatan laporan", { exact: true })
    .fill("Catatan laporan pengujian.");
  await page.getByRole("button", { name: "Kendala", exact: true }).click();
  await page
    .getByLabel("Uraian kendala", { exact: true })
    .fill("Menunggu akses UAT");
  await page
    .getByLabel("Tindakan", { exact: true })
    .fill("Koordinasi dengan pelanggan");
  await page
    .getByRole("button", { name: "Terapkan kendala", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simpan operasi", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Perubahan tersimpan" })
    .waitFor();
  await page
    .getByRole("button", { name: "Risk Register", exact: true })
    .click();
  await page.getByLabel("Prepared by", { exact: true }).fill("QA Manager");
  await page.getByLabel("Tanggal register", { exact: true }).fill("2026-11-17");
  await page.getByRole("button", { name: "Risiko", exact: true }).click();
  await page
    .getByLabel("Identifikasi risiko", { exact: true })
    .fill("Keterlambatan persetujuan UAT");
  await page
    .getByLabel("Risk response plan", { exact: true })
    .fill("Jadwalkan review dan eskalasi");
  await page
    .getByRole("button", { name: "Terapkan risiko", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Simpan register", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Perubahan tersimpan" })
    .waitFor();
  const assistant = page.locator("details.pmo-assistant");
  await assistant.locator("summary").click();
  await assistant.getByRole("button", { name: "Risiko", exact: true }).click();
  await assistant
    .getByRole("status")
    .filter({ hasText: "Keterlambatan persetujuan UAT" })
    .waitFor();
  const printEvent = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Cetak / PDF", exact: true }).click();
  const printPreview = await printEvent;
  await printPreview
    .getByRole("heading", {
      name: "Risk Assessment — Risk Register",
      exact: true,
    })
    .waitFor();
  await printPreview.close();
  const wordEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Word", exact: true }).click();
  const word = await wordEvent;
  await word.saveAs("artifacts/risk-register.docx");
  const excelEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excel", exact: true }).click();
  const riskExcel = await excelEvent;
  await riskExcel.saveAs("artifacts/risk-register.xlsx");
  if (!(await readExcel(resolve("artifacts/risk-register.xlsx"))).length)
    throw new Error("Risk workbook is empty.");
  await page.screenshot({
    path: "artifacts/risk-register-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "PM Assignment", exact: true })
    .click();
  await page.getByLabel("Penandatangan", { exact: true }).fill("Manager PMO");
  await page.getByLabel("Unit PM", { exact: true }).fill("Delivery");
  await page.getByRole("button", { name: "Simpan surat", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Perubahan tersimpan" })
    .waitFor();
  await page.getByRole("button", { name: "MOM", exact: true }).click();
  await page
    .getByLabel("Tujuan rapat", { exact: true })
    .fill("Review implementasi");
  await page.getByLabel("Nama notulis", { exact: true }).fill("QA Manager");
  await page.getByLabel("Diketahui oleh", { exact: true }).fill("Manager PMO");
  await page
    .getByLabel("Hasil rapat saat ini", { exact: true })
    .fill("Rencana dan risiko telah direview.");
  await page
    .getByRole("button", { name: "Simpan notulen", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Perubahan tersimpan" })
    .waitFor();
  await page
    .getByRole("button", { name: "Corporate Meeting", exact: true })
    .click();
  await page.getByRole("button", { name: "Buat rapat", exact: true }).click();
  await page
    .getByLabel("Judul rapat", { exact: true })
    .fill("Review portofolio QA");
  await page.getByLabel("Tanggal rapat", { exact: true }).fill("2026-11-23");
  await page.getByLabel("Moderator", { exact: true }).fill("Manager PMO");
  await page.getByLabel("Notulis", { exact: true }).fill("QA Manager");
  await page
    .getByLabel("Peserta rapat", { exact: true })
    .fill("PMO dan Project Manager");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Buat rapat", exact: true })
    .click();
  await page
    .getByLabel("Status review", { exact: true })
    .selectOption("updated");
  await page
    .getByLabel("Ringkasan pembaruan", { exact: true })
    .fill("Implementasi telah direview.");
  await page
    .getByRole("button", { name: "Simpan review proyek", exact: true })
    .click();
  await page.getByRole("button", { name: "Finalisasi", exact: true }).click();
  await page.getByText(/Final \/ terkunci/).waitFor();
  await page
    .getByRole("button", { name: "Pratinjau dokumen", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Summary & Memo — Corporate Meeting",
      exact: true,
    })
    .waitFor();
  await page.screenshot({
    path: "artifacts/corporate-meeting-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();

  await page.getByRole('button',{name:'Asisten PMO',exact:true}).click();
  await page.getByRole('heading',{name:'Asisten PMO',exact:true}).waitFor();
  await page.getByText('Mode aturan lokal',{exact:true}).waitFor();
  await page.getByLabel('Pertanyaan',{exact:true}).fill('Ringkas progres minggu ini');
  await page.getByRole('button',{name:'Tanya',exact:true}).click();
  await page.locator('.pmo-turn .a').filter({hasText:'QA-001'}).waitFor();
  await page.screenshot({path:'artifacts/assistant-desktop.png',fullPage:true});
  // Exercise AI and quota-error presentation without sending fixture data to a paid API.
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();
  await page.route('**/api/assistant/status',route=>route.fulfill({json:{mode:'ai',provider:'openai',model:'gpt-6-luna'}}));
  await page.route('**/api/assistant/ask',route=>route.fulfill({json:{answer:'QA-001: ringkasan sintetis.',mode:'ai',provider:'openai',model:'gpt-6-luna',sources:['QA-001']}}));
  await page.getByRole('button',{name:'Asisten PMO',exact:true}).click();
  await page.getByText('AI · OpenAI · gpt-6-luna',{exact:true}).waitFor();
  await page.getByLabel('Pertanyaan',{exact:true}).fill('Ringkas progres minggu ini');
  await page.getByRole('button',{name:'Tanya',exact:true}).click();
  await page.getByText(/Dijawab OpenAI · gpt-6-luna/).waitFor();
  await page.unroute('**/api/assistant/ask');
  await page.route('**/api/assistant/ask',route=>route.fulfill({json:{answer:'Ringkasan lokal sintetis.',mode:'rules',provider:'openai',fallback_reason:'saldo atau kuota OpenAI API tidak mencukupi',sources:['QA-001']}}));
  await page.getByLabel('Pertanyaan',{exact:true}).fill('Ringkas progres minggu ini');
  await page.getByRole('button',{name:'Tanya',exact:true}).click();
  await page.getByText('Mode lokal · OpenAI belum tersedia',{exact:true}).waitFor();
  await page.getByRole('status').filter({hasText:'Jawaban lokal digunakan karena saldo'}).waitFor();
  await page.screenshot({path:'artifacts/openai-quota-fallback.png',fullPage:true});
  await page.unroute('**/api/assistant/status');await page.unroute('**/api/assistant/ask');
  await page.getByRole('button',{name:'Administrasi',exact:true}).click();
  await page.getByRole('heading',{name:'Status layanan',exact:true}).waitFor();
  await page.getByRole('button',{name:'Pengguna baru',exact:true}).click();
  const tempPassword=randomUUID()+randomUUID(),newPassword=randomUUID()+randomUUID();
  await page.getByLabel('Nama pengguna',{exact:true}).fill('QA Additional PM');
  await page.getByLabel('Email pengguna',{exact:true}).fill('newpm@example.test');
  await page.getByLabel('Role',{exact:true}).selectOption('pm');
  await page.getByLabel('Password sementara (minimal 12 karakter)',{exact:true}).fill(tempPassword);
  await page.getByRole('button',{name:'Simpan pengguna',exact:true}).click();
  await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByText('newpm@example.test',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Pengaturan proyek',exact:true}).click();
  await page.getByLabel('Tambah anggota',{exact:true}).selectOption({label:'QA Additional PM · pm'});
  await page.getByRole('button',{name:'Tambahkan anggota',exact:true}).click();
  await page.getByText('QA Additional PM · pm',{exact:true}).first().waitFor();
  const other=await browser.newContext(),otherPage=await other.newPage();
  await otherPage.goto(webOrigin);
  await otherPage.getByLabel('Email perusahaan').fill('newpm@example.test');
  await otherPage.getByLabel('Password',{exact:true}).fill(tempPassword);
  await otherPage.getByRole('button',{name:'Masuk ke workspace',exact:true}).click();
  await otherPage.getByRole('heading',{name:'Ganti password',exact:true}).waitFor();
  await otherPage.getByLabel('Password saat ini',{exact:true}).fill(tempPassword);
  await otherPage.getByLabel('Password baru',{exact:true}).fill(newPassword);
  await otherPage.getByLabel('Konfirmasi password baru',{exact:true}).fill(newPassword);
  await otherPage.getByRole('button',{name:'Simpan password dan masuk kembali',exact:true}).click();
  await otherPage.getByRole('heading',{name:'Masuk ke workspace'}).waitFor();
  await otherPage.getByLabel('Email perusahaan').fill('newpm@example.test');
  await otherPage.getByLabel('Password',{exact:true}).fill(newPassword);
  await otherPage.getByRole('button',{name:'Masuk ke workspace',exact:true}).click();
  await otherPage.getByRole('heading',{name:'Setiap proyek, dalam kendali.'}).waitFor();
  if(await otherPage.getByRole('button',{name:'Administrasi',exact:true}).count())throw Error('PM can see admin navigation');
  await other.close();
  await page.getByRole('button',{name:'Dokumen & OCR',exact:true}).click();
  await page.getByRole('heading',{name:'Dokumen & OCR',exact:true}).waitFor();
  await page.getByLabel('File dokumen',{exact:true}).setInputFiles({name:'fixture.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\\nSynthetic API browser upload fixture')});
  await page.getByRole('button',{name:'fixture.pdf',exact:true}).waitFor();
  const docId=(await pool.query('SELECT id FROM documents LIMIT 1')).rows[0].id;
  await pool.query("UPDATE documents SET status='needs_review',revision=1,category='bast',raw_text='BAST Browser Fixture',extracted_data=$1 WHERE id=$2",[JSON.stringify({fields:{document_number:{value:'BAST-001',page:1,box:null,confidence:null}},lines:[{text:'Nomor BAST: BAST-001',page:1,confidence:null}]}),docId]);
  await page.getByRole('button',{name:'Muat ulang hasil',exact:true}).click();
  await page.getByLabel('document_number',{exact:true}).fill('BAST-001-VERIFIED');
  await page.getByLabel('Catatan verifikasi',{exact:true}).fill('Checked synthetic source in automated browser test');
  await page.getByRole('button',{name:'Sahkan verifikasi',exact:true}).click();
  await page.getByText('Terverifikasi',{exact:true}).first().waitFor();
  await page.getByLabel('Cari nama atau isi dokumen',{exact:true}).fill('Browser Fixture');
  await page.getByRole('button',{name:'fixture.pdf',exact:true}).waitFor();
  await page.screenshot({path:'artifacts/document-center-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector(".sidebar").getBoundingClientRect().right <= 0,
  );
  await page.screenshot({
    path: "artifacts/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await page.getByRole("button", { name: "Keluar", exact: true }).click();
  await page.getByRole("heading", { name: "Masuk ke workspace" }).waitFor();
  await page.screenshot({ path: "artifacts/login-mobile.png", fullPage: true });
  await page.reload();
  await page.getByRole("heading", { name: "Masuk ke workspace" }).waitFor();
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Browser smoke passed: authentication, projects, WBS, dependencies, baseline, XLSX roundtrip, reports/issues, document exports, corporate finalization, PMO assistant, administration, project membership, forced password change, document upload/verification/search, mobile navigation and logout.",
  );
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: "artifacts/browser-failure.png", fullPage: true })
      .catch(() => {});
    console.error(
      (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(-6000),
    );
  }
  throw error;
} finally {
  await browser?.close();
  if (web) {
    web.kill();
    await new Promise((r) => {
      if (web.exitCode !== null) r();
      else web.once("exit", r);
    });
  }
  await app?.close();
  await pool.end();
  if (!/^test_[a-f0-9]{32}$/.test(schema)) throw new Error("Unsafe schema.");
  await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await db.end();
}
