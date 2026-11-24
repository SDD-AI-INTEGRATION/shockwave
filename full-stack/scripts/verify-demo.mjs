import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline';
import assert from 'node:assert/strict';
import { DATASET, ACTORS, PROJECTS } from './demo-data.mjs';

// Credentials enter through hidden stdin and are never written to the report.
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const input = readline.createInterface({ input: process.stdin, terminal: false });
const settings = JSON.parse(await new Promise(resolve => input.once('line', resolve)));
input.close();
process.stdin.pause();
const root = process.env.PMO_DEMO_DIR || join(process.env.LOCALAPPDATA, 'ShockwavePMO', 'demo-data', DATASET);
const require = createRequire(join(process.env.TEMP, 'shockwave-pmo-validation', 'package.json'));
const { chromium } = require('playwright');
const protectedAccounts = await readFile(join(root, 'accounts.dpapi'), 'utf8');
const decrypted = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd());[Net.NetworkCredential]::new('',$s).Password"], { input: protectedAccounts, encoding: 'utf8', windowsHide: true });
if (decrypted.status !== 0) throw Error('Could not decrypt demo accounts for this Windows user.');
const accounts = JSON.parse(decrypted.stdout);
decrypted.stdout = '';
const origins = settings.origins || ['http://localhost:3000', 'http://localhost:8080'];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const reports = [];

async function login(origin, email, password) {
  const response = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, `Login failed at ${origin}`);
  return { user: (await response.json()).user, cookie: response.headers.get('set-cookie').split(';')[0] };
}

try {
  for (const origin of origins) {
    assert.ok(['http://localhost:3000', 'http://localhost:8080'].includes(origin));
    const owner = await login(origin, settings.email, settings.password);
    const report = { origin, dataset: DATASET, api: {}, pages: [], exports: [], browser_errors: [] };
    const api = async (path, auth = owner, method = 'GET', body, expected = 200) => {
      const response = await fetch(origin + '/api' + path, { method, headers: { Origin: origin, Cookie: auth.cookie, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      assert.equal(response.status, expected, `${method} ${path}`);
      return response.json();
    };
    let context;
    try {
      const projects = (await api('/projects')).projects;
      const archived = (await api('/admin/archives')).projects;
      const byCode = Object.fromEntries([...projects, ...archived].map(p => [p.code, p]));
      for (const p of PROJECTS) assert.ok(byCode[p.code], `Missing ${p.code}`);
      const id = key => byCode[PROJECTS.find(p => p.key === key).code].id;
      const demoIds = new Set(PROJECTS.map(p => byCode[p.code].id));
      report.api.projects = PROJECTS.length;
      report.api.archived = archived.filter(p => demoIds.has(p.id)).length;
      const health = (await api('/portfolio/health')).projects.filter(p => demoIds.has(p.id));
      assert.equal(health.find(p => p.id === id('late')).rag, 'red');
      assert.ok(health.some(p => p.rag === 'amber'));
      assert.ok(health.some(p => p.rag === 'green'));
      report.api.rag = Object.fromEntries(health.map(p => [p.code, p.rag]));
      let tasks = 0, reportsCount = 0, documents = 0;
      const documentStatuses = {};
      for (const p of PROJECTS.filter(p => p.key !== 'archive')) {
        const project = byCode[p.code];
        const ops = (await api(`/projects/${project.id}/modules/operations`)).data;
        assert.equal(ops.phases.flatMap(p => p.tasks).length, 6);
        tasks += ops.phases.flatMap(p => p.tasks).length;
        reportsCount += Object.keys(ops.reports).length;
        const mom = (await api(`/projects/${project.id}/modules/mom`)).data.documents[0];
        assert.equal(mom.photos.length, 1);
        assert.ok(mom.signature.startsWith('data:image/png;base64,'));
        for (const doc of (await api(`/projects/${project.id}/documents`)).documents) {
          documents++;
          documentStatuses[doc.status] = (documentStatuses[doc.status] || 0) + 1;
        }
      }
      assert.ok(documentStatuses.verified >= 10);
      assert.ok(documentStatuses.needs_review >= 5);
      assert.equal(documentStatuses.failed, 1);
      report.api.tasks_visible = tasks;
      report.api.reports = reportsCount;
      report.api.documents_visible = documents;
      report.api.document_statuses = documentStatuses;
      const finance = await api(`/projects/${id('app')}/finance`);
      assert.equal(finance.milestones.length, 3);
      assert.equal(finance.summary.paid, 340000000);
      assert.equal(finance.summary.outstanding, 500000000);
      report.api.finance = finance.summary;
      // These rejected operations must leave the existing demo records unchanged.
      await api(`/projects/${id('app')}/contract`, owner, 'PUT', { contract_number: finance.contract.contract_number, contract_value: 1 }, 400);
      await api(`/projects/${id('app')}/milestones`, owner, 'POST', { name: '[DEMO] Invalid WBS reference', amount: 1, wbs_task_id: '00000000-0000-4000-8000-000000000001' }, 400);
      const linkedBast = finance.milestones.find(m => m.bast_document_id).bast_document_id;
      await api(`/documents/${linkedBast}`, owner, 'DELETE', undefined, 409);
      const openClosure = (await api(`/projects/${id('security')}/closure`)).closure;
      await api(`/projects/${id('security')}/closure`, owner, 'PUT', { ...openClosure, checklist: [] }, 400);
      report.api.integrity_rejections = ['contract below payment terms', 'foreign WBS task', 'deleting linked BAST', 'removing mandatory closure checklist'];
      const approvals = (await api('/approvals?scope=all')).approvals.filter(a => demoIds.has(a.project_id));
      for (const state of ['pending', 'approved', 'rejected']) assert.ok(approvals.some(a => a.status === state), `No ${state} approval`);
      assert.ok(approvals.some(a => a.status === 'pending' && a.current_step === 1));
      assert.ok(approvals.some(a => a.status === 'pending' && a.current_step === 2));
      report.api.approvals = approvals.length;
      const actions = (await api('/action-items?status=all')).items.filter(a => demoIds.has(a.project_id));
      assert.ok(actions.some(a => a.status === 'done' && a.evidence.length > 3));
      assert.ok(actions.some(a => a.source === 'meeting' && a.status !== 'done'));
      assert.ok(actions.some(a => a.source === 'manual'));
      report.api.actions = actions.length;
      const baselines = (await api(`/projects/${id('network')}/baselines`)).baselines;
      assert.equal(baselines.length, 2);
      report.api.baselines_network = baselines.length;
      assert.equal((await api(`/projects/${id('closed')}/closure`)).closure.status, 'closed');
      assert.equal((await api(`/projects/${id('closing')}/closure`)).closure.status, 'pending');
      report.api.lessons = (await api('/knowledge?q=DEMO')).lessons.filter(l => demoIds.has(l.project_id)).length;
      assert.equal(report.api.lessons, 2);
      const people = (await api('/resources/workload')).people.filter(p => p.email.startsWith('pmo-demo.'));
      assert.equal(people.length, 3);
      assert.ok(people.some(p => p.utilization > 100));
      report.api.overloaded_people = people.filter(p => p.utilization > 100).length;
      const notifications = await api('/notifications');
      report.api.notifications = notifications.notifications.filter(n => demoIds.has(n.project_id)).length;
      assert.ok(report.api.notifications > 0);
      const viewer = await login(origin, ACTORS.viewer.email, accounts.viewer.password);
      const pm = await login(origin, ACTORS.pm1.email, accounts.pm1.password);
      const newcomer = await login(origin, ACTORS.newcomer.email, accounts.newcomer.temporary_password);
      try {
        assert.equal((await api('/projects', viewer)).projects.length, 7);
        await api('/admin/users', viewer, 'GET', undefined, 403);
        await api(`/projects/${id('app')}/progress`, viewer, 'PATCH', { progress: byCode['DEMO-APP-01'].progress }, 403);
        await api('/admin/users', pm, 'GET', undefined, 403);
        assert.equal(newcomer.user.must_change_password, true);
        await api('/projects', newcomer, 'GET', undefined, 403);
        report.api.rbac = 'viewer read-only; PM admin access denied; first login requires password change';
      } finally {
        for (const auth of [viewer, pm, newcomer]) await api('/auth/logout', auth, 'POST');
      }

      context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, acceptDownloads: true });
      const [cookieName, ...cookieValue] = owner.cookie.split('=');
      await context.addCookies([{ name: cookieName, value: cookieValue.join('='), url: origin, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage();
      page.setDefaultTimeout(20000);
      page.on('pageerror', e => report.browser_errors.push(e.message));
      page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) report.browser_errors.push(`API ${r.status()} ${new URL(r.url()).pathname}`); });
      await page.route('**/api/assistant/ask', route => route.abort()); // No paid generation during fixture validation.
      await page.goto(origin);
      await page.getByRole('heading', { name: 'Setiap proyek, dalam kendali.' }).waitFor();
      const navigate = async (name, heading = name) => {
        await page.getByRole('button', { name, exact: true }).click();
        await page.getByRole('heading', { name: heading, exact: true }).waitFor();
        report.pages.push(name);
      };
      const selectProject = async key => {
        const selected = id(key);
        await page.getByLabel('Proyek aktif', { exact: true }).selectOption(selected);
        await page.waitForFunction(() => !document.body.innerText.includes('Memuat modul'));
      };
      const has = async text => page.getByText(text, { exact: false }).first().waitFor();
      const download = async name => {
        const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name, exact: true }).click()]);
        assert.equal(await file.failure(), null);
        const bytes = await readFile(await file.path());
        assert.ok(bytes.length > 100);
        assert.equal(bytes.subarray(0, 2).toString(), 'PK');
        report.exports.push({ page: report.pages.at(-1), name: file.suggestedFilename(), bytes: bytes.length });
      };
      await navigate('Portfolio Health');
      await page.getByRole('row').filter({ hasText: 'DEMO-BTN-01' }).first().waitFor();
      await navigate('Kapasitas Resource');
      await has('[DEMO] Andi Pratama');
      await navigate('Persetujuan');
      await page.getByRole('button', { name: 'Tinjau', exact: true }).first().waitFor();
      await navigate('Action Items');
      await has('[DEMO] Konfirmasi akses server UAT pelanggan');
      await page.getByLabel('Status', { exact: true }).selectOption('done');
      await has('[DEMO] Kirim daftar deliverable hasil analisis');
      await navigate('WBS');
      await selectProject('app');
      await has('Struktur & bobot pekerjaan');
      await download('Ekspor');
      await navigate('Timeline WBS');
      await selectProject('app');
      await page.getByRole('columnheader', { name: 'W0', exact: true }).waitFor();
      await navigate('Laporan');
      await selectProject('late');
      await has('Realisasi & laporan mingguan');
      const lateProject = byCode['DEMO-BTN-01'];
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const expectedWeek = Math.max(0, Math.min(Math.ceil((Date.parse(lateProject.end_date) - Date.parse(lateProject.start_date)) / 604800000), Math.floor((Date.parse(today) - Date.parse(lateProject.start_date)) / 604800000)));
      assert.equal(await page.getByLabel('Minggu laporan', { exact: true }).inputValue(), String(expectedWeek));
      await navigate('Risk Register');
      await selectProject('late');
      await has('[DEMO] Keterlambatan akses infrastruktur');
      await download('Word');
      await navigate('PM Assignment');
      await selectProject('app');
      await page.getByLabel('Nomor surat').waitFor();
      await download('Word');
      await navigate('MOM');
      await selectProject('app');
      await has('DATA DUMMY. Foto dan gambar tanda tangan');
      await download('Word');
      await navigate('Keuangan & Termin');
      await selectProject('app');
      await has('Termin 3');
      await navigate('Change Request');
      await selectProject('network');
      await has('[DEMO] Tambahan waktu uji failover');
      await has('v2');
      await navigate('Dokumen & OCR');
      await selectProject('security');
      await page.getByRole('button', { name: 'DEMO-demo-bast-scan.png', exact: true }).waitFor();
      await page.getByRole('button', { name: 'DEMO-demo-bast-scan.png', exact: true }).click();
      await has('BAST/DEMO/SCAN');
      await navigate('Penutupan Proyek');
      await selectProject('closing');
      await has('Lessons learned');
      await navigate('Knowledge Base');
      await has('[DEMO] Minta akses server sejak kickoff');
      await navigate('Asisten PMO');
      await page.getByLabel('Cakupan', { exact: true }).selectOption(id('late'));
      await has('AI · OpenAI');
      await navigate('Corporate Meeting');
      await page.getByRole('row').filter({ hasText: '[DEMO] Corporate Meeting - Review Portofolio' }).getByRole('button', { name: 'Lihat rapat', exact: true }).click();
      await page.getByRole('button', { name: 'Pratinjau dokumen', exact: true }).click();
      await download('Word');
      await page.getByRole('button', { name: 'Memo', exact: true }).click();
      await download('Word');
      await navigate('Administrasi', 'Status layanan');
      await has(ACTORS.newcomer.email);
      assert.deepEqual(report.browser_errors, []);
      report.checked_at = new Date().toISOString();
      reports.push(report);
      await mkdir(join(root, new URL(origin).port), { recursive: true });
      await writeFile(join(root, new URL(origin).port, 'verification.json'), JSON.stringify(report, null, 2));
      console.log(`${origin}: verified ${report.api.projects} projects, ${report.pages.length} pages, ${report.exports.length} exports, OCR and RBAC.`);
    } finally {
      if (context) await context.close();
      await api('/auth/logout', owner, 'POST');
    }
  }
} finally {
  settings.password = '';
  await browser.close();
}
console.log('Demo validation complete. Reports contain no passwords or session cookies.');
