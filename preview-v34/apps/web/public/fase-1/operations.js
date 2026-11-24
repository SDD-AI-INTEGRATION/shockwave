
/* PMO (WBS, Timeline, Report) — native content and controls, wrapped into the V03 shell. Kurva S sections removed. */
(function(){

const PAGES = {};
const settings = new URLSearchParams(location.search);
let readonly = false;
let projectName = '';
const projectKey = /^P[0-9]+$/.test(settings.get('project') || '') ? settings.get('project') : 'P001';

class DCLogic {
  constructor(props) { this.props = props || {}; this.state = {}; }
  setState(p) { Object.assign(this.state, typeof p === 'function' ? p(this.state) : p); try { if(this._pageId) localStorage.setItem('pmo.aksel.v07.'+projectKey+'.'+this._pageId,JSON.stringify(this.state)); } catch(_e) {} scheduleRender(); }
  forceUpdate() { scheduleRender(); }
}

/* ===== Data WBS & Timeline bersama (dipakai menu WBS dan Timeline) ===== */
const PALETTE = ['#000A50', '#2031A7', '#266FF1', '#78AAFF', '#14945C', '#E8A317', '#7A5AF8', '#D92D20'];
const MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let uidSeq = 0;
function newUid() { uidSeq += 1; return 'u' + Date.now().toString(36) + uidSeq.toString(36); }
function evenPlan(n) { const v = []; for (let i = 0; i < n; i += 1) v.push(Math.round(99 * (i + 1) / n)); return v; }
function isEvenPlan(v) { const e = evenPlan(v.length); return v.every((x, i) => Number(x) === e[i]); }
function parseNum(v) {
  const s = String(v == null ? '' : v).trim().replace(',', '.');
  if (s === '') return NaN;
  const x = Number(s);
  return isFinite(x) && x >= 0 ? x : NaN;
}
function fmtNum(n) { return String(Math.round(n * 100) / 100); }
function isoToDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d) ? null : d;
}
function dateToIso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtDate(d, withYear) { return d.getDate() + ' ' + MONTHS_ID[d.getMonth()] + (withYear === false ? '' : ' ' + d.getFullYear()); }
function addDays(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
function dayDiff(a, b) { return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000); }

function todayIso() { return dateToIso(new Date()); }
function defaultWbs() {
  // Standard dummy data for an application project: 3 months (13 weeks) starting today, completed 100% in the final week. Not real project data.
  // [name, weight, start week, duration, lag in weeks of the actual progress]
  const src = [
    ['Project Initiation', '#000A50', [
      ['Kick-off meeting and team mobilization', 2, 0, 1, 0],
      ['Project charter and work plan', 3, 0, 1, 1]]],
    ['Analysis & Design', '#2031A7', [
      ['Business requirements analysis (BRD)', 4, 0, 2, 0],
      ['Functional Specification Document (FSD)', 4, 1, 2, 0],
      ['UI/UX design and prototype', 4, 2, 2, 1],
      ['Architecture and database design (TSD)', 3, 2, 2, 1]]],
    ['Development', '#266FF1', [
      ['Environment setup and CI/CD', 3, 3, 1, 0],
      ['Authentication and user management module', 6, 3, 2, 1],
      ['Master data module', 6, 4, 2, 1],
      ['Transaction module', 9, 4, 4, 1],
      ['Reports and dashboard module', 8, 6, 3, 0],
      ['External API integration', 7, 5, 4, 1],
      ['Email and WhatsApp notifications', 6, 7, 2, 0]]],
    ['Testing', '#78AAFF', [
      ['Unit and integration testing', 5, 4, 6, 0],
      ['System Integration Test (SIT)', 6, 9, 1, 1],
      ['User Acceptance Test (UAT)', 6, 10, 1, 1],
      ['Bug fixing', 3, 9, 2, 1]]],
    ['Deployment & Closing', '#14945C', [
      ['Production infrastructure preparation', 3, 9, 2, 0], ['Go Live', 5, 11, 1, 0],
      ['User training', 3, 11, 1, 1], ['Documentation and handover (BAST)', 4, 11, 2, 0]]],
  ];
  const t = new Date();
  const start = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const end = addDays(start, 91);
  const LAST = 13; // W0..W13, the status week is the final week
  const S = LAST;
  // planned cumulative % of an item at week k (same rule as the Timeline: v[] then 100 at s+n)
  const planAt = (s, v, k) => (k < s ? 0 : (k < s + v.length ? v[k - s] : 100));
  const d = {
    version: 2,
    project: { name: 'Sample Application (Dummy)', start: dateToIso(start), end: dateToIso(end), status: dateToIso(end) },
    phases: src.map((ph, pi) => ({
      uid: 'p' + (pi + 1), name: ph[0], color: ph[1],
      items: ph[2].map((it, ii) => {
        const v = evenPlan(it[3]);
        const lag = Math.min(it[4], Math.max(0, LAST - (it[2] + it[3])));
        const actual = {};
        for (let k = 0; k <= LAST; k += 1) {
          let a = planAt(it[2], v, k - lag);
          if (lag && a > 0 && a < 100) a = Math.max(0, Math.round(a * 0.9));
          actual[k] = a;
        }
        actual[LAST] = 100;
        return { uid: 'p' + (pi + 1) + '-' + (ii + 1), name: it[0], w: it[1], s: it[2], v: v, m: 'rata', actual: actual };
      }),
    })),
    report: { kendala: [], weeks: {} },
  };
  const at = (w) => dateToIso(addDays(start, 7 * w));
  d.report.kendala = [
    { id: 'K-001', uid: 'p3-4', kat: 'Technical', dampak: 'High', pic: 'Tech Lead', target: at(7), status: 'Done', wk: 5, uraian: 'The transaction approval flow changed after user review, part of the logic had to be adjusted.', tindakan: 'Approval flow finalized with the user, FSD and development tasks revised.' },
    { id: 'K-002', uid: 'p3-6', kat: 'Vendor', dampak: 'High', pic: 'Project Manager', target: at(7), status: 'Done', wk: 5, uraian: 'Sandbox API access from the vendor was not yet granted, so integration could not start.', tindakan: 'Escalated to the vendor PIC; API documentation and sandbox credentials received in W6.' },
    { id: 'K-003', uid: 'p2-4', kat: 'Resources', dampak: 'Medium', pic: 'Project Manager', target: at(5), status: 'Done', wk: 4, uraian: 'A new database engineer joined, the database design was not final yet.', tindakan: 'Pairing with the system analyst and daily design reviews.' },
    { id: 'K-004', uid: 'p3-3', kat: 'User / Business', dampak: 'Medium', pic: 'Business Analyst', target: at(8), status: 'Done', wk: 5, uraian: 'Master data from the user was incomplete for the initial migration.', tindakan: 'Master data template sent and validation sessions held with the user.' },
    { id: 'K-005', uid: 'p1-2', kat: 'User / Business', dampak: 'Low', pic: 'Project Manager', target: at(1), status: 'Done', wk: 0, uraian: 'Project charter signing was delayed because the sponsor was on leave.', tindakan: 'Charter signed electronically.' },
    { id: 'K-006', uid: 'p5-4', kat: 'User / Business', dampak: 'Low', pic: 'Project Manager', target: dateToIso(addDays(end, 7)), status: 'Ongoing', wk: LAST, uraian: 'The handover document (BAST) is waiting for the customer signature.', tindakan: 'Follow up with the customer sponsor to sign the BAST next week.' },
  ];
  d.report.weeks[5] = {
    note: {
      'p2-3': { done: 'Prototype reviewed by the user, only minor revisions on the report pages remain.' },
      'p3-2': { done: 'Login, roles and menu access done. Password reset via email is in progress.', next: 'Finish password reset and the audit log.' },
      'p3-4': { done: 'Transaction input and approval phase 1 done.', next: 'Adjust to the new approval flow and start the cancellation module.' },
      'p3-6': { todo: 'Waiting for sandbox API access from the vendor (see issue K-002).', next: 'Start the integration as soon as access is granted.' },
    },
    target: {},
    manual: [
      { id: 'M-1', sec: 'done', name: 'Weekly coordination meeting with the user', pct: 100, ket: 'Minutes shared with all participants.' },
    ],
    ket: '<p><b>Summary of the week:</b> progress slightly behind plan because of the transaction approval flow change and the vendor API access that was not available yet.</p><p><i>Mitigation plan:</i> add one developer to the transaction module for two weeks.</p>',
  };
  d.report.weeks[S] = {
    note: {
      'p5-2': { done: 'Go Live completed on schedule, the application runs in production without major incidents.' },
      'p5-3': { done: 'Training held for admin users and branch users, attendance 96%.' },
      'p5-4': { done: 'User manual, technical documentation and the BAST document are complete.', next: 'Collect the signed BAST from the customer.' },
      'p4-3': { done: 'UAT signed off by the user with no open critical findings.' },
    },
    target: {},
    manual: [
      { id: 'M-1', sec: 'done', name: 'Project closing meeting with the customer', pct: 100, ket: 'Lessons learned and support handover discussed.' },
      { id: 'M-2', sec: 'next', name: 'Hypercare support for 2 weeks', pct: 100, ket: 'Support team on standby after Go Live.' },
    ],
    ket: '<p><b>Project completed:</b> all activities reached 100% in the final week and the application is live in production.</p><p><i>Next step:</i> hypercare support and BAST signing with the customer.</p>',
  };
  return d;
}

const templatePhases = {
  service: [
    ['Inisiasi layanan', [['Inventaris layanan dan SLA', 12], ['Serah terima pengetahuan', 13]]],
    ['Transisi', [['Penyiapan alat monitoring', 15], ['Uji prosedur eskalasi', 10]]],
    ['Operasi', [['Monitoring dan pemeliharaan', 25], ['Laporan SLA berkala', 25]]],
  ],
  infrastructure: [
    ['Perencanaan', [['Survei lokasi dan desain', 15], ['Daftar kebutuhan perangkat', 10]]],
    ['Pengadaan', [['Pemesanan dan penerimaan', 25], ['Pemeriksaan perangkat', 10]]],
    ['Implementasi', [['Instalasi dan konfigurasi', 20], ['Uji penerimaan', 15], ['Dokumentasi serah terima', 5]]],
  ],
};

function buildTemplate(type) {
  const data = defaultWbs();
  if (projectName) data.project.name = projectName;
  if (type === 'application') return data;
  const phases = templatePhases[type] || [];
  data.phases = phases.map(([name, items], index) => ({
    uid: newUid(), name, color: PALETTE[index], items: items.map(([name, weight]) => ({
      uid:newUid(), name, w:weight, s:index*4, v:evenPlan(3), m:'rata', actual:{},
    })),
  }));
  data.report = {kendala:[], weeks:{}};
  data.project.status = data.project.start;
  return data;
}

const WBS = {
  data: null,
  savedAt: 0,
  load() {
    this.data = buildTemplate(projectKey === 'P001' ? 'application' : 'empty');
    this.normalize();
  },
  get() { if (!this.data) this.load(); return this.data; },
  persist() {
    if (readonly) return false;
    parent.postMessage({type:'shockwave-operations-change',project:projectKey,data:this.data},location.origin);
    return true;
  },
  mutate(fn) { fn(this.get()); this.normalize(); this.persist(); },
  replace(d) { this.data = d; this.normalize(); this.persist(); },
  reset() { this.data = buildTemplate('application'); this.normalize(); this.persist(); },
  // Minggu: W0 = Start Date, lalu tiap 7 hari, minggu terakhir = End Date
  weeksFor(startIso, endIso) {
    const s = isoToDate(startIso);
    const e = isoToDate(endIso);
    if (!s || !e || dayDiff(s, e) <= 0) return null;
    const out = [];
    let d = s;
    while (dayDiff(d, e) > 0) { out.push(d); d = addDays(d, 7); }
    out.push(e);
    return out;
  },
  fallback() { const t = new Date(); return [todayIso(), dateToIso(addDays(t, 91))]; },
  weeks() { const p = this.get().project; const f = this.fallback(); return this.weeksFor(p.start, p.end) || this.weeksFor(f[0], f[1]); },
  planOf(it, k) {
    if (!it || it.unset) return 0;
    if (k < it.s) return 0;
    if (k < it.s + it.v.length) return Number(it.v[k - it.s]) || 0;
    return 100;
  },
  // Aktual kumulatif per minggu: nilai minggu terakhir yang diisi berlaku untuk minggu berikutnya
  actualAt(it, k) {
    const a = (it && it.actual) || {};
    for (let j = k; j >= 0; j -= 1) if (a[j] != null && a[j] !== '') return Number(a[j]) || 0;
    return 0;
  },
  hasActual(it, k) { return !!(it && it.actual && it.actual[k] != null && it.actual[k] !== ''); },
  setActual(it, k, v) {
    if (!it.actual) it.actual = {};
    it.actual[k] = v;
    Object.keys(it.actual).forEach((j) => { if (Number(j) > k && Number(it.actual[j]) < v) it.actual[j] = v; });
  },
  lastActualWeek() {
    let m = -1;
    this.get().phases.forEach((ph) => ph.items.forEach((it) => Object.keys(it.actual || {}).forEach((j) => { if (Number(j) > m) m = Number(j); })));
    return m;
  },
  rep(k) {
    const r = this.get().report;
    if (!r.weeks[k]) r.weeks[k] = { note: {}, target: {}, manual: [], ket: '' };
    const w = r.weeks[k];
    if (!w.note) w.note = {}; if (!w.target) w.target = {}; if (!Array.isArray(w.manual)) w.manual = []; if (typeof w.ket !== 'string') w.ket = '';
    return w;
  },
  nowIndex() {
    const w = this.weeks();
    const st = isoToDate(this.get().project.status);
    if (!st) return 0;
    let k = 0;
    w.forEach((d, i) => { if (dayDiff(d, st) >= 0) k = i; });
    return k;
  },
  normalize() {
    const d = this.data;
    if (!d.project) d.project = defaultWbs().project;
    if (!this.weeksFor(d.project.start, d.project.end)) { const f = this.fallback(); d.project.start = f[0]; d.project.end = f[1]; }
    if (!d.report || typeof d.report !== 'object') d.report = { kendala: [], weeks: {} };
    if (!Array.isArray(d.report.kendala)) d.report.kendala = [];
    if (!d.report.weeks || typeof d.report.weeks !== 'object') d.report.weeks = {};
    delete d.project.actualHist;
    if (!isoToDate(d.project.status)) d.project.status = d.project.start;
    const maxIdx = this.weeks().length - 1;
    if (!d.phases.length) d.phases.push({ uid: newUid(), name: 'New activity', color: PALETTE[0], items: [] });
    d.phases.forEach((ph, pi) => {
      if (!ph.uid) ph.uid = newUid();
      if (!ph.color) ph.color = PALETTE[pi % PALETTE.length];
      if (typeof ph.name !== 'string') ph.name = String(ph.name || '');
      if (!Array.isArray(ph.items)) ph.items = [];
      ph.items.forEach((it) => {
        if (!it.uid) it.uid = newUid();
        if (typeof it.name !== 'string') it.name = String(it.name || '');
        if (!Array.isArray(it.v) || !it.v.length) { it.v = evenPlan(3); it.m = 'rata'; }
        it.v = it.v.map((x) => (x === '' ? '' : Math.max(0, Math.min(99, Math.round(Number(x) || 0)))));
        if (it.m !== 'kustom') it.m = 'rata';
        it.unset = !!it.unset;
        const act = {};
        if (it.actual && typeof it.actual === 'object') Object.keys(it.actual).forEach((j) => { const x = Number(it.actual[j]); if (/^\d+$/.test(j) && Number(j) <= maxIdx && it.actual[j] !== '' && it.actual[j] != null && isFinite(x)) act[j] = Math.max(0, Math.min(100, Math.round(x * 100) / 100)); });
        it.actual = act;
        delete it.act;
        let s = Math.max(0, Math.round(Number(it.s) || 0));
        let n = it.v.length;
        if (n > maxIdx) { n = Math.max(1, maxIdx); it.v = evenPlan(n); it.m = 'rata'; }
        if (s + n > maxIdx) s = Math.max(0, maxIdx - n);
        it.s = s;
      });
    });
  },
  newItem(ref) {
    return { uid: newUid(), name: 'New sub activity', w: 0, s: ref ? ref.s : 0, v: evenPlan(3), m: 'rata', actual: {} };
  },
  newPhase() {
    const used = this.get().phases.map((p) => p.color);
    const color = PALETTE.find((c) => used.indexOf(c) < 0) || PALETTE[used.length % PALETTE.length];
    return { uid: newUid(), name: 'New activity', color: color, items: [this.newItem(null)] };
  },
  totals() {
    let total = 0;
    let invalid = 0;
    let count = 0;
    this.get().phases.forEach((ph) => ph.items.forEach((it) => { count += 1; const n = parseNum(it.w); if (isNaN(n)) invalid += 1; else total += n; }));
    return { total: Math.round(total * 100) / 100, invalid: invalid, count: count };
  },
};
window.PMO_WBS = WBS;

function reportContext(week) {
  const d = WBS.get();
  const wDates = WBS.weeks();
  const NW = wDates.length;
  let k = week;
  if (typeof k !== 'number' || k < 0 || k > NW - 1) k = WBS.nowIndex();
  const list = [];
  const byUid = {};
  d.phases.forEach((ph, pi) => ph.items.forEach((it, ii) => {
    const code = (pi + 1) + '-' + (ii + 1);
    const w = parseNum(it.w);
    const x = { code: code, it: it, uid: it.uid, name: it.name, phase: ph.name, w: isNaN(w) ? 0 : w };
    list.push(x);
    byUid[it.uid] = x;
  }));
  return { d: d, wDates: wDates, NW: NW, k: k, list: list, byUid: byUid, rep: WBS.rep(k) };
}

function reportMetrics(context) {
  const { k, wDates, list, rep, d } = context;
  const planAt = (x, j) => WBS.planOf(x.it, j);
  const actAt = (x, j) => WBS.actualAt(x.it, j);
  const totals = (count, valueAt) => Array.from({length: count}, (_, week) => {
    const sum = list.reduce((total, item) => total + item.w * valueAt(item, week) / 100, 0);
    return Math.round(sum * 100) / 100;
  });
  const notes = document.createElement('template');
  notes.innerHTML = String(rep.ket || '').replace(/<br\s*\/?\s*>|<\/(p|li)>/gi, '\n');
  notes.content.querySelectorAll('script,style').forEach(node => node.remove());
  return {
    dates: wDates.map(date => fmtDate(date)), week: k, weekDate: dateToIso(wDates[k]),
    plan: totals(wDates.length, planAt), actual: totals(k + 1, actAt),
    notes: notes.content.textContent.trim(),
    activities: list.map(item => ({name:item.name,weight:item.w,plan:planAt(item,k),actual:actAt(item,k)})),
    issues: d.report.kendala.filter(issue => Number(issue.wk || 0) <= k).map(issue => ({id:issue.id,description:issue.uraian,status:issue.status,owner:issue.pic})),
  };
}


/* ===== Excel (ExcelJS, tertanam di file ini sehingga bisa dipakai offline) ===== */
const XL = {
  C: { navy: 'FF000A50', head: 'FF132583', edit: 'FFFFF6D6', ro: 'FFEEF2F8', act: 'FFE8EEFF', white: 'FFFFFFFF', border: 'FFC5D0E2', note: 'FF526079' },
  fill(c) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: c } }; },
  border() { const b = { style: 'thin', color: { argb: this.C.border } }; return { top: b, left: b, bottom: b, right: b }; },
  colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; },
  xlDate(iso) { const d = isoToDate(iso); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); },
  cellVal(cell) {
    let v = cell ? cell.value : null;
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      if ('result' in v) v = v.result;
      else if (v.richText) v = v.richText.map((t) => t.text).join('');
      else if ('text' in v) v = v.text;
      else if ('formula' in v || 'sharedFormula' in v) v = null;
    }
    if (v && typeof v === 'object' && v.error) v = null;
    return v;
  },
  toIso(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v.getUTCFullYear() + '-' + String(v.getUTCMonth() + 1).padStart(2, '0') + '-' + String(v.getUTCDate()).padStart(2, '0');
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return this.toIso(d); }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  },
  head(row, from, to) {
    for (let c = from; c <= to; c += 1) {
      const cell = row.getCell(c);
      cell.fill = this.fill(this.C.head);
      cell.font = { bold: true, color: { argb: this.C.white } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = this.border();
    }
  },
  paint(cell, kind) {
    cell.fill = this.fill(kind === 'edit' ? this.C.edit : (kind === 'act' ? this.C.act : this.C.ro));
    cell.border = this.border();
    if (kind !== 'edit') cell.font = Object.assign({}, cell.font || {}, { color: { argb: 'FF344767' } });
  },
  title(ws, text, sub) {
    ws.getCell('A1').value = text;
    ws.getCell('A1').font = { bold: true, size: 15, color: { argb: this.C.navy } };
    ws.getCell('A2').value = sub;
    ws.getCell('A2').font = { italic: true, color: { argb: this.C.note } };
  },

  templateData() {
    const t = new Date();
    const start = dateToIso(t);
    return {
      project: { name: 'New Project Name', start: start, end: dateToIso(addDays(t, 182)), status: start },
      phases: [
        { uid: '', name: 'Sample Activity 1 - Preparation', items: [
          { uid: '', name: 'Sample Sub Activity - Kick-off meeting', w: 10, s: 0, v: [99], m: 'rata', actual: { 0: 100 } },
          { uid: '', name: 'Sample Sub Activity - Requirements analysis', w: 20, s: 1, v: evenPlan(3), m: 'rata', actual: {} },
        ] },
        { uid: '', name: 'Sample Activity 2 - Execution', items: [
          { uid: '', name: 'Sample Sub Activity - Development', w: 50, s: 4, v: evenPlan(8), m: 'rata', actual: {} },
          { uid: '', name: 'Sample Sub Activity - Testing and Go Live', w: 20, s: 12, v: [10, 30, 60, 90], m: 'kustom', actual: {} },
        ] },
      ],
      report: { kendala: [{ id: '', code: '1-2', kat: 'User / Business', dampak: 'Medium', pic: 'PIC name', target: dateToIso(addDays(t, 14)), status: 'Open', uraian: 'Sample issue: the requirements workshop schedule has not been approved by the user.', tindakan: 'Sample action: send a proposed schedule and escalate to the sponsor.' }], weeks: {} },
    };
  },

  async exportFile(kind, opts) {
    if (!window.ExcelJS) throw new Error('The Excel library did not load.');
    const tpl = !!(opts && opts.template);
    const BLANK = tpl ? 30 : 0;
    const d = tpl ? this.templateData() : WBS.get();
    const p = d.project;
    const weeks = WBS.weeksFor(p.start, p.end) || WBS.weeks();
    const N = weeks.length;
    const wb = new window.ExcelJS.Workbook();
    wb.creator = 'PMO SDD';
    wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;
    const g = wb.addWorksheet('Guide', { properties: { tabColor: { argb: 'FF000A50' } } });
    const pj = wb.addWorksheet('Project', { properties: { tabColor: { argb: 'FF2031A7' } } });
    const ws = wb.addWorksheet('WBS', { properties: { tabColor: { argb: 'FF266FF1' } }, views: [{ state: 'frozen', ySplit: 4 }] });
    const tl = wb.addWorksheet('Timeline', { properties: { tabColor: { argb: 'FF78AAFF' } }, views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }] });
    const ak = wb.addWorksheet('Actual', { properties: { tabColor: { argb: 'FFD92D20' } }, views: [{ state: 'frozen', xSplit: 5, ySplit: 4 }] });
    const kd = wb.addWorksheet('Issues', { properties: { tabColor: { argb: 'FFE8A317' } }, views: [{ state: 'frozen', ySplit: 4 }] });

    /* --- Project --- */
    this.title(pj, 'Project Data', 'Only change yellow cells. The number of weeks is calculated automatically.');
    pj.columns = [{ width: 26 }, { width: 22 }, { width: 16 }, { width: 58 }];
    const ph = pj.getRow(4); ph.values = ['Field', 'Value', 'Editable?', 'Value type and rules']; this.head(ph, 1, 4);
    const prow = [
      ['Project Name', p.name, 'Yes', 'Free text.'],
      ['Start Date', this.xlDate(p.start), 'Yes', 'Date (format yyyy-mm-dd). Becomes week W0.'],
      ['End Date', this.xlDate(p.end), 'Yes', 'Date, must be after Start Date. Becomes the last week.'],
      ['Status Date', this.xlDate(p.status), 'Yes', 'Data date / current week, between Start Date and End Date.'],
      ['Number of Weeks', { formula: 'ROUNDUP((B7-B6)/7,0)+1' }, 'No', 'Automatic: W0 to the last week.'],
    ];
    prow.forEach((r, i) => {
      const row = pj.getRow(5 + i);
      row.values = r;
      const editable = r[2] === 'Yes';
      [1, 3, 4].forEach((c) => this.paint(row.getCell(c), 'ro'));
      this.paint(row.getCell(2), editable ? 'edit' : 'ro');
      if (r[1] instanceof Date) row.getCell(2).numFmt = 'yyyy-mm-dd';
      row.getCell(4).alignment = { wrapText: true, vertical: 'middle' };
    });
    ['B6', 'B7', 'B8'].forEach((a) => { pj.getCell(a).dataValidation = { type: 'date', operator: 'greaterThan', allowBlank: false, formulae: [new Date(Date.UTC(2000, 0, 1))], showErrorMessage: true, errorTitle: 'Invalid date', error: 'Enter a date, e.g. 2025-01-31.' }; });

    /* --- WBS --- */
    this.title(ws, 'WBS — Activity, Sub Activity and Weight Structure', 'Yellow columns can be edited. Blue rows = Activity, white rows = Sub Activity. Read the Guide sheet before editing.');
    ws.columns = [{ width: 16 }, { width: 15 }, { width: 8 }, { width: 62 }, { width: 13 }];
    const wh = ws.getRow(4); wh.values = ['ID (system)', 'Level', 'No', 'Activity Name', 'Weight (%)']; this.head(wh, 1, 5);
    let r = 5;
    const rowOf = new Map();
    const blankRows = [];
    d.phases.forEach((phs, pi) => {
      const pr = r;
      const row = ws.getRow(r);
      row.values = [phs.uid, 'Activity', String(pi + 1), phs.name, null];
      row.font = { bold: true };
      [1, 3, 5].forEach((c) => this.paint(row.getCell(c), 'act'));
      [2, 4].forEach((c) => this.paint(row.getCell(c), 'edit'));
      rowOf.set(phs, r);
      r += 1;
      phs.items.forEach((it, ii) => {
        const ir = ws.getRow(r);
        const wv = parseNum(it.w);
        ir.values = [it.uid, 'Sub Activity', (pi + 1) + '-' + (ii + 1), it.name, isNaN(wv) ? 0 : wv];
        [1, 3].forEach((c) => this.paint(ir.getCell(c), 'ro'));
        [2, 4, 5].forEach((c) => this.paint(ir.getCell(c), 'edit'));
        ir.getCell(5).numFmt = '0.00';
        rowOf.set(it, r);
        r += 1;
      });
      const pc = ws.getCell(pr, 5);
      pc.value = phs.items.length ? { formula: 'SUM(E' + (pr + 1) + ':E' + (r - 1) + ')' } : 0;
      pc.numFmt = '0.00';
    });
    for (let b = 0; b < BLANK; b += 1) {
      const br = ws.getRow(r);
      [1, 3].forEach((c) => this.paint(br.getCell(c), 'ro'));
      [2, 4, 5].forEach((c) => this.paint(br.getCell(c), 'edit'));
      br.getCell(5).numFmt = '0.00';
      blankRows.push(r);
      r += 1;
    }
    const lastWbsRow = r - 1;
    for (let i = 5; i <= lastWbsRow + 60; i += 1) {
      ws.getCell(i, 2).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Activity,Sub Activity"'], showErrorMessage: true, errorTitle: 'Invalid level', error: 'Choose Activity or Sub Activity.' };
      ws.getCell(i, 5).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: 'Invalid weight', error: 'Weight is a number from 0 to 100 (percent).' };
    }
    const tr = lastWbsRow + 2;
    ws.getCell(tr, 2).value = 'TOTAL';
    ws.getCell(tr, 4).value = { formula: 'IF(ROUND(E' + tr + ',2)=100,"Balanced: total weight 100%","Not balanced: total weight must be 100%")' };
    ws.getCell(tr, 5).value = { formula: 'SUMIF(B5:B' + (tr - 1) + ',"Sub Activity",E5:E' + (tr - 1) + ')' };
    ws.getCell(tr, 5).numFmt = '0.00';
    [2, 3, 4, 5].forEach((c) => { const cell = ws.getCell(tr, c); this.paint(cell, 'act'); cell.font = { bold: true, color: { argb: this.C.navy } }; });
    ws.getCell(tr, 1).value = '';

    /* --- Timeline --- */
    this.title(tl, 'Timeline — Planned Cumulative Progress per Week (%)', 'Names and weights follow the WBS sheet (automatic). Change Start Week, Duration, Pattern; fill the W columns only when Pattern = Custom.');
    const W0 = 9;
    const lastCol = W0 + N - 1;
    tl.getColumn(1).width = 16; tl.getColumn(2).width = 13; tl.getColumn(3).width = 7; tl.getColumn(4).width = 46;
    tl.getColumn(5).width = 10; tl.getColumn(6).width = 10; tl.getColumn(7).width = 10; tl.getColumn(8).width = 10;
    for (let c = W0; c <= lastCol; c += 1) tl.getColumn(c).width = 8.5;
    const th = tl.getRow(4);
    const hv = ['ID (system)', 'Level', 'No', 'Activity Name', 'Weight (%)', 'Start Week', 'Duration (weeks)', 'Pattern'];
    hv.forEach((t, i) => { th.getCell(i + 1).value = t; });
    for (let k = 0; k < N; k += 1) {
      th.getCell(W0 + k).value = { formula: '"W' + k + '"&CHAR(10)&DAY(MIN(Project!$B$6+' + (7 * k) + ',Project!$B$7))&"/"&MONTH(MIN(Project!$B$6+' + (7 * k) + ',Project!$B$7))', result: 'W' + k + '\n' + fmtDate(weeks[k], false) };
    }
    th.height = 34;
    this.head(th, 1, lastCol);
    let t = 5;
    d.phases.forEach((phs, pi) => {
      const row = tl.getRow(t);
      const wr = rowOf.get(phs);
      row.getCell(1).value = phs.uid;
      row.getCell(2).value = 'Activity';
      row.getCell(3).value = String(pi + 1);
      row.getCell(4).value = { formula: 'WBS!D' + wr, result: phs.name };
      row.getCell(5).value = { formula: 'WBS!E' + wr };
      row.getCell(5).numFmt = '0.00';
      row.font = { bold: true };
      for (let c = 1; c <= lastCol; c += 1) this.paint(row.getCell(c), 'act');
      t += 1;
      phs.items.forEach((it, ii) => {
        const ir = tl.getRow(t);
        const wrr = rowOf.get(it);
        ir.getCell(1).value = it.uid;
        ir.getCell(2).value = 'Sub Activity';
        ir.getCell(3).value = (pi + 1) + '-' + (ii + 1);
        ir.getCell(4).value = { formula: 'WBS!D' + wrr, result: it.name };
        ir.getCell(5).value = { formula: 'WBS!E' + wrr };
        ir.getCell(5).numFmt = '0.00';
        if (!it.unset) {
          ir.getCell(6).value = it.s;
          ir.getCell(7).value = it.v.length;
          ir.getCell(8).value = it.m === 'kustom' ? 'Custom' : 'Even';
        }
        [1, 2, 3, 4, 5].forEach((c) => this.paint(ir.getCell(c), 'ro'));
        [6, 7, 8].forEach((c) => this.paint(ir.getCell(c), 'edit'));
        const n = it.v.length;
        for (let k = 0; k < N; k += 1) {
          const cell = ir.getCell(W0 + k);
          let cur = '';
          if (k >= it.s && k < it.s + n) cur = it.v[k - it.s] === '' ? 0 : it.v[k - it.s];
          else if (k >= it.s + n) cur = 100;
          const F = '$F' + t; const G = '$G' + t; const H = '$H' + t;
          const rata = 'IF(OR(' + F + '="",' + G + '=""),"",IF(' + k + '<' + F + ',"",IF(' + k + '<' + F + '+' + G + ',ROUND(99*(' + k + '-' + F + '+1)/' + G + ',0),100)))';
          if (it.unset) {
            cell.value = { formula: 'IF(' + H + '="Custom","",' + rata + ')' };
          } else if (it.m === 'kustom') {
            cell.value = cur;
          } else {
            cell.value = { formula: 'IF(' + H + '="Custom",' + (cur === '' ? '""' : cur) + ',' + rata + ')', result: cur };
          }
          cell.alignment = { horizontal: 'center' };
          this.paint(cell, (it.unset || (k >= it.s && k < it.s + n)) ? 'edit' : 'ro');
        }
        t += 1;
      });
    });
    const tplRows = {};
    blankRows.forEach((b) => {
      const ir = tl.getRow(t);
      const ref = (col) => ({ formula: 'IF(WBS!' + col + b + '="","",WBS!' + col + b + ')' });
      ir.getCell(2).value = ref('B');
      ir.getCell(4).value = ref('D');
      ir.getCell(5).value = ref('E');
      ir.getCell(5).numFmt = '0.00';
      [1, 2, 3, 4, 5].forEach((c) => this.paint(ir.getCell(c), 'ro'));
      [6, 7, 8].forEach((c) => this.paint(ir.getCell(c), 'edit'));
      const F = '$F' + t; const G = '$G' + t; const H = '$H' + t;
      for (let k = 0; k < N; k += 1) {
        const cell = ir.getCell(W0 + k);
        cell.value = { formula: 'IF(' + H + '="Custom","",IF(OR(' + F + '="",' + G + '=""),"",IF(' + k + '<' + F + ',"",IF(' + k + '<' + F + '+' + G + ',ROUND(99*(' + k + '-' + F + '+1)/' + G + ',0),100))))' };
        cell.alignment = { horizontal: 'center' };
        this.paint(cell, 'edit');
      }
      tplRows[t] = 1;
      t += 1;
    });
    const lastTl = t - 1;
    for (let i = 5; i <= lastTl; i += 1) {
      if (tl.getCell(i, 2).value !== 'Sub Activity' && !tplRows[i]) continue;
      tl.getCell(i, 6).dataValidation = { type: 'whole', operator: 'between', allowBlank: false, formulae: [0, N - 2], showErrorMessage: true, errorTitle: 'Invalid start week', error: 'Enter a whole number from 0 to ' + (N - 2) + ' (0 = W0).' };
      tl.getCell(i, 7).dataValidation = { type: 'whole', operator: 'between', allowBlank: false, formulae: [1, N - 1], showErrorMessage: true, errorTitle: 'Invalid duration', error: 'Enter a whole number from 1 to ' + (N - 1) + ' weeks.' };
      tl.getCell(i, 8).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Even,Custom"'], showErrorMessage: true, errorTitle: 'Invalid pattern', error: 'Choose Even or Custom.' };
      for (let k = 0; k < N; k += 1) tl.getCell(i, W0 + k).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: 'Invalid value', error: 'Enter a cumulative percentage from 0 to 99. 100 is set automatically in the week after the duration.' };
    }
    const cr = lastTl + 2;
    tl.getCell(cr, 4).value = 'Project cumulative plan (%)';
    tl.getCell(cr, 4).font = { bold: true, color: { argb: this.C.navy } };
    for (let k = 0; k < N; k += 1) {
      const L = this.colLetter(W0 + k);
      const cell = tl.getCell(cr, W0 + k);
      cell.value = { formula: 'ROUND(SUMPRODUCT(--($B$5:$B$' + lastTl + '="Sub Activity"),$E$5:$E$' + lastTl + ',' + L + '$5:' + L + '$' + lastTl + ')/100,2)' };
      cell.numFmt = '0.00';
      cell.font = { bold: true, color: { argb: this.C.navy } };
      cell.alignment = { horizontal: 'center' };
      this.paint(cell, 'act');
    }
    this.paint(tl.getCell(cr, 4), 'act');

    /* --- Aktual --- */
    this.title(ak, 'Actual — Cumulative Actual Progress per Week (%)', 'Names and weights follow the WBS sheet (automatic). Fill in the cumulative actual percentage in the W columns (yellow). Empty cell = same as the previous week.');
    const A0 = 6;
    const aLast = A0 + N - 1;
    ak.getColumn(1).width = 16; ak.getColumn(2).width = 13; ak.getColumn(3).width = 7; ak.getColumn(4).width = 46; ak.getColumn(5).width = 10;
    for (let c = A0; c <= aLast; c += 1) ak.getColumn(c).width = 8.5;
    const ah = ak.getRow(4);
    ['ID (system)', 'Level', 'No', 'Activity Name', 'Weight (%)'].forEach((x, i) => { ah.getCell(i + 1).value = x; });
    for (let k = 0; k < N; k += 1) ah.getCell(A0 + k).value = { formula: '"W' + k + '"&CHAR(10)&DAY(MIN(Project!$B$6+' + (7 * k) + ',Project!$B$7))&"/"&MONTH(MIN(Project!$B$6+' + (7 * k) + ',Project!$B$7))', result: 'W' + k + '\n' + fmtDate(weeks[k], false) };
    ah.height = 34;
    this.head(ah, 1, aLast);
    let lastData = -1;
    d.phases.forEach((phs) => phs.items.forEach((it) => Object.keys(it.actual || {}).forEach((j) => { if (Number(j) > lastData) lastData = Number(j); })));
    if (!tpl) lastData = Math.max(lastData, WBS.nowIndex());
    let ar = 5;
    const codeOf = new Map();
    d.phases.forEach((phs, pi) => {
      const row = ak.getRow(ar);
      row.getCell(1).value = phs.uid; row.getCell(2).value = 'Activity'; row.getCell(3).value = String(pi + 1);
      row.getCell(4).value = { formula: 'WBS!D' + rowOf.get(phs), result: phs.name };
      row.getCell(5).value = { formula: 'WBS!E' + rowOf.get(phs) }; row.getCell(5).numFmt = '0.00';
      row.font = { bold: true };
      for (let c = 1; c <= aLast; c += 1) this.paint(row.getCell(c), 'act');
      ar += 1;
      phs.items.forEach((it, ii) => {
        const ir = ak.getRow(ar);
        const code = (pi + 1) + '-' + (ii + 1);
        codeOf.set(it, code);
        ir.getCell(1).value = it.uid; ir.getCell(2).value = 'Sub Activity'; ir.getCell(3).value = code;
        ir.getCell(4).value = { formula: 'WBS!D' + rowOf.get(it), result: it.name };
        ir.getCell(5).value = { formula: 'WBS!E' + rowOf.get(it) }; ir.getCell(5).numFmt = '0.00';
        [1, 2, 3, 4, 5].forEach((c) => this.paint(ir.getCell(c), 'ro'));
        for (let k = 0; k < N; k += 1) {
          const cell = ir.getCell(A0 + k);
          if (k <= lastData && (!tpl || WBS.hasActual(it, k))) cell.value = WBS.actualAt(it, k);
          cell.alignment = { horizontal: 'center' };
          cell.numFmt = '0.##';
          this.paint(cell, 'edit');
        }
        ar += 1;
      });
    });
    blankRows.forEach((b) => {
      const ir = ak.getRow(ar);
      const ref = (col) => ({ formula: 'IF(WBS!' + col + b + '="","",WBS!' + col + b + ')' });
      ir.getCell(2).value = ref('B'); ir.getCell(4).value = ref('D'); ir.getCell(5).value = ref('E'); ir.getCell(5).numFmt = '0.00';
      [1, 2, 3, 4, 5].forEach((c) => this.paint(ir.getCell(c), 'ro'));
      for (let k = 0; k < N; k += 1) { const cell = ir.getCell(A0 + k); cell.alignment = { horizontal: 'center' }; this.paint(cell, 'edit'); }
      ar += 1;
    });
    const aLastRow = ar - 1;
    for (let i = 5; i <= aLastRow; i += 1) {
      for (let k = 0; k < N; k += 1) ak.getCell(i, A0 + k).dataValidation = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [0, 100], showErrorMessage: true, errorTitle: 'Invalid value', error: 'Enter the cumulative actual percentage from 0 to 100; it may not decrease from the previous week.' };
    }
    const apr = aLastRow + 2;
    ak.getCell(apr, 4).value = 'Project cumulative plan (%)';
    ak.getCell(apr + 1, 4).value = 'Project cumulative actual (%)';
    for (let k = 0; k < N; k += 1) {
      const L = this.colLetter(A0 + k);
      const c1 = ak.getCell(apr, A0 + k);
      c1.value = { formula: 'Timeline!' + this.colLetter(W0 + k) + cr };
      const c2 = ak.getCell(apr + 1, A0 + k);
      c2.value = { formula: 'IF(COUNT(' + L + '5:' + L + aLastRow + ')=0,"",ROUND(SUMPRODUCT(--($B$5:$B$' + aLastRow + '="Sub Activity"),$E$5:$E$' + aLastRow + ',' + L + '$5:' + L + '$' + aLastRow + ')/100,2))' };
      [c1, c2].forEach((c) => { c.numFmt = '0.00'; c.font = { bold: true, color: { argb: this.C.navy } }; c.alignment = { horizontal: 'center' }; this.paint(c, 'act'); });
    }
    [apr, apr + 1].forEach((r0) => { const c = ak.getCell(r0, 4); c.font = { bold: true, color: { argb: this.C.navy } }; this.paint(c, 'act'); });

    /* --- Kendala --- */
    this.title(kd, 'Issues — Issue List and Follow-up', 'Yellow columns can be edited. One row = one issue. Rows without a Description are ignored.');
    kd.columns = [{ width: 10 }, { width: 11 }, { width: 38 }, { width: 15 }, { width: 10 }, { width: 18 }, { width: 14 }, { width: 12 }, { width: 50 }, { width: 50 }];
    const kh = kd.getRow(4); kh.values = ['ID (system)', 'Activity (No)', 'Activity Name', 'Category', 'Impact', 'PIC', 'Target Date', 'Status', 'Issue Description', 'Action Plan']; this.head(kh, 1, 10);
    const KAT = ['Technical', 'Resources', 'User / Business', 'Vendor', 'Infrastructure'];
    let kr = 5;
    const codeByUid = {};
    d.phases.forEach((phs, pi) => phs.items.forEach((it, ii) => { if (it.uid) codeByUid[it.uid] = (pi + 1) + '-' + (ii + 1); }));
    const nameByCode = {};
    d.phases.forEach((phs, pi) => phs.items.forEach((it, ii) => { nameByCode[(pi + 1) + '-' + (ii + 1)] = it.name; }));
    const kl = ((d.report && d.report.kendala) || []);
    const KBLANK = 20;
    for (let i = 0; i < kl.length + KBLANK; i += 1) {
      const k = kl[i];
      const row = kd.getRow(kr);
      if (k) {
        const code = k.code || codeByUid[k.uid] || '';
        row.values = [k.id || '', code, null, k.kat || '', k.dampak || '', k.pic || '', k.target ? this.xlDate(k.target) : null, k.status || 'Open', k.uraian || '', k.tindakan || ''];
        row.getCell(3).value = { formula: 'IFERROR(INDEX(WBS!$D:$D,MATCH(B' + kr + ',WBS!$C:$C,0)),"")', result: nameByCode[code] || '' };
      } else {
        row.getCell(3).value = { formula: 'IF(B' + kr + '="","",IFERROR(INDEX(WBS!$D:$D,MATCH(B' + kr + ',WBS!$C:$C,0)),""))' };
      }
      [1, 3].forEach((c) => this.paint(row.getCell(c), 'ro'));
      [2, 4, 5, 6, 7, 8, 9, 10].forEach((c) => this.paint(row.getCell(c), 'edit'));
      row.getCell(2).numFmt = '@';
      row.getCell(7).numFmt = 'yyyy-mm-dd';
      [9, 10].forEach((c) => { row.getCell(c).alignment = { wrapText: true, vertical: 'top' }; });
      row.getCell(4).dataValidation = { type: 'list', allowBlank: true, formulae: ['"' + KAT.join(',') + '"'], showErrorMessage: true, errorTitle: 'Invalid category', error: 'Choose one: ' + KAT.join(', ') + '.' };
      row.getCell(5).dataValidation = { type: 'list', allowBlank: true, formulae: ['"High,Medium,Low"'], showErrorMessage: true, errorTitle: 'Invalid impact', error: 'Choose High, Medium or Low.' };
      row.getCell(7).dataValidation = { type: 'date', operator: 'greaterThan', allowBlank: true, formulae: [new Date(Date.UTC(2000, 0, 1))], showErrorMessage: true, errorTitle: 'Invalid date', error: 'Enter a date, e.g. 2026-12-31.' };
      row.getCell(8).dataValidation = { type: 'list', allowBlank: true, formulae: ['"Open,Ongoing,Done"'], showErrorMessage: true, errorTitle: 'Invalid status', error: 'Choose Open, Ongoing or Done.' };
      kr += 1;
    }

    /* --- Panduan --- */
    g.columns = [{ width: 14 }, { width: 24 }, { width: 15 }, { width: 30 }, { width: 70 }];
    const KN = { wbs: 'WBS', timeline: 'Timeline', report: 'Reports' }[kind] || 'WBS';
    if (tpl) this.title(g, 'Template Guide ' + (kind === 'timeline' ? 'New Timeline' : (kind === 'report' ? 'New Project Report' : 'New Project WBS')), 'Blank template for a new project, created from Operations · ' + KN + ' on ' + fmtDate(new Date()) + '. Sample period ' + fmtDate(isoToDate(p.start)) + ' to ' + fmtDate(isoToDate(p.end)) + ' (' + N + ' weeks), please change it.');
    else this.title(g, 'Operations Excel File Guide (WBS, Timeline & Reports) — PMO ' + p.name, 'Exported from Operations · ' + KN + ' on ' + fmtDate(new Date()) + '. Project period ' + fmtDate(isoToDate(p.start)) + ' to ' + fmtDate(isoToDate(p.end)) + ' (' + N + ' weeks).');
    const steps = [
      'How to use',
      '1. This file can be imported back with Import Operations from the WBS, Timeline or Reports tab. It always contains the same sheets: Project, WBS, Timeline, Actual and Issues.',
      '2. Only change YELLOW cells. Grey/blue cells are calculated automatically or managed by the system; changes there are ignored on import.',
      '3. Adding a Sub Activity: insert a row in the WBS sheet below its Activity, fill Level = Sub Activity, Name and Weight. Leave the ID column empty.',
      '4. Adding an Activity: insert a row in the WBS sheet, fill Level = Activity and Name. The Sub Activities below it belong to that Activity.',
      '5. Deleting: delete the row in the WBS sheet. Timeline rows for deleted IDs are ignored.',
      '6. New Sub Activities from the WBS sheet get a default schedule (W0, 3 weeks, Even pattern). Adjust the schedule in the application, then export again so their Timeline rows appear.',
      '7. The total weight of all Sub Activities must be 100. See the TOTAL row in the WBS sheet.',
      '8. If Start Date or End Date in the Project sheet changes the number of weeks, import first and then export again so the W columns in the Timeline sheet follow.',
      '9. Do not rename sheets or column headers (row 4). Column order may change, but the headers must stay the same.',
      '10. Actual sheet: fill in the cumulative actual progress (0–100) of each Sub Activity per week. An empty cell means the same as the previous week. Values may not decrease from the previous week.',
      '11. Issues sheet: one row per issue. Fill Activity with the sub activity No (e.g. 3-4) or the sub activity name. An issue with an empty ID is treated as a new issue.',
      '12. Row notes, extra rows outside the WBS and the Notes (text with images) in Reports are not included in the Excel file; they are stored in the application only.',
    ];
    if (tpl) {
      steps.splice(1, 0,
        'A. Fill in the Project sheet: Project Name, Start Date, End Date and Status Date of the new project.',
        'B. In the WBS sheet, replace the rows starting with "Example" with your project’s activities and sub activities, or delete those rows. The empty yellow rows below can be filled in directly (choose Level, fill in Name and Weight).',
        'C. In the Timeline sheet, fill in Start Week, Duration and Pattern for each Sub Activity. Names and weights come automatically from the WBS sheet.',
        'D. In the Actual sheet (optional), fill in actual progress per week. In the Issues sheet (optional), replace the sample row with the project issues.',
        'E. Save, then click Import Operations in Operations. The project data currently shown in the application will be replaced by the contents of this template.');
    }
    let gr = 4;
    steps.forEach((s, i) => { const c = g.getCell(gr, 1); c.value = s; if (i === 0) c.font = { bold: true, size: 12, color: { argb: this.C.navy } }; g.mergeCells(gr, 1, gr, 5); c.alignment = { wrapText: true, vertical: 'top' }; if (i > 0) g.getRow(gr).height = 30; gr += 1; });
    gr += 1;
    g.getCell(gr, 1).value = 'Color meaning'; g.getCell(gr, 1).font = { bold: true, size: 12, color: { argb: this.C.navy } }; gr += 1;
    [['edit', 'Yellow', 'Editable'], ['ro', 'Grey', 'Do not change (automatic/system)'], ['act', 'Light blue', 'Activity rows, totals, or calculated results']].forEach((x) => {
      const c = g.getCell(gr, 1); c.value = x[1]; this.paint(c, x[0]); g.getCell(gr, 2).value = x[2]; gr += 1;
    });
    gr += 1;
    g.getCell(gr, 1).value = 'Column list'; g.getCell(gr, 1).font = { bold: true, size: 12, color: { argb: this.C.navy } }; gr += 1;
    const hr = g.getRow(gr); hr.values = ['Sheet', 'Column', 'Editable?', 'Value type', 'Rules and examples']; this.head(hr, 1, 5); gr += 1;
    const cols = [
      ['Project', 'Project Name', 'Yes', 'Text', 'Example: Acceleration'],
      ['Project', 'Start Date', 'Yes', 'Date', 'Format yyyy-mm-dd, e.g. 2025-01-31. Becomes W0.'],
      ['Project', 'End Date', 'Yes', 'Date', 'Must be after Start Date. E.g. 2025-06-30. Becomes the last week.'],
      ['Project', 'Status Date', 'Yes', 'Date', 'Data date (current week). E.g. 2025-05-23.'],
      ['Project', 'Number of Weeks', 'No', 'Number (automatic)', 'Calculated from Start Date and End Date.'],
      ['WBS', 'ID (system)', 'No', 'System code text', 'Links the data to the application. Do not change. Leave empty for new rows.'],
      ['WBS', 'Level', 'Yes', 'Options: Activity / Sub Activity', 'Activity = group (e.g. Development). Sub Activity = the work below it.'],
      ['WBS', 'No', 'No', 'Text (automatic)', 'Numbering is regenerated automatically on import, e.g. 3-1.'],
      ['WBS', 'Activity Name', 'Yes', 'Text, required', 'Example: B-1 Credit Limit Master per Branch per Card Type'],
      ['WBS', 'Weight (%)', 'Yes (Sub Activity)', 'Decimal number 0–100', 'Sub Activities only, e.g. 2 or 2.5. Activity weight = automatic sum.'],
      ['Timeline', 'ID, Level, No', 'No', 'System', 'Follows the WBS sheet.'],
      ['Timeline', 'Activity Name, Weight', 'No', 'Formula to the WBS sheet', 'Change it in the WBS sheet; the value updates automatically.'],
      ['Timeline', 'Start Week', 'Yes', 'Whole number 0–' + (N - 2), '0 = W0 (' + fmtDate(weeks[0]) + '). E.g. 4 = W4.'],
      ['Timeline', 'Duration (weeks)', 'Yes', 'Whole number 1–' + (N - 1), 'Work duration. Start Week + Duration may not exceed ' + (N - 1) + '.'],
      ['Timeline', 'Pattern', 'Yes', 'Options: Even / Custom', 'Even = progress is split evenly automatically. Custom = fill it in yourself in the W columns.'],
      ['Timeline', 'W0 … W' + (N - 1), 'Yes (if Custom)', 'Number 0–99 (cumulative percent)', 'Fill in only for weeks Start to Start+Duration-1. 100 is recorded automatically in the following week. Even pattern: calculated automatically.'],
      ['Timeline', 'Project cumulative plan', 'No', 'Number (automatic)', 'Sum of weight x plan for each week.'],
      ['Actual', 'ID, Level, No, Name, Weight', 'No', 'System / formula to WBS', 'Follows the WBS sheet.'],
      ['Actual', 'W0 … W' + (N - 1), 'Yes', 'Number 0–100 (cumulative percent)', 'Actual progress up to that week. Empty = same as the previous week. May not be lower than the previous week. E.g. 45 or 45.5.'],
      ['Actual', 'Project cumulative plan / actual', 'No', 'Number (automatic)', 'Plan from the Timeline sheet, actual = sum of weight x actual. Becomes the S-Curve in Reports.'],
      ['Issues', 'ID (system)', 'No', 'System code text', 'Leave empty for a new issue.'],
      ['Issues', 'Activity (No)', 'Yes', 'Text', 'Sub activity No from the WBS sheet (e.g. 3-4) or the sub activity name. May be empty.'],
      ['Issues', 'Activity Name', 'No', 'Formula to WBS', 'Filled automatically from the activity No.'],
      ['Issues', 'Category', 'Yes', 'Options', 'Technical, Resources, User / Business, Vendor, Infrastructure.'],
      ['Issues', 'Impact', 'Yes', 'Options', 'High, Medium, Low.'],
      ['Issues', 'PIC', 'Yes', 'Text', 'Person in charge.'],
      ['Issues', 'Target Date', 'Yes', 'Date', 'Format yyyy-mm-dd, may be empty.'],
      ['Issues', 'Status', 'Yes', 'Options', 'Open, Ongoing, Done.'],
      ['Issues', 'Issue Description', 'Yes', 'Text, required', 'What is blocking. Rows without a description are ignored.'],
      ['Issues', 'Action Plan', 'Yes', 'Text', 'Resolution steps.'],
    ];
    cols.forEach((c) => {
      const row = g.getRow(gr); row.values = c;
      for (let i = 1; i <= 5; i += 1) { row.getCell(i).border = this.border(); row.getCell(i).alignment = { wrapText: true, vertical: 'top' }; }
      this.paint(row.getCell(3), c[2].indexOf('Yes') === 0 ? 'edit' : 'ro');
      gr += 1;
    });

    wb.views = [{ activeTab: kind === 'timeline' ? 3 : (kind === 'report' ? 4 : 2) }];
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fname = tpl ? 'Template_Operations_New_Project.xlsx' : 'Operations_' + p.name.replace(/[^\w-]+/g, '_').replace(/_+$/, '') + '_' + dateToIso(new Date()) + '.xlsx';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return fname;
  },

  headerMap(ws) {
    const HDR_ALIAS = { 'id (system)': 'id (sistem)', 'activity name': 'nama kegiatan', 'name': 'nama', 'weight (%)': 'bobot (%)', 'weight': 'bobot', 'start week': 'minggu mulai', 'duration (weeks)': 'durasi (minggu)', 'pattern': 'pola', 'category': 'kategori', 'impact': 'dampak', 'target date': 'target selesai', 'issue description': 'uraian kendala', 'action plan': 'rencana tindakan' };
    for (let r = 1; r <= 10; r += 1) {
      const row = ws.getRow(r);
      const map = {};
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        const v = String(this.cellVal(cell) == null ? '' : this.cellVal(cell)).trim().toLowerCase();
        if (v) { const k = v.split('\n')[0]; map[HDR_ALIAS[k] || k] = c; }
      });
      if (map['id (sistem)'] || map.id) return { row: r, map: map };
    }
    return null;
  },

  async downloadFix(res) {
    const wb = res.wb;
    const byCell = {};
    res.locs.forEach((l) => {
      const ws = wb.getWorksheet(l.sh);
      if (!ws || !l.r || !l.c) return;
      const key = l.sh + '!' + l.r + ':' + l.c;
      if (!byCell[key]) byCell[key] = { ws: ws, r: l.r, c: l.c, t: [] };
      byCell[key].t.push(l.t.replace(/^Sheet [A-Za-z]+( (?:baris|row) \d+( \([^)]*\))?)?: /, ''));
    });
    const red = { style: 'medium', color: { argb: 'FFD92D20' } };
    Object.keys(byCell).forEach((k) => {
      const x = byCell[k];
      const cell = x.ws.getCell(x.r, x.c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } };
      cell.font = { bold: true, color: { argb: 'FF9C0006' } };
      cell.border = { top: red, left: red, bottom: red, right: red };
      cell.note = { texts: [{ font: { bold: true, color: { argb: 'FFD92D20' } }, text: 'NEEDS FIXING:\n' }, { text: x.t.join('\n') }] };
    });
    const old = wb.getWorksheet('Error List');
    if (old) wb.removeWorksheet(old.id);
    const es = wb.addWorksheet('Error List', { properties: { tabColor: { argb: 'FFD92D20' } } });
    es.columns = [{ width: 12 }, { width: 8 }, { width: 10 }, { width: 90 }];
    es.getCell('A1').value = 'Import error list (' + res.errors.length + ' items)';
    es.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFD92D20' } };
    es.getCell('A2').value = 'Wrong cells are marked red with a comment in their original sheet. Fix them, save, then use Import Operations again. This sheet can stay; it is ignored on import.';
    es.getCell('A2').font = { italic: true, color: { argb: 'FF526079' } };
    const hr = es.getRow(4); hr.values = ['Sheet', 'Row', 'Column', 'Notes']; this.head(hr, 1, 4);
    res.locs.forEach((l, i) => {
      const row = es.getRow(5 + i);
      row.values = [l.sh, l.r || '', l.c ? this.colLetter(l.c) : '', l.t];
      for (let c = 1; c <= 4; c += 1) { row.getCell(c).border = this.border(); row.getCell(c).alignment = { wrapText: true, vertical: 'top' }; }
    });
    wb.views = [{ activeTab: wb.worksheets.indexOf(es) }];
    let buf;
    try { buf = await wb.xlsx.writeBuffer(); } catch (err) {
      const nb = new window.ExcelJS.Workbook();
      const ns = nb.addWorksheet('Error List');
      ns.columns = [{ width: 12 }, { width: 8 }, { width: 10 }, { width: 90 }];
      ns.addRow(['Sheet', 'Row', 'Column', 'Notes']);
      res.locs.forEach((l) => ns.addRow([l.sh, l.r || '', l.c ? this.colLetter(l.c) : '', l.t]));
      buf = await nb.xlsx.writeBuffer();
    }
    const name = res.fname.replace(/\.xlsx$/i, '') + '_PERBAIKAN.xlsx';
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    return name;
  },

  async importFile(file) {
    if (!window.ExcelJS) throw new Error('The Excel library did not load.');
    const wb = new window.ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const errors = [];
    const locs = [];
    const E = (sh, r, c, t) => { errors.push(t); locs.push({ sh: sh, r: r, c: c, t: t }); };
    const notes = [];
    const cur = WBS.get();
    const next = JSON.parse(JSON.stringify(cur));

    /* Project */
    const pj = wb.getWorksheet('Project');
    if (pj) {
      const vals = {};
      const prow = {};
      pj.eachRow((row, rn) => { const k = String(this.cellVal(row.getCell(1)) || '').trim().toLowerCase(); if (k) { const kk = ({ 'project name': 'nama project', 'status date': 'tanggal status', 'number of weeks': 'jumlah minggu' })[k] || k; vals[kk] = this.cellVal(row.getCell(2)); prow[kk] = rn; } });
      if (vals['nama project'] != null && String(vals['nama project']).trim()) next.project.name = String(vals['nama project']).trim();
      const s = this.toIso(vals['start date']);
      const e = this.toIso(vals['end date']);
      const st = this.toIso(vals['tanggal status']);
      if (vals['start date'] != null && !s) E('Project', prow['start date'], 2, 'Project sheet: Start Date is not a valid date (e.g. 2026-01-05).');
      if (vals['end date'] != null && !e) E('Project', prow['end date'], 2, 'Project sheet: End Date is not a valid date (e.g. 2026-06-26).');
      if (s) next.project.start = s;
      if (e) next.project.end = e;
      if (st) next.project.status = st;
      if (s && e && !WBS.weeksFor(s, e)) E('Project', prow['end date'], 2, 'Project sheet: End Date must be after Start Date.');
    } else notes.push('No Project sheet, the project period is unchanged.');
    const weeks = WBS.weeksFor(next.project.start, next.project.end) || WBS.weeks();
    const N = weeks.length;

    /* WBS */
    const ws = wb.getWorksheet('WBS');
    const oldItems = {};
    cur.phases.forEach((ph) => ph.items.forEach((it) => { oldItems[it.uid] = it; }));
    const oldPhases = {};
    cur.phases.forEach((ph) => { oldPhases[ph.uid] = ph; });
    const fileNo = {};
    if (ws) {
      const hm = this.headerMap(ws);
      if (!hm || !hm.map.level || !hm.map['nama kegiatan']) {
        E('WBS', hm ? hm.row : 4, 1, 'WBS sheet: column headers (ID, Level, Activity Name, Weight) not found.');
      } else {
        const M = hm.map;
        const cBobot = M['bobot (%)'] || M.bobot;
        const cId = M['id (sistem)'] || M.id;
        const phases = [];
        const seen = {};
        for (let r = hm.row + 1; r <= ws.rowCount; r += 1) {
          const row = ws.getRow(r);
          const lvl = String(this.cellVal(row.getCell(M.level)) || '').trim().toLowerCase();
          const name = String(this.cellVal(row.getCell(M['nama kegiatan'])) == null ? '' : this.cellVal(row.getCell(M['nama kegiatan']))).trim();
          let id = String(this.cellVal(row.getCell(cId)) || '').trim();
          if (lvl === 'total') break;
          if (!lvl && !name) continue;
          if (id && seen[id]) id = '';
          if (id) seen[id] = 1;
          if (lvl === 'activity') {
            if (!name) E('WBS', r, M['nama kegiatan'], 'WBS sheet row ' + r + ': Activity name is required.');
            const old = oldPhases[id];
            phases.push({ uid: id || newUid(), name: name, color: old ? old.color : PALETTE[phases.length % PALETTE.length], items: [] });
          } else if (lvl === 'sub activity') {
            if (!phases.length) { E('WBS', r, M.level, 'WBS sheet row ' + r + ': a Sub Activity must be below an Activity.'); continue; }
            if (!name) E('WBS', r, M['nama kegiatan'], 'WBS sheet row ' + r + ': Sub Activity name is required.');
            const raw = cBobot ? this.cellVal(row.getCell(cBobot)) : 0;
            const w = raw == null || raw === '' ? 0 : parseNum(raw);
            if (isNaN(w) || w > 100) E('WBS', r, cBobot, 'WBS sheet row ' + r + ': Weight must be a number 0–100 (now "' + raw + '").');
            const old = oldItems[id];
            const item = old ? Object.assign({}, old, { name: name, w: isNaN(w) ? 0 : w }) : { uid: id || newUid(), name: name, w: isNaN(w) ? 0 : w, s: 0, v: evenPlan(3), m: 'rata', actual: {}, isNew: true };
            phases[phases.length - 1].items.push(item);
            const noV = M.no ? String(this.cellVal(row.getCell(M.no)) == null ? '' : this.cellVal(row.getCell(M.no))).trim() : '';
            if (noV) fileNo[noV] = item;
          } else {
            E('WBS', r, M.level, 'WBS sheet row ' + r + ': Level must be "Activity" or "Sub Activity" (sekarang "' + lvl + '").');
          }
        }
        if (!phases.length) E('WBS', hm.row + 1, M.level, 'WBS sheet: no Activity found.');
        next.phases = phases;
      }
    } else notes.push('No WBS sheet, the activity structure is unchanged.');

    /* Timeline */
    const tl = wb.getWorksheet('Timeline');
    let schedCount = 0;
    if (tl) {
      const hm = this.headerMap(tl);
      if (!hm || !hm.map['minggu mulai'] || !hm.map['durasi (minggu)']) {
        E('Timeline', hm ? hm.row : 4, 1, 'Timeline sheet: column headers (ID, Start Week, Duration (weeks), Pattern) not found.');
      } else {
        const M = hm.map;
        const cId = M['id (sistem)'] || M.id;
        const wcol = {};
        Object.keys(M).forEach((k) => { const m = /^w(\d+)$/.exec(k.trim()); if (m) wcol[Number(m[1])] = M[k]; });
        if (!Object.keys(wcol).length && M.pola) { for (let k = 0; k < N; k += 1) wcol[k] = M.pola + 1 + k; }
        const byId = {};
        const byName = {};
        next.phases.forEach((ph) => ph.items.forEach((it) => { byId[it.uid] = it; const k = it.name.trim().toLowerCase(); if (!byName[k]) byName[k] = []; byName[k].push(it); }));
        const used = new Set();
        for (let r = hm.row + 1; r <= tl.rowCount; r += 1) {
          const row = tl.getRow(r);
          const id = String(this.cellVal(row.getCell(cId)) || '').trim();
          const lvl = String(this.cellVal(row.getCell(M.level || 2)) || '').trim().toLowerCase();
          if (lvl === 'activity') continue;
          let it = id ? byId[id] : null;
          if (!it) {
            const nm = String(this.cellVal(row.getCell(M['nama kegiatan'] || 4)) || '').trim().toLowerCase();
            it = nm && byName[nm] ? byName[nm].find((x) => !used.has(x)) : null;
          }
          if (!it || used.has(it)) continue;
          used.add(it);
          const sRaw = this.cellVal(row.getCell(M['minggu mulai']));
          const nRaw = this.cellVal(row.getCell(M['durasi (minggu)']));
          const pRaw0 = String(this.cellVal(row.getCell(M.pola)) || 'Even').trim().toLowerCase();
          const pRaw = ({ even: 'rata', custom: 'kustom' })[pRaw0] || pRaw0;
          if ((sRaw == null || sRaw === '') && (nRaw == null || nRaw === '')) continue;
          const s = Number(sRaw);
          const n = Number(nRaw);
          const no = String(this.cellVal(row.getCell(M.no || 3)) || '');
          const lab = 'Timeline sheet row ' + r + (no ? ' (' + no + ')' : '') + ': ';
          let bad = false;
          if (!Number.isInteger(s) || s < 0 || s > N - 2) { E('Timeline', r, M['minggu mulai'], lab + 'Start Week must be a whole number 0–' + (N - 2) + ' (sekarang "' + sRaw + '").'); bad = true; }
          if (!Number.isInteger(n) || n < 1) { E('Timeline', r, M['durasi (minggu)'], lab + 'Duration must be a whole number of at least 1 (now "' + nRaw + '").'); bad = true; }
          if (!bad && s + n > N - 1) { E('Timeline', r, M['durasi (minggu)'], lab + 'Start Week + Duration goes past the last week W' + (N - 1) + '.'); bad = true; }
          if (pRaw !== 'rata' && pRaw !== 'kustom') { E('Timeline', r, M.pola, lab + 'Pattern must be "Even" or "Custom".'); bad = true; }
          if (bad) continue;
          let v = evenPlan(n);
          let m = 'rata';
          if (pRaw === 'kustom') {
            m = 'kustom';
            v = [];
            for (let k = s; k < s + n; k += 1) {
              const c = wcol[k];
              const raw = c ? this.cellVal(row.getCell(c)) : null;
              const x = raw == null || raw === '' ? 0 : parseNum(raw);
              if (isNaN(x) || x > 100) { E('Timeline', r, c || M.pola, lab + 'value W' + k + ' must be a number 0–99 (now "' + raw + '").'); v.push(0); } else v.push(Math.min(99, Math.round(x)));
            }
          }
          Object.assign(it, { s: s, v: v, m: m, unset: false });
          delete it.isNew;
          schedCount += 1;
        }
      }
    } else notes.push('No Timeline sheet (older WBS file). Existing sub activity schedules are kept.');

    const findItem = (id, nm, used) => {
      const all = [];
      next.phases.forEach((ph) => ph.items.forEach((it) => all.push(it)));
      let it = id ? all.find((x) => x.uid === id) : null;
      if (!it && nm) { const k = nm.trim().toLowerCase(); it = all.find((x) => x.name.trim().toLowerCase() === k && !(used && used.has(x))); }
      return it || null;
    };

    /* Aktual */
    const aks = wb.getWorksheet('Actual');
    let actCount = 0;
    if (aks) {
      const hm = this.headerMap(aks);
      const M = hm ? hm.map : {};
      const wcol = {};
      Object.keys(M).forEach((k) => { const m = /^w(\d+)$/.exec(k.trim()); if (m) wcol[Number(m[1])] = M[k]; });
      if (!hm || !Object.keys(wcol).length) {
        if (hm && M['bobot (%)']) { for (let k = 0; k < N; k += 1) wcol[k] = M['bobot (%)'] + 1 + k; }
        else E('Actual', hm ? hm.row : 4, 1, 'Actual sheet: column headers (ID, Activity Name, W0, W1, ...) not found.');
      }
      if (hm && Object.keys(wcol).length) {
        const cId = M['id (sistem)'] || M.id;
        const used = new Set();
        for (let r = hm.row + 1; r <= aks.rowCount; r += 1) {
          const row = aks.getRow(r);
          const lvl = String(this.cellVal(row.getCell(M.level || 2)) || '').trim().toLowerCase();
          if (lvl === 'activity') continue;
          const id = String(this.cellVal(row.getCell(cId)) || '').trim();
          const nm = String(this.cellVal(row.getCell(M['nama kegiatan'] || 4)) || '').trim();
          const it = findItem(id, nm, used);
          if (!it || used.has(it)) continue;
          used.add(it);
          const no = String(this.cellVal(row.getCell(M.no || 3)) || '');
          const lab = 'Actual sheet row ' + r + (no ? ' (' + no + ')' : '') + ': ';
          const act = {};
          let prev = 0;
          for (let k = 0; k < N; k += 1) {
            const c = wcol[k];
            if (!c) continue;
            const raw = this.cellVal(row.getCell(c));
            if (raw == null || raw === '') continue;
            const x = parseNum(raw);
            if (isNaN(x) || x > 100) { E('Actual', r, c, lab + 'actual W' + k + ' must be a number 0–100 (now "' + raw + '").'); continue; }
            if (x < prev) { E('Actual', r, c, lab + 'actual W' + k + ' (' + fmtNum(x) + ') is lower than the previous week (' + fmtNum(prev) + '). Actual progress is cumulative.'); continue; }
            act[k] = Math.round(x * 100) / 100;
            prev = x;
          }
          it.actual = act;
          actCount += 1;
        }
      }
    } else notes.push('No Actual sheet (older file). Existing actual progress is kept.');

    /* Kendala */
    const kds = wb.getWorksheet('Issues');
    let kendalaNext = null;
    if (kds) {
      const hm = this.headerMap(kds);
      const M = hm ? hm.map : {};
      if (!hm || !M['uraian kendala']) E('Issues', hm ? hm.row : 4, 1, 'Issues sheet: column headers (ID, Activity (No), Category, Impact, PIC, Target Date, Status, Issue Description) not found.');
      else {
        const KAT = ['Technical', 'Resources', 'User / Business', 'Vendor', 'Infrastructure'];
        const pick = (list, v) => list.find((x) => x.toLowerCase() === String(v).trim().toLowerCase());
        const oldK = {};
        (cur.report && cur.report.kendala || []).forEach((k) => { oldK[k.id] = k; });
        const codeNow = {};
        next.phases.forEach((ph, pi) => ph.items.forEach((it, ii) => { codeNow[(pi + 1) + '-' + (ii + 1)] = it; }));
        kendalaNext = [];
        const seenK = {};
        let seq = 0;
        (cur.report && cur.report.kendala || []).forEach((k) => { const n = parseInt(String(k.id).replace(/\D/g, ''), 10); if (n > seq) seq = n; });
        const v = (row, key) => { const c = M[key]; if (!c) return ''; const x = this.cellVal(row.getCell(c)); return x == null ? '' : x; };
        for (let r = hm.row + 1; r <= kds.rowCount; r += 1) {
          const row = kds.getRow(r);
          const uraian = String(v(row, 'uraian kendala')).trim();
          const actRaw = String(v(row, 'activity (no)') instanceof Date ? '' : v(row, 'activity (no)')).trim();
          const anyVal = ['activity (no)', 'kategori', 'dampak', 'pic', 'target selesai', 'rencana tindakan'].some((k) => String(v(row, k)).trim() !== '');
          if (!uraian) { if (anyVal) E('Issues', r, M['uraian kendala'], 'Issues sheet row ' + r + ': Issue Description is required.'); continue; }
          const lab = 'Issues sheet row ' + r + ': ';
          let id = String(v(row, 'id (sistem)')).trim();
          if (id && seenK[id]) id = '';
          let uid = '';
          if (actRaw) {
            const it = fileNo[actRaw] || (!wb.getWorksheet('WBS') ? codeNow[actRaw] : null) || findItem('', actRaw, null);
            if (!it) E('Issues', r, M['activity (no)'], lab + 'Activity "' + actRaw + '" not found in the WBS sheet. Enter the sub activity No (e.g. 3-4) or its name.');
            else uid = it.uid;
          }
          const katRaw = String(v(row, 'kategori')).trim();
          const kat = katRaw ? pick(KAT, katRaw) : 'Technical';
          if (!kat) E('Issues', r, M.kategori, lab + 'Category must be one of ' + KAT.join(', ') + '.');
          const dRaw = String(v(row, 'dampak')).trim();
          const dampak = dRaw ? pick(['High', 'Medium', 'Low'], dRaw) : 'Medium';
          if (!dampak) E('Issues', r, M.dampak, lab + 'Impact must be High, Medium or Low.');
          const sRaw = String(v(row, 'status')).trim();
          const status = sRaw ? pick(['Open', 'Ongoing', 'Done'], sRaw) : 'Open';
          if (!status) E('Issues', r, M.status, lab + 'Status must be Open, Ongoing or Done.');
          const tRaw = v(row, 'target selesai');
          const target = tRaw === '' ? '' : this.toIso(tRaw);
          if (tRaw !== '' && !target) E('Issues', r, M['target selesai'], lab + 'Target Date is not a valid date (e.g. 2026-12-31).');
          if (!id) { seq += 1; id = 'K-' + String(seq).padStart(3, '0'); }
          seenK[id] = 1;
          const old = oldK[id] || {};
          kendalaNext.push({ id: id, uid: uid, kat: kat || 'Technical', dampak: dampak || 'Medium', pic: String(v(row, 'pic')).trim(), target: target || '', status: status || 'Open', uraian: uraian, tindakan: String(v(row, 'rencana tindakan')).trim(), wk: old.wk != null ? old.wk : null });
        }
      }
    }

    if (errors.length) return { ok: false, errors: errors, locs: locs, wb: wb, fname: file.name, structErr: locs.some((l) => l.sh !== 'Timeline') };
    if (!next.report) next.report = { kendala: [], weeks: {} };
    if (kendalaNext) next.report.kendala = kendalaNext;
    let newCount = 0;
    next.phases.forEach((ph) => ph.items.forEach((it) => { if (it.isNew) { newCount += 1; delete it.isNew; } }));
    WBS.replace(next);
    const tot = WBS.totals();
    const nItems = tot.count;
    const lines = [next.phases.length + ' activities and ' + nItems + ' sub activities loaded. Period ' + fmtDate(isoToDate(next.project.start)) + ' to ' + fmtDate(isoToDate(next.project.end)) + '.'];
    if (tl) lines.push(schedCount + ' sub activity schedules updated from the Timeline sheet.');
    if (aks) lines.push(actCount + ' actual progress rows loaded from the Actual sheet.');
    if (kendalaNext) lines.push(kendalaNext.length + ' issues loaded from the Issues sheet.');
    if (newCount) lines.push(newCount + ' new sub activities got a default schedule of W0, 3 weeks. Adjust it in the Timeline tab.');
    if (Math.abs(tot.total - 100) >= 0.005) lines.push('Attention: total weight ' + fmtNum(tot.total) + '%, not 100% yet.');
    return { ok: true, lines: lines.concat(notes) };
  },
};

function msgOk(title, lines) { return { title: title, lines: lines || [], bg: '#E8F8EF', fg: '#05603A', bd: '#B7E4CB' }; }
function msgErr(title, lines) { return { title: title, lines: lines || [], bg: '#FFF2F2', fg: '#912018', bd: '#F5C2C0' }; }

function xlActions(comp, kind, inputId) {
  return {
    pickImport: () => { const el = document.getElementById(inputId); if (el) { el.value = ''; el.click(); } },
    onImportFile: async (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      try {
        const res = await XL.importFile(f);
        if (res.ok) comp.setState({ msg: msgOk('Import complete: ' + f.name, res.lines), saved: false });
        else {
          const m = msgErr('Import cancelled, data not changed. There are ' + res.errors.length + ' items to fix in the Excel file:', res.errors.slice(0, 20).concat(res.errors.length > 20 ? ['…and ' + (res.errors.length - 20) + ' more (see the Error List sheet in the correction file).'] : []));
          m.actions = [{ t: 'Download the correction file (red highlights)', pri: true, on: async () => {
            try { const n = await XL.downloadFix(res); comp.setState({ msg: Object.assign({}, m, { lines: m.lines.concat(['File ' + n + ' has been downloaded. Wrong cells are red and have comments.']) }) }); } catch (err) { comp.setState({ msg: msgErr('The correction file could not be created', [String(err && err.message || err)]) }); }
          } }];
          if (kind === 'timeline') {
            m.actions.push({ t: 'Reset timeline (kosongkan persentase)', on: () => {
              WBS.mutate((d) => { d.phases.forEach((ph) => ph.items.forEach((it) => { it.unset = true; })); });
              comp.setState({ saved: false, msg: msgOk('Timeline reset', ['The planned percentages of all sub activities are cleared and need to be set again. Select each sub activity to set its start week, duration and pattern.', 'Activities, weights and the project period are unchanged.']) });
            } });
          }
          comp.setState({ msg: m });
        }
        if (res.ok && comp.afterImport) comp.afterImport();
      } catch (err) {
        comp.setState({ msg: msgErr('The file cannot be read', ['Make sure the file is an .xlsx created with Export Operations.', String(err && err.message || err)]) });
      }
    },
    downloadTemplate: async () => {
      try {
        const name = await XL.exportFile(kind, { template: true });
        comp.setState({ msg: msgOk('Template downloaded', ['File ' + name + ' contains sample rows and empty rows for a new project (Project, WBS, Timeline, Actual and Issues sheets). Fill it in following the Guide sheet, then use Import Operations.']) });
      } catch (err) {
        comp.setState({ msg: msgErr('Template could not be created', [String(err && err.message || err)]) });
      }
    },
    exportXlsx: async () => {
      try {
        const name = await XL.exportFile(kind);
        comp.setState({ msg: msgOk('Export complete', ['File ' + name + ' has been downloaded. It contains the Guide, Project, WBS, Timeline, Actual and Issues sheets.']) });
      } catch (err) {
        comp.setState({ msg: msgErr('Export failed', [String(err && err.message || err)]) });
      }
    },
    closeMsg: () => comp.setState({ msg: null }),
    askReset: () => {
      const m = msgErr('Back to Template?', ['All Operations data (WBS, timeline, actual progress, report notes and issues) will be replaced with the template data (dummy, 3 months starting today). Changes you made will be lost.']);
      m.actions = [
        { t: 'Yes, back to template', pri: true, on: () => {
          WBS.reset();
          if (comp.afterReset) comp.afterReset();
          comp.setState({ saved: false, closed: {}, msg: msgOk('Back to template', ['WBS, timeline, actual progress and report data have been restored to the template (dummy, 3 months starting today).']) });
        } },
        { t: 'Cancel', on: () => comp.setState({ msg: null }) },
      ];
      comp.setState({ msg: m });
    },
    saveAll: () => {
      const tot = WBS.totals();
      if (tot.invalid > 0 || Math.abs(tot.total - 100) >= 0.005) {
        comp.setState({ saved: false, msg: msgErr('Updates not saved', ['The total WBS weight must be 100% (now ' + fmtNum(tot.total) + '%). Fix the weights in the WBS tab first.']) });
        return;
      }
      const ok = WBS.persist();
      comp.setState({ saved: ok, msg: ok ? msgOk('Updates saved', ['WBS, timeline and report data are saved in this browser.']) : msgErr('Save failed', ['Browser storage is full. Remove or shrink images in the report notes.']) });
    },
  };
}

PAGES["main"] = { title: "WBS", tpl: "<div class=\"aksel-page\" data-aksel-page=\"main\">\n\n<header style=\"display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px\">\n<div style=\"display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 640px\">\n<h1 style=\"margin: 0; font-size: 22px; font-weight: 700; line-height: 30px; letter-spacing: -.02em\">WBS</h1>\n<p style=\"margin: 0; color: #526079; text-wrap: pretty\">Build the activities and sub activities of project {{projectName}}, then distribute 100% of progress across the sub activities. An activity’s weight is the sum of its sub activity weights.</p>\n</div>\n<div style=\"display: flex; flex-wrap: wrap; align-items: center; gap: 10px\">\n<template data-sc=\"if\" value=\"{{saved}}\" hint-placeholder-val=\"{{false}}\">\n<span role=\"status\" style=\"display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 650; color: #087443\">\n<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 12.5l4.5 4.5L19 7.5\"></path></svg>\n<span>WBS saved</span>\n</span>\n</template>\n<div class=\"ops-hidden\" aria-hidden=\"true\"><input type=\"file\" id=\"wbs-import-file\" accept=\".xlsx\" onChange=\"{{onImportFile}}\" tabindex=\"-1\"><button type=\"button\" tabindex=\"-1\" data-ops=\"template\" onClick=\"{{downloadTemplate}}\">t</button><button type=\"button\" tabindex=\"-1\" data-ops=\"import\" onClick=\"{{pickImport}}\">i</button><button type=\"button\" tabindex=\"-1\" data-ops=\"export\" onClick=\"{{exportXlsx}}\">e</button><button type=\"button\" tabindex=\"-1\" data-ops=\"reset\" onClick=\"{{askReset}}\">r</button><button type=\"button\" tabindex=\"-1\" data-ops=\"save\" onClick=\"{{saveAll}}\">s</button></div>\n</div>\n</header>\n\n<template data-sc=\"if\" value=\"{{msg}}\" hint-placeholder-val=\"{{false}}\">\n<div role=\"status\" style=\"display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 12px; border: 1px solid {{msg.bd}}; background: {{msg.bg}}; color: {{msg.fg}}\">\n<div style=\"display: flex; flex-direction: column; gap: 4px; min-width: 0\">\n<strong style=\"font-size: 14px\">{{msg.title}}</strong>\n<template data-sc=\"for\" list=\"{{msg.lines}}\" as=\"ln\">\n<span style=\"font-size: 13px\">{{ln}}</span>\n</template>\n<template data-sc=\"if\" value=\"{{msg.actions}}\">\n<div style=\"display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px\">\n<template data-sc=\"for\" list=\"{{msg.actions}}\" as=\"b\">\n<button type=\"button\" onClick=\"{{b.on}}\" class=\"aks-mini\" style=\"height: 38px; padding: 0 14px\">{{b.t}}</button>\n</template>\n</div>\n</template>\n</div>\n<button type=\"button\" onClick=\"{{closeMsg}}\" aria-label=\"Close message\" style=\"flex: none; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 18px; line-height: 1\">×</button>\n</div>\n</template>\n\n<section aria-label=\"Weight allocation\" style=\"background: #FFFFFF; border: 1px solid #E1E7F1; border-radius: 14px; padding: 22px 24px 14px; display: flex; flex-direction: column; gap: 16px\">\n<div style=\"display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px\">\n<div style=\"display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px\">\n<span style=\"font-size: 13px; font-weight: 650; line-height: 19px\">Total weight</span>\n<span style=\"font-size: 30px; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; font-variant-numeric: tabular-nums\">{{totalText}}</span>\n<span style=\"color: #526079\">of 100%</span>\n<template data-sc=\"if\" value=\"{{balanced}}\" hint-placeholder-val=\"{{true}}\">\n<span style=\"align-self: center; display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border-radius: 999px; background: #E8F8EF; color: #087443; font-size: 12px; font-weight: 750\">Balanced</span>\n</template>\n<template data-sc=\"if\" value=\"{{unbalanced}}\" hint-placeholder-val=\"{{false}}\">\n<span style=\"align-self: center; display: inline-flex; align-items: center; height: 28px; padding: 0 12px; border-radius: 999px; background: #FFF2F2; color: #B42318; font-size: 12px; font-weight: 750; font-variant-numeric: tabular-nums\">{{diffText}}</span>\n</template>\n</div>\n<span role=\"status\" style=\"font-size: 13px; color: #526079\">{{hint}}</span>\n</div>\n\n<div style=\"display: flex; flex-direction: column; gap: 6px\">\n<div role=\"img\" aria-label=\"{{rulerLabel}}\" style=\"display: flex; height: 36px; border-radius: 10px; overflow: hidden; background: repeating-linear-gradient(135deg,#E1E7F1 0 6px,#F3F6FC 6px 12px)\">\n<template data-sc=\"for\" list=\"{{segs}}\" as=\"s\">\n<div title=\"{{s.tip}}\" style=\"flex: 0 0 auto; width: {{s.w}}%; background: {{s.c}}; box-shadow: inset {{s.sep}} 0 0 #FFFFFF\"></div>\n</template>\n</div>\n<div aria-hidden=\"true\" style=\"display: flex; justify-content: space-between; font-size: 12px; color: #526079; font-variant-numeric: tabular-nums\">\n<span>0%</span>\n<span>25%</span>\n<span>50%</span>\n<span>75%</span>\n<span>100%</span>\n</div>\n</div>\n\n<div style=\"display: flex; flex-wrap: wrap; gap: 0 28px\">\n<template data-sc=\"for\" list=\"{{phases}}\" as=\"ph\">\n<a href=\"{{ph.href}}\" style=\"display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: #1C2940; font-size: 13px; text-decoration: none\">\n<span aria-hidden=\"true\" style=\"flex: none; width: 12px; height: 12px; border-radius: 3px; background: {{ph.c}}\"></span>\n<span style=\"font-weight: 650\">{{ph.name}}</span>\n<span style=\"color: #526079; font-variant-numeric: tabular-nums\">{{ph.sumText}}</span>\n</a>\n</template>\n</div>\n</section>\n\n<section aria-label=\"Activities and weights\" style=\"background: #FFFFFF; border: 1px solid #E1E7F1; border-radius: 14px; overflow: hidden\">\n<div style=\"overflow-x: auto\">\n<div style=\"min-width: 720px\">\n\n<div class=\"wbs-grid\" style=\"height: 44px; background: #F8FAFD; border-bottom: 1px solid #E1E7F1; font-size: 12px; font-weight: 750; color: #526079\">\n<span>No</span>\n<span>Activity</span>\n<span style=\"text-align: right; padding-right: 13px\">Weight</span>\n<span style=\"text-align: right\">Actions</span>\n</div>\n\n<template data-sc=\"for\" list=\"{{phases}}\" as=\"ph\">\n<div id=\"{{ph.anchor}}\" class=\"wbs-grid\" style=\"min-height: 60px; background: #F2F5FF; border-bottom: 1px solid #E1E7F1\">\n<div style=\"display: flex; align-items: center; gap: 6px\">\n<button type=\"button\" onClick=\"{{ph.toggle}}\" aria-expanded=\"{{ph.open}}\" aria-label=\"{{ph.toggleLabel}}\" style=\"flex: none; width: 28px; height: 36px; padding: 0; border: 0; background: transparent; color: #1C2940; cursor: pointer; display: flex; align-items: center; justify-content: center\">\n<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" style=\"transform: rotate({{ph.rot}})\"><path d=\"M6 9l6 6 6-6\"></path></svg>\n</button>\n<span aria-hidden=\"true\" style=\"flex: none; width: 12px; height: 12px; border-radius: 3px; background: {{ph.c}}\"></span>\n<span style=\"font-size: 15px; font-weight: 750; font-variant-numeric: tabular-nums\">{{ph.no}}</span>\n</div>\n<div style=\"display: flex; align-items: center; gap: 10px; min-width: 0\">\n<input class=\"ctl\" type=\"text\" aria-label=\"{{ph.nameLabel}}\" value=\"{{ph.name}}\" onChange=\"{{ph.onName}}\" style=\"box-sizing: border-box; flex: 1; min-width: 0; height: 40px; padding: 0 12px; border: 1px solid {{ph.nameBd}}; border-radius: 10px; background: #FFFFFF; color: #1C2940; font: inherit; font-size: 15px; font-weight: 750\">\n<span style=\"flex: none; font-size: 12px; color: #526079\">{{ph.countText}}</span>\n</div>\n<div style=\"box-sizing: border-box; height: 44px; padding: 0 13px; border: 1px solid #E4EAF4; border-radius: 10px; background: #F4F7FC; color: #344767; display: flex; align-items: center; justify-content: flex-end; font-size: 14px; font-weight: 750; font-variant-numeric: tabular-nums\">{{ph.sumText}}</div>\n<div style=\"display: flex; justify-content: flex-end; gap: 6px\">\n<button type=\"button\" onClick=\"{{ph.addSub}}\" class=\"aks-mini\" title=\"Add a sub activity at the end of this activity\">+ Sub</button>\n<button type=\"button\" onClick=\"{{ph.addPhase}}\" class=\"aks-mini\" title=\"Add a new activity below this activity\">+ Activity</button>\n<button type=\"button\" onClick=\"{{ph.del}}\" class=\"aks-mini aks-mini-del\" title=\"{{ph.delTitle}}\" aria-label=\"{{ph.delTitle}}\">\n<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3\"></path></svg>\n</button>\n</div>\n</div>\n<template data-sc=\"if\" value=\"{{ph.open}}\">\n<template data-sc=\"if\" value=\"{{ph.empty}}\">\n<div class=\"wbs-grid\" style=\"min-height: 52px; border-bottom: 1px solid #E1E7F1; color: #67748B; font-size: 13px\">\n<span></span>\n<span>No sub activities yet. Click \"+ Sub\" to add one.</span>\n<span></span>\n<span></span>\n</div>\n</template>\n<template data-sc=\"for\" list=\"{{ph.items}}\" as=\"a\">\n<div class=\"wbs-grid\" style=\"min-height: 56px; border-bottom: 1px solid #E1E7F1; background: {{a.rowBg}}\">\n<span style=\"font-size: 13px; color: #526079; font-variant-numeric: tabular-nums; padding-left: 34px\">{{a.id}}</span>\n<input class=\"ctl\" type=\"text\" aria-label=\"{{a.nameLabel}}\" value=\"{{a.name}}\" onChange=\"{{a.onName}}\" style=\"box-sizing: border-box; width: 100%; min-width: 0; height: 40px; padding: 0 12px; border: 1px solid {{a.nameBd}}; border-radius: 10px; background: #FFFFFF; color: #1C2940; font: inherit; font-size: 14px\">\n<div style=\"position: relative\">\n<input class=\"ctl\" type=\"text\" inputmode=\"decimal\" aria-label=\"{{a.label}}\" value=\"{{a.val}}\" onChange=\"{{a.onW}}\" style=\"box-sizing: border-box; width: 100%; height: 44px; padding: 0 34px 0 13px; border: 1px solid {{a.bd}}; border-radius: 10px; background: #FFFFFF; color: #1C2940; font: inherit; font-size: 14px; line-height: 20px; text-align: right; font-variant-numeric: tabular-nums\">\n<span aria-hidden=\"true\" style=\"position: absolute; top: 0; right: 13px; height: 44px; display: flex; align-items: center; color: #67748B\">%</span>\n</div>\n<div style=\"display: flex; justify-content: flex-end; gap: 6px\">\n<button type=\"button\" onClick=\"{{a.addBelow}}\" class=\"aks-mini\" title=\"Add a new sub activity below this row\">+ Sub</button>\n<button type=\"button\" onClick=\"{{a.del}}\" class=\"aks-mini aks-mini-del\" title=\"{{a.delTitle}}\" aria-label=\"{{a.delTitle}}\">\n<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3\"></path></svg>\n</button>\n</div>\n</div>\n</template>\n</template>\n</template>\n\n<div class=\"wbs-grid\" style=\"min-height: 64px; background: #F8FAFD\">\n<span></span>\n<span style=\"font-weight: 750\">Total project weight</span>\n<div style=\"box-sizing: border-box; height: 44px; padding: 0 13px; border: 1px solid #E4EAF4; border-radius: 10px; background: #F4F7FC; color: #344767; display: flex; align-items: center; justify-content: flex-end; font-size: 14px; font-weight: 750; font-variant-numeric: tabular-nums\">{{totalText}}</div>\n<div style=\"display: flex; justify-content: flex-end\">\n<button type=\"button\" onClick=\"{{addPhaseEnd}}\" class=\"aks-mini\" title=\"Add a new activity at the end of the list\">+ Activity</button>\n</div>\n</div>\n\n</div>\n</div>\n</section>\n\n</div>\n", Logic: (function () {

class Component extends DCLogic {
  mut(fn) { WBS.mutate(fn); this.setState({ saved: false }); }

  toggle(uid) {
    const closed = Object.assign({}, (this.state || {}).closed || {});
    closed[uid] = !closed[uid];
    this.setState({ closed: closed });
  }

  renderVals() {
    const st = this.state || {};
    const closed = st.closed || {};
    const d = WBS.get();
    const tot = WBS.totals();
    const total = tot.total;
    const scale = Math.max(total, 100);
    const segs = [];
    const nPh = d.phases.length;

    const phases = d.phases.map((ph, pi) => {
      const open = !closed[ph.uid];
      let sum = 0;
      const items = ph.items.map((it, ii) => {
        const n = parseNum(it.w);
        const ok = !isNaN(n);
        const val = ok ? n : 0;
        sum += val;
        const code = (pi + 1) + '-' + (ii + 1);
        const lastInPhase = ii === ph.items.length - 1;
        segs.push({
          w: (val / scale * 100).toFixed(4),
          c: ph.color,
          sep: lastInPhase && pi === nPh - 1 ? '0px' : (lastInPhase ? '-3px' : '-1px'),
          tip: code + ' ' + it.name + ': ' + fmtNum(val) + '%',
        });
        return {
          id: code,
          name: it.name,
          val: typeof it.w === 'number' ? fmtNum(it.w) : String(it.w),
          label: 'Weight ' + code + ' ' + it.name + ', in percent',
          nameLabel: 'Sub activity name ' + code,
          bd: ok ? '#E1E7F1' : '#E23F3F',
          nameBd: it.name.trim() ? '#E1E7F1' : '#E23F3F',
          rowBg: ii % 2 ? '#F5F7FC' : '#FFFFFF',
          delTitle: 'Delete sub activity ' + code,
          onW: (e) => this.mut((dd) => { const raw = String(e.target.value).trim(); const x = parseNum(raw); dd.phases[pi].items[ii].w = isNaN(x) ? raw : x; }),
          onName: (e) => this.mut((dd) => { dd.phases[pi].items[ii].name = String(e.target.value); }),
          addBelow: () => this.mut((dd) => { const arr = dd.phases[pi].items; arr.splice(ii + 1, 0, WBS.newItem(arr[ii])); }),
          del: () => this.mut((dd) => { dd.phases[pi].items.splice(ii, 1); }),
        };
      });
      return {
        no: String(pi + 1),
        name: ph.name,
        c: ph.color,
        items: items,
        empty: items.length === 0,
        open: open,
        anchor: 'fase-' + ph.uid,
        href: '#fase-' + ph.uid,
        rot: open ? '0deg' : '-90deg',
        toggleLabel: (open ? 'Close' : 'Open') + ' activity ' + (pi + 1),
        nameLabel: 'Activity name ' + (pi + 1),
        nameBd: ph.name.trim() ? '#C5D0E2' : '#E23F3F',
        countText: ph.items.length + ' sub activity',
        sumText: fmtNum(sum) + '%',
        delTitle: nPh > 1 ? 'Delete activity ' + (pi + 1) + ' and its sub activities' : 'There must be at least one activity',
        toggle: () => this.toggle(ph.uid),
        onName: (e) => this.mut((dd) => { dd.phases[pi].name = String(e.target.value); }),
        addSub: () => { this.mut((dd) => { const arr = dd.phases[pi].items; arr.push(WBS.newItem(arr[arr.length - 1])); }); const c = Object.assign({}, closed); delete c[ph.uid]; this.setState({ closed: c }); },
        addPhase: () => this.mut((dd) => { dd.phases.splice(pi + 1, 0, WBS.newPhase()); }),
        del: () => { if (nPh > 1) this.mut((dd) => { dd.phases.splice(pi, 1); }); },
      };
    });

    const diff = Math.round((100 - total) * 100) / 100;
    const balanced = tot.invalid === 0 && Math.abs(diff) < 0.005;
    let diffText = '';
    let hint = 'All 100% is distributed across ' + tot.count + ' sub activities in ' + nPh + ' activity.';
    if (tot.invalid > 0) {
      diffText = 'Check the inputs';
      hint = 'Some weights are empty or not numbers. Enter a number of 0 or more.';
    } else if (diff > 0) {
      diffText = 'Short by ' + fmtNum(diff) + '%';
      hint = 'Add ' + fmtNum(diff) + '% more to bring the total to 100%.';
    } else if (diff < 0) {
      diffText = 'Over by ' + fmtNum(-diff) + '%';
      hint = 'Reduce ' + fmtNum(-diff) + '% to bring the total to 100%.';
    }

    return Object.assign({
      projectName: d.project.name,
      phases: phases,
      segs: segs,
      totalText: fmtNum(total) + '%',
      balanced: balanced,
      unbalanced: !balanced,
      diffText: diffText,
      hint: hint,
      saved: !!st.saved && balanced,
      msg: st.msg || null,
      rulerLabel: 'Weight allocation per sub activity, total ' + fmtNum(total) + '% of 100%',
      reset: () => { WBS.reset(); this.setState({ saved: false, closed: {}, msg: msgOk('WBS restored to the template', ['Activities, weights, schedules, actuals and the project period are back to the template data (dummy, 3 months starting today).']) }); },
      save: () => { WBS.persist(); this.setState({ saved: true }); },
      addPhaseEnd: () => this.mut((dd) => { dd.phases.push(WBS.newPhase()); }),
    }, xlActions(this, 'wbs', 'wbs-import-file'));
  }
}

return Component;
})() };
PAGES["scheduling"] = { title: "Timeline", tpl: "<div class=\"aksel-page\" data-aksel-page=\"scheduling\">\n\n<header style=\"display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px\">\n<div style=\"display: flex; flex-direction: column; gap: 4px; min-width: 0; max-width: 660px\">\n<h1 style=\"margin: 0; font-size: 22px; font-weight: 700; line-height: 30px; letter-spacing: -.02em\">Timeline</h1>\n<p style=\"margin: 0; color: #526079; text-wrap: pretty\">Plan the cumulative progress of each sub activity per week, from W0 to {{lastWk}} ({{periodText}}). The project plan curve is calculated from weight times plan.</p>\n</div>\n<div style=\"display: flex; flex-wrap: wrap; align-items: center; gap: 10px\">\n<template data-sc=\"if\" value=\"{{saved}}\" hint-placeholder-val=\"{{false}}\">\n<span role=\"status\" style=\"display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 650; color: #087443\">\n<svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M5 12.5l4.5 4.5L19 7.5\"></path></svg>\n<span>Timeline saved</span>\n</span>\n</template>\n<div class=\"ops-hidden\" aria-hidden=\"true\"><input type=\"file\" id=\"tl-import-file\" accept=\".xlsx\" onChange=\"{{onImportFile}}\" tabindex=\"-1\"><button type=\"button\" tabindex=\"-1\" data-ops=\"template\" onClick=\"{{downloadTemplate}}\">t</button><button type=\"button\" tabindex=\"-1\" data-ops=\"import\" onClick=\"{{pickImport}}\">i</button><button type=\"button\" tabindex=\"-1\" data-ops=\"export\" onClick=\"{{exportXlsx}}\">e</button><button type=\"button\" tabindex=\"-1\" data-ops=\"reset\" onClick=\"{{askReset}}\">r</button><button type=\"button\" tabindex=\"-1\" data-ops=\"save\" onClick=\"{{saveAll}}\">s</button></div>\n</div>\n</header>\n\n<template data-sc=\"if\" value=\"{{msg}}\">\n<div role=\"status\" style=\"display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 12px; border: 1px solid {{msg.bd}}; background: {{msg.bg}}; color: {{msg.fg}}\">\n<div style=\"display: flex; flex-direction: column; gap: 4px; min-width: 0\">\n<strong style=\"font-size: 14px\">{{msg.title}}</strong>\n<template data-sc=\"for\" list=\"{{msg.lines}}\" as=\"ln\">\n<span style=\"font-size: 13px\">{{ln}}</span>\n</template>\n<template data-sc=\"if\" value=\"{{msg.actions}}\">\n<div style=\"display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px\">\n<template data-sc=\"for\" list=\"{{msg.actions}}\" as=\"b\">\n<button type=\"button\" onClick=\"{{b.on}}\" class=\"aks-mini\" style=\"height: 38px; padding: 0 14px\">{{b.t}}</button>\n</template>\n</div>\n</template>\n</div>\n<button type=\"button\" onClick=\"{{closeMsg}}\" aria-label=\"Close message\" style=\"flex: none; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 18px; line-height: 1\">×</button>\n</div>\n</template>\n\n<section aria-label=\"Project period\" style=\"background: #FFFFFF; border: 1px solid #E1E7F1; border-radius: 14px; padding: 18px 20px; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 16px 20px\">\n<div style=\"display: flex; flex-direction: column; gap: 2px; min-width: 200px; flex: 1\">\n<h2 style=\"margin: 0; font-size: 16px; font-weight: 750; line-height: 24px\">Project period</h2>\n<span style=\"font-size: 13px; color: #526079\">{{periodHint}}</span>\n</div>\n<label style=\"display: flex; flex-direction: column; gap: 8px\">\n<span style=\"font-size: 13px; font-weight: 650\">Start Date</span>\n<input class=\"ctl\" type=\"date\" value=\"{{startIso}}\" onChange=\"{{onStart}}\" style=\"box-sizing: border-box; height: 46px; padding: 0 12px; border: 1px solid #E1E7F1; border-radius: 10px; background: #FFFFFF; color: #1C2940; font: inherit; font-size: 14px\">\n</label>\n<label style=\"display: flex; flex-direction: column; gap: 8px\">\n<span style=\"font-size: 13px; font-weight: 650\">End Date</span>\n<input class=\"ctl\" type=\"date\" value=\"{{endIso}}\" onChange=\"{{onEnd}}\" style=\"box-sizing: border-box; height: 46px; padding: 0 12px; border: 1px solid #E1E7F1; border-radius: 10px; background: #FFFFFF; color: #1C2940; font: inherit; font-size: 14px\">\n</label>\n<label style=\"display: flex; flex-direction: column; gap: 8px\">\n<span style=\"font-size: 13px; font-weight: 650\">Status date (current week)</span>\n<input class=\"ctl\" type=\"date\" value=\"{{statusIso}}\" onChange=\"{{onStatus}}\" style=\"box-sizing: border-box; height: 46px; padding: 0 12px; border: 1px solid #E1E7F1; border-radius: 10px; background: #FFFFFF; color: #1C2940; font: inherit; font-size: 14px\">\n</label>\n<div style=\"box-sizing: border-box; height: 46px; padding: 0 14px; border: 1px solid #E4EAF4; border-radius: 10px; background: #F4F7FC; color: #344767; display: flex; align-items: center; gap: 6px; font-size: 14px; font-variant-numeric: tabular-nums\"><strong>{{nWeeks}}</strong><span>weeks, {{durDays}} days</span></div>\n</section>\n\n\n<section aria-label=\"Schedule matrix\" style=\"background: #FFFFFF; border: 1px solid #E1E7F1; border-radius: 14px; overflow: hidden\">\n\n<div style=\"display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; padding: 18px 20px 16px\">\n<div style=\"display: flex; flex-direction: column; gap: 2px\">\n<h2 style=\"margin: 0; font-size: 16px; font-weight: 750; line-height: 24px\">Planned cumulative progress per week</h2>\n<span style=\"font-size: 13px; color: #526079\">Each cell is a percentage. Select a sub activity to set its schedule. Names and weights are set in the WBS tab.</span>\n<template data-sc=\"if\" value=\"{{unsetNote}}\"><span style=\"font-size: 13px; font-weight: 650; color: #93370D\">{{unsetNote}}</span></template>\n</div>\n<div style=\"display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; font-size: 12px; color: #526079\">\n<span style=\"display: inline-flex; align-items: center; gap: 6px\"><span aria-hidden=\"true\" style=\"width: 14px; height: 14px; border-radius: 4px; background: #E8EEFF; box-shadow: inset 0 0 0 1px #C5D0E2\"></span><span>1 to 33</span></span>\n<span style=\"display: inline-flex; align-items: center; gap: 6px\"><span aria-hidden=\"true\" style=\"width: 14px; height: 14px; border-radius: 4px; background: #78AAFF\"></span><span>34 to 66</span></span>\n<span style=\"display: inline-flex; align-items: center; gap: 6px\"><span aria-hidden=\"true\" style=\"width: 14px; height: 14px; border-radius: 4px; background: #2031A7\"></span><span>67 to 99</span></span>\n<span style=\"display: inline-flex; align-items: center; gap: 6px\"><span aria-hidden=\"true\" style=\"width: 14px; height: 14px; border-radius: 4px; background: #E8F8EF; box-shadow: inset 0 0 0 1px #14945C\"></span><span>100, done</span></span>\n<span style=\"display: inline-flex; align-items: center; gap: 6px\"><span style=\"padding: 0 6px; border-radius: 6px; background: #2031A7; color: #FFFFFF; font-size: 11px; font-weight: 750; line-height: 18px\">{{nowLabel}}</span><span>Current week, {{nowDate}}</span></span>\n</div>\n</div>\n\n<div style=\"overflow-x: auto\">\n<div style=\"min-width: {{minW}}px\">\n\n<div style=\"display: grid; grid-template-columns: {{gridCols}}; border-top: 1px solid #E1E7F1; border-bottom: 1px solid #C5D0E2\">\n<div style=\"grid-row: span 2; display: flex; align-items: flex-end; padding: 0 12px 10px 20px; font-size: 12px; font-weight: 750; color: #526079\">Activity</div>\n<div style=\"grid-row: span 2; display: flex; align-items: flex-end; justify-content: flex-end; padding: 0 10px 10px 0; font-size: 12px; font-weight: 750; color: #526079\">Weight</div>\n<template data-sc=\"for\" list=\"{{months}}\" as=\"m\" hint-placeholder-count=\"6\">\n<div style=\"grid-column: span {{m.span}}; padding: 8px 0 2px 7px; border-left: 1px solid #E1E7F1; font-size: 12px; font-weight: 750\">{{m.name}}</div>\n</template>\n<template data-sc=\"for\" list=\"{{weeks}}\" as=\"wk\" hint-placeholder-count=\"23\">\n<div style=\"display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 4px 0 8px; background: {{wk.col}}\">\n<span style=\"padding: 0 5px; border-radius: 6px; background: {{wk.bg}}; color: {{wk.fg}}; font-size: 11px; font-weight: 750; line-height: 18px; font-variant-numeric: tabular-nums\">{{wk.label}}</span>\n<span style=\"font-size: 11px; color: #526079; line-height: 16px; font-variant-numeric: tabular-nums\">{{wk.day}}</span>\n</div>\n</template>\n</div>\n\n<template data-sc=\"for\" list=\"{{phases}}\" as=\"ph\" hint-placeholder-count=\"4\">\n<div style=\"display: grid; grid-template-columns: {{gridCols}}; align-items: center; height: 40px; background: #F2F5FF; border-bottom: 1px solid #E1E7F1\">\n<div style=\"display: flex; align-items: center; gap: 10px; min-width: 0; padding: 0 12px 0 20px; font-size: 13px; font-weight: 750\">\n<span style=\"flex: none; width: 34px; font-variant-numeric: tabular-nums\">{{ph.no}}</span>\n<span style=\"min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap\">{{ph.name}}</span>\n</div>\n<span style=\"padding-right: 10px; text-align: right; font-size: 13px; font-weight: 750; font-variant-numeric: tabular-nums\">{{ph.wText}}</span>\n<template data-sc=\"for\" list=\"{{ph.cells}}\" as=\"c\" hint-placeholder-count=\"23\">\n<div aria-hidden=\"true\" style=\"height: 8px; background: {{c.bar}}; border-radius: {{c.rad}}\"></div>\n</template>\n</div>\n\n<template data-sc=\"for\" list=\"{{ph.items}}\" as=\"a\" hint-placeholder-count=\"3\">\n<div style=\"display: grid; grid-template-columns: {{gridCols}}; align-items: center; min-height: 40px; background: {{a.rowBg}}; border-bottom: 1px solid #E1E7F1\">\n<button type=\"button\" onClick=\"{{a.pick}}\" aria-pressed=\"{{a.sel}}\" title=\"{{a.full}}\" style=\"display: flex; align-items: center; gap: 10px; min-width: 0; height: 40px; padding: 0 12px 0 20px; border: 0; background: transparent; color: #1C2940; font: inherit; font-size: 13px; text-align: left; cursor: pointer\">\n<span style=\"flex: none; width: 34px; color: #526079; font-variant-numeric: tabular-nums\">{{a.id}}</span>\n<span style=\"min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: {{a.nameC}}; font-weight: {{a.nameW}}\">{{a.name}}</span>\n</button>\n<span style=\"padding-right: 10px; text-align: right; font-size: 13px; color: #526079; font-variant-numeric: tabular-nums\">{{a.wText}}</span>\n<template data-sc=\"for\" list=\"{{a.cells}}\" as=\"c\" hint-placeholder-count=\"23\">\n<div style=\"height: 40px; display: flex; align-items: center; justify-content: center; background: {{c.col}}\">\n<span style=\"width: {{c.w}}; height: {{c.h}}; border-radius: 6px; background: {{c.bg}}; color: {{c.fg}}; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 650; font-variant-numeric: tabular-nums\">{{c.t}}</span>\n</div>\n</template>\n</div>\n\n<template data-sc=\"if\" value=\"{{a.sel}}\" hint-placeholder-val=\"{{false}}\">\n<div style=\"padding: 16px 20px 20px; background: #F8FAFD; border-bottom: 1px solid #C5D0E2; display: flex; flex-direction: column; gap: 16px\">\n<div style=\"display: flex; align-items: flex-start; justify-content: space-between; gap: 16px\">\n<div style=\"display: flex; flex-direction: column; gap: 2px; min-width: 0\">\n<h3 style=\"margin: 0; font-size: 16px; font-weight: 750; line-height: 24px\">Set schedule {{a.full}}</h3>\n<span style=\"font-size: 13px; color: #526079\">{{a.ed.summary}}</span>\n</div>\n<button type=\"button\" onClick=\"{{a.close}}\" aria-label=\"Close schedule settings\" style=\"flex: none; width: 44px; height: 44px; border: 1px solid #E1E7F1; border-radius: 10px; background: #FFFFFF; color: #1C2940; cursor: pointer; display: flex; align-items: center; justify-content: center\">\n<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 6l12 12M18 6L6 18\"></path></svg>\n</button>\n</div>\n\n<div style=\"display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px 20px\">\n\n<div style=\"display: flex; flex-direction: column; gap: 8px; width: 230px\">\n<span style=\"font-size: 13px; font-weight: 650; line-height: 19px\">Start week</span>\n<div role=\"group\" aria-label=\"Start week\" style=\"box-sizing: border-box; display: flex; align-items: center; height: 46px; border: 1px solid #E1E7F1; border-radius: 10px; background: #FFFFFF; overflow: hidden\">\n<button type=\"button\" onClick=\"{{a.ed.earlier}}\" aria-label=\"Start one week earlier\" style=\"flex: none; width: 44px; height: 44px; border: 0; background: transparent; color: #1C2940; cursor: pointer; display: flex; align-items: center; justify-content: center\">\n<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M15 6l-6 6 6 6\"></path></svg>\n</button>\n<span aria-live=\"polite\" style=\"flex: 1; text-align: center; font-size: 14px; line-height: 20px; font-variant-numeric: tabular-nums\">{{a.ed.startText}}</span>\n<button type=\"button\" onClick=\"{{a.ed.later}}\" aria-label=\"Start one week later\" style=\"flex: none; width: 44px; height: 44px; border: 0; background: transparent; color: #1C2940; cursor: pointer; display: flex; align-items: center; justify-content: center\">\n<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9 6l6 6-6 6\"></path></svg>\n</button>\n</div>\n</div>\n\n<div style=\"display: flex; flex-direction: column; gap: 8px; width: 190px\">\n<span style=\"font-size: 13px; font-weight: 650; line-height: 19px\">Work duration</span>\n<div role=\"group\" aria-label=\"Work duration\" style=\"box-sizing: border-box; display: flex; align-items: center; height: 46px; border: 1px solid #E1E7F1; border-radius: 10px; background: #FFFFFF; overflow: hidden\">\n<button type=\"button\" onClick=\"{{a.ed.shorter}}\" aria-label=\"Shorten the duration by one week\" style=\"flex: none; width: 44px; height: 44px; border: 0; background: transparent; color: #1C2940; cursor: pointer; display: flex; align-items: center; justify-content: center\">\n<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6 12h12\"></path></svg>\n</button>\n<span aria-live=\"polite\" style=\"flex: 1; text-align: center; font-size: 14px; line-height: 20px; font-variant-numeric: tabular-nums\">{{a.ed.durText}}</span>\n<button type=\"button\" onClick=\"{{a.ed.longer}}\" aria-label=\"Extend the duration by one week\" style=\"flex: none; width: 44px; height: 44px; border: 0; background: transparent; color: #1C2940; cursor: pointer; display: flex; align-items: center; justify-content: center\">\n<svg width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 6v12M6 12h12\"></path></svg>\n</button>\n</div>\n</div>\n\n<div style=\"display: flex; flex-direction: column; gap: 8px\">\n<span style=\"font-size: 13px; font-weight: 650; line-height: 19px\">Progress pattern</span>\n<div role=\"group\" aria-label=\"Progress pattern\" style=\"box-sizing: border-box; display: flex; height: 46px; border: 1px solid #E1E7F1; border-radius: 10px; background: #FFFFFF; overflow: hidden\">\n<button type=\"button\" onClick=\"{{a.ed.setRata}}\" aria-pressed=\"{{a.ed.isRata}}\" style=\"height: 44px; padding: 0 16px; border: 0; background: {{a.ed.rataBg}}; color: {{a.ed.rataFg}}; font: inherit; font-size: 14px; font-weight: 650; cursor: pointer\">Even per week</button>\n<button type=\"button\" onClick=\"{{a.ed.setKustom}}\" aria-pressed=\"{{a.ed.isKustom}}\" style=\"height: 44px; padding: 0 16px; border: 0; border-left: 1px solid #E1E7F1; background: {{a.ed.kustomBg}}; color: {{a.ed.kustomFg}}; font: inherit; font-size: 14px; font-weight: 650; cursor: pointer\">Custom</button>\n</div>\n</div>\n\n<div style=\"display: flex; flex-direction: column; gap: 8px; min-width: 0\">\n<span style=\"font-size: 13px; font-weight: 650; line-height: 19px\">Cumulative plan per week (%)</span>\n<div style=\"display: flex; flex-wrap: wrap; gap: 8px\">\n<template data-sc=\"for\" list=\"{{a.ed.steps}}\" as=\"sp\" hint-placeholder-count=\"3\">\n<label style=\"position: relative; display: block; width: 88px\">\n<span style=\"position: absolute; top: 0; left: 11px; height: 46px; display: flex; align-items: center; font-size: 12px; font-weight: 650; color: #526079; font-variant-numeric: tabular-nums\">{{sp.wk}}</span>\n<input class=\"ctl\" type=\"text\" inputmode=\"numeric\" value=\"{{sp.val}}\" onChange=\"{{sp.on}}\" style=\"box-sizing: border-box; width: 100%; height: 46px; padding: 0 12px 0 44px; border: 1px solid #E1E7F1; border-radius: 10px; background: #FFFFFF; color: #1C2940; font: inherit; font-size: 14px; line-height: 20px; text-align: right; font-variant-numeric: tabular-nums\">\n</label>\n</template>\n<div style=\"box-sizing: border-box; width: 88px; height: 46px; padding: 0 12px 0 11px; border: 1px solid #E4EAF4; border-radius: 10px; background: #F4F7FC; color: #344767; display: flex; align-items: center; justify-content: space-between; font-variant-numeric: tabular-nums\">\n<span style=\"font-size: 12px; font-weight: 650\">{{a.ed.doneWk}}</span>\n<span style=\"font-size: 14px; line-height: 20px\">100</span>\n</div>\n</div>\n<span style=\"font-size: 12px; color: #526079\">{{a.ed.help}}</span>\n</div>\n\n</div>\n</div>\n</template>\n</template>\n</template>\n\n<div style=\"display: grid; grid-template-columns: {{gridCols}}; align-items: end; padding-top: 14px; border-top: 1px solid #C5D0E2\">\n<div style=\"grid-column: span 2; align-self: center; display: flex; flex-direction: column; gap: 2px; padding: 0 12px 10px 20px\">\n<span style=\"font-size: 13px; font-weight: 750\">Project cumulative plan</span>\n<span style=\"font-size: 12px; color: #526079\">Sum of weight times plan, in percent</span>\n</div>\n<template data-sc=\"for\" list=\"{{cum}}\" as=\"k\" hint-placeholder-count=\"23\">\n<div style=\"height: 96px; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; padding-bottom: 10px; box-sizing: border-box; background: {{k.col}}\">\n<div aria-hidden=\"true\" style=\"width: 14px; height: {{k.h}}px; border-radius: 3px 3px 0 0; background: #266FF1\"></div>\n<span style=\"font-size: 11px; font-weight: 650; line-height: 16px; font-variant-numeric: tabular-nums\">{{k.t}}</span>\n</div>\n</template>\n</div>\n\n</div>\n</div>\n</section>\n\n</div>", Logic: (function () {

class Component extends DCLogic {
  update(pi, ii, next) {
    WBS.mutate((d) => { Object.assign(d.phases[pi].items[ii], next, { unset: false }); });
    this.setState({ saved: false });
  }

  setDate(key, value) {
    const d = WBS.get();
    const p = Object.assign({}, d.project, { [key]: value });
    if (!isoToDate(value)) { this.setState({ msg: msgErr('Invalid date', ['Enter a complete date.']) }); return; }
    if (key !== 'status' && !WBS.weeksFor(p.start, p.end)) {
      this.setState({ msg: msgErr('Invalid period', ['End Date must be after Start Date.']) });
      return;
    }
    const before = WBS.weeks().length;
    WBS.mutate((dd) => { dd.project[key] = value; });
    const after = WBS.weeks().length;
    const lines = [];
    if (key !== 'status') {
      lines.push('The period is now ' + fmtDate(isoToDate(p.start)) + ' to ' + fmtDate(isoToDate(p.end)) + ', ' + after + ' weeks (W0 to W' + (after - 1) + ').');
      if (after < before) lines.push('The number of weeks decreased. Sub activities past the last week are moved or shortened automatically.');
      lines.push('Each sub activity schedule follows the week number, so its dates shift too.');
    }
    this.setState({ saved: false, msg: key === 'status' ? null : msgOk('Project period updated', lines) });
  }

  renderVals() {
    const st = this.state || {};
    const d = WBS.get();
    const wDates = WBS.weeks();
    const N = wDates.length;
    const maxIdx = N - 1;
    const weeks = wDates.map((x) => fmtDate(x));
    const now = WBS.nowIndex();
    const sel = st.sel === undefined ? 'p2-2' : st.sel;
    const band = (x) => (x <= 33 ? ['#E8EEFF', '#132583'] : (x <= 66 ? ['#78AAFF', '#000A50'] : ['#2031A7', '#FFFFFF']));
    const cumRaw = [];
    for (let k = 0; k < N; k += 1) cumRaw.push(0);

    let unsetCount = 0;
    const phases = d.phases.map((ph, pi) => {
      let ps = maxIdx;
      let pe = 0;
      let wsum = 0;
      const items = ph.items.map((it, ii) => {
        const code = (pi + 1) + '-' + (ii + 1);
        const wn = parseNum(it.w);
        const weight = isNaN(wn) ? 0 : wn;
        const p = { s: it.s, v: it.v, m: it.m };
        const n = p.v.length;
        const done = p.s + n;
        const unset = !!it.unset;
        if (unset) unsetCount += 1;
        if (!unset) { ps = Math.min(ps, p.s); pe = Math.max(pe, done); }
        wsum += weight;

        const cells = [];
        for (let k = 0; k < N; k += 1) {
          const col = k === now ? '#F2F5FF' : 'transparent';
          let value = 0;
          if (unset) {
            cells.push({ t: k === 0 ? '…' : '', bg: k === 0 ? '#FFF6E5' : 'transparent', fg: '#93370D', h: '28px', w: 'calc(100% - 4px)', col: col });
          } else if (k < p.s) {
            cells.push({ t: '', bg: 'transparent', fg: '#1C2940', h: '28px', w: 'calc(100% - 4px)', col: col });
          } else if (k < done) {
            value = p.v[k - p.s] === '' ? 0 : p.v[k - p.s];
            const b = band(value);
            cells.push({ t: String(value), bg: b[0], fg: b[1], h: '28px', w: 'calc(100% - 4px)', col: col });
          } else if (k === done) {
            value = 100;
            cells.push({ t: '100', bg: '#E8F8EF', fg: '#087443', h: '28px', w: 'calc(100% - 4px)', col: col });
          } else {
            value = 100;
            cells.push({ t: '', bg: '#C5D0E2', fg: '#1C2940', h: '2px', w: '100%', col: col });
          }
          if (!unset) cumRaw[k] += weight * value / 100;
        }

        const isSel = it.uid === sel;
        const isRata = p.m === 'rata';
        const ed = {
          summary: unset ? 'Schedule not set (empty percentages). Change the start week, duration or pattern to set it; until then this sub activity is not counted in the plan curve.' : 'Weight ' + fmtNum(weight) + '% of the project. Contributes ' + fmtNum(weight) + ' points to the plan curve, from W' + p.s + ' to W' + done + '.',
          startText: 'W' + p.s + ', ' + weeks[p.s],
          durText: n + ' weeks',
          isRata: isRata,
          isKustom: !isRata,
          rataBg: isRata ? '#F2F5FF' : '#FFFFFF',
          rataFg: isRata ? '#132583' : '#526079',
          kustomBg: isRata ? '#FFFFFF' : '#F2F5FF',
          kustomFg: isRata ? '#526079' : '#132583',
          doneWk: 'W' + done,
          help: '100% is recorded in W' + done + ', ' + weeks[done] + '.',
          steps: p.v.map((x, i) => ({
            wk: 'W' + (p.s + i),
            val: String(x),
            on: (e) => {
              const dg = String(e.target.value).replace(/[^0-9]/g, '');
              const v = p.v.slice();
              v[i] = dg === '' ? '' : Math.min(99, parseInt(dg, 10));
              this.update(pi, ii, { v: v, m: 'kustom' });
            },
          })),
          earlier: () => { if (p.s > 0) this.update(pi, ii, { s: p.s - 1 }); },
          later: () => { if (done < maxIdx) this.update(pi, ii, { s: p.s + 1 }); },
          shorter: () => { if (n > 1) this.update(pi, ii, { v: evenPlan(n - 1), m: 'rata' }); },
          longer: () => { if (done < maxIdx) this.update(pi, ii, { v: evenPlan(n + 1), m: 'rata' }); },
          setRata: () => this.update(pi, ii, { v: evenPlan(n), m: 'rata' }),
          setKustom: () => this.update(pi, ii, { m: 'kustom' }),
        };

        return {
          id: code,
          name: unset ? it.name + ' (not scheduled)' : it.name,
          full: code + ' ' + it.name,
          wText: fmtNum(weight) + '%',
          cells: cells,
          sel: isSel,
          rowBg: isSel ? '#EEF3FF' : (ii % 2 ? '#F5F7FC' : '#FFFFFF'),
          nameC: isSel ? '#2031A7' : '#1C2940',
          nameW: isSel ? '650' : '400',
          pick: () => this.setState({ sel: isSel ? '' : it.uid }),
          close: () => this.setState({ sel: '' }),
          ed: ed,
        };
      });

      const cells = [];
      for (let k = 0; k < N; k += 1) {
        const on = pe >= ps && k >= ps && k <= pe;
        let rad = '0';
        if (on && k === ps && k === pe) rad = '4px';
        else if (on && k === ps) rad = '4px 0 0 4px';
        else if (on && k === pe) rad = '0 4px 4px 0';
        cells.push({ bar: on ? '#132583' : 'transparent', rad: rad });
      }

      return { no: String(pi + 1), name: ph.name, wText: fmtNum(wsum) + '%', items: items, cells: cells };
    });

    const months = [];
    weeks.forEach((dt) => {
      const parts = dt.split(' ');
      const mon = parts[1] + (wDates[0].getFullYear() !== wDates[N - 1].getFullYear() ? ' ' + parts[2].slice(2) : '');
      const last = months[months.length - 1];
      if (last && last.name === mon) last.span += 1;
      else months.push({ name: mon, span: 1 });
    });
    const p = d.project;
    const sd = isoToDate(p.start);
    const edd = isoToDate(p.end);

    return Object.assign({
      phases: phases,
      months: months,
      weeks: weeks.map((dt, k) => ({
        label: 'W' + k,
        day: dt.split(' ')[0],
        bg: k === now ? '#2031A7' : 'transparent',
        fg: k === now ? '#FFFFFF' : (k < now ? '#526079' : '#1C2940'),
        col: k === now ? '#F2F5FF' : 'transparent',
      })),
      cum: cumRaw.map((x, k) => ({
        t: fmtNum(x),
        h: (Math.min(x, 100) * 0.6).toFixed(1),
        col: k === now ? '#F2F5FF' : 'transparent',
      })),
      gridCols: '252px 56px repeat(' + N + ', minmax(34px, 1fr))',
      minW: String(Math.max(1100, 308 + N * 36)),
      lastWk: 'W' + maxIdx,
      periodText: fmtDate(sd) + ' to ' + fmtDate(edd),
      periodHint: 'Change Start Date and End Date to move or extend the whole project. W0 = Start Date, each week +7 days, last week = End Date.',
      startIso: p.start,
      endIso: p.end,
      statusIso: p.status,
      nWeeks: String(N),
      durDays: String(dayDiff(sd, edd) + 1),
      onStart: (e) => this.setDate('start', e.target.value),
      onEnd: (e) => this.setDate('end', e.target.value),
      onStatus: (e) => this.setDate('status', e.target.value),
      nowLabel: 'W' + now,
      nowDate: weeks[now],
      msg: st.msg || null,
      unsetNote: unsetCount ? unsetCount + ' sub activities have no schedule yet (marked …).' : '',
      saved: !!st.saved,
      save: () => { WBS.persist(); this.setState({ saved: true }); },
      reset: () => {
        const def = defaultWbs();
        const defItems = {};
        def.phases.forEach((ph) => ph.items.forEach((it) => { defItems[it.uid] = it; }));
        WBS.mutate((dd) => {
          dd.project.start = def.project.start; dd.project.end = def.project.end; dd.project.status = def.project.status;
          dd.phases.forEach((ph) => ph.items.forEach((it) => {
            const o = defItems[it.uid];
            if (o) Object.assign(it, { s: o.s, v: o.v.slice(), m: o.m, unset: false });
            else Object.assign(it, { s: 0, v: evenPlan(3), m: 'rata', unset: false });
          }));
        });
        this.setState({ saved: false, msg: msgOk('Schedule restored', ['The project period and each sub activity schedule are back to their original state. Names and weights in the WBS are unchanged.']) });
      },
    }, xlActions(this, 'timeline', 'tl-import-file'));
  }
}

return Component;
})() };
PAGES["report"] = { title: "Reports", tpl: "<div class=\"aksel-page rp\" data-aksel-page=\"report\">\n\n<header class=\"rp-head\">\n<div class=\"rp-head-t\">\n<h1>Reports</h1>\n<p>Weekly progress report of {{projName}}: plan vs actual, work completed, not done yet and planned next, issues, and notes. All data and changes refer to the selected week.</p>\n</div>\n<div class=\"rp-head-a\">\n<div class=\"ops-hidden\" aria-hidden=\"true\"><input type=\"file\" id=\"rp-import-file\" accept=\".xlsx\" onChange=\"{{onImportFile}}\" tabindex=\"-1\"><button type=\"button\" tabindex=\"-1\" data-ops=\"template\" onClick=\"{{downloadTemplate}}\">t</button><button type=\"button\" tabindex=\"-1\" data-ops=\"import\" onClick=\"{{pickImport}}\">i</button><button type=\"button\" tabindex=\"-1\" data-ops=\"export\" onClick=\"{{exportXlsx}}\">e</button><button type=\"button\" tabindex=\"-1\" data-ops=\"reset\" onClick=\"{{askReset}}\">r</button><button type=\"button\" tabindex=\"-1\" data-ops=\"save\" onClick=\"{{saveAll}}\">s</button></div>\n</div>\n</header>\n\n<div class=\"rp-week\" role=\"group\" aria-label=\"Select the report week\">\n<span class=\"rp-week-l\">Report week</span>\n<button type=\"button\" class=\"aks-mini\" onClick=\"{{prevWk}}\" disabled=\"{{prevDis}}\" aria-label=\"Previous week\">‹</button>\n<select class=\"rp-input rp-week-sel\" value=\"{{wkVal}}\" onChange=\"{{onWeek}}\" aria-label=\"Report week\">\n<template data-sc=\"for\" list=\"{{weekOpts}}\" as=\"o\"><option value=\"{{o.v}}\">{{o.t}}</option></template>\n</select>\n<button type=\"button\" class=\"aks-mini\" onClick=\"{{nextWk}}\" disabled=\"{{nextDis}}\" aria-label=\"Next week\">›</button>\n<span class=\"rp-mut rp-small\">{{statusNote}} Actual edits, added/edited rows and notes are saved for {{wkL}}.</span>\n</div>\n\n<template data-sc=\"if\" value=\"{{msg}}\">\n<div role=\"status\" style=\"display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 12px; border: 1px solid {{msg.bd}}; background: {{msg.bg}}; color: {{msg.fg}}\">\n<div style=\"display: flex; flex-direction: column; gap: 4px; min-width: 0\">\n<strong style=\"font-size: 14px\">{{msg.title}}</strong>\n<template data-sc=\"for\" list=\"{{msg.lines}}\" as=\"ln\"><span style=\"font-size: 13px\">{{ln}}</span></template>\n<template data-sc=\"if\" value=\"{{msg.actions}}\">\n<div style=\"display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px\">\n<template data-sc=\"for\" list=\"{{msg.actions}}\" as=\"b\"><button type=\"button\" onClick=\"{{b.on}}\" class=\"aks-mini\" style=\"height: 38px; padding: 0 14px\">{{b.t}}</button></template>\n</div>\n</template>\n</div>\n<button type=\"button\" onClick=\"{{closeMsg}}\" aria-label=\"Close message\" style=\"flex: none; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: inherit; cursor: pointer; font-size: 18px; line-height: 1\">×</button>\n</div>\n</template>\n\n<section class=\"rp-card rp-pad\" aria-label=\"S-Curve\">\n<div class=\"rp-sec-h\">\n<div class=\"rp-sec-t\">\n<h2>S-Curve — report {{repWkText}}</h2>\n<span>Cumulative plan from the WBS and Timeline compared with actual up to {{wkL}}. Click a week label on the chart to switch weeks.</span>\n</div>\n<div class=\"rp-chips\" role=\"group\" aria-label=\"Show series\">\n<template data-sc=\"for\" list=\"{{series}}\" as=\"se\">\n<button type=\"button\" onClick=\"{{se.toggle}}\" aria-pressed=\"{{se.on}}\" class=\"{{se.cls}}\"><span aria-hidden=\"true\" style=\"width: 14px; height: 3px; border-radius: 2px; background: {{se.c}}\"></span>{{se.t}}</button>\n</template>\n<button type=\"button\" onClick=\"{{toggleLabels}}\" aria-pressed=\"{{showLabels}}\" class=\"{{labelsCls}}\">Value labels</button>\n<button type=\"button\" onClick=\"{{toggleEditAct}}\" aria-pressed=\"{{editAct}}\" class=\"aks-btn-pri rp-btn-sm\">{{editActLabel}}</button>\n</div>\n</div>\n\n<div class=\"rp-kpis\">\n<div class=\"rp-kpi\"><div class=\"rp-kpi-l\">Plan {{wkL}}</div><div class=\"rp-kpi-v\" style=\"color: #266FF1\">{{kpiPlan}}</div></div>\n<div class=\"rp-kpi\"><div class=\"rp-kpi-l\">Actual {{wkL}}</div><div class=\"rp-kpi-v\" style=\"color: #D92D20\">{{kpiAct}}</div></div>\n<div class=\"rp-kpi\"><div class=\"rp-kpi-l\">Increase in {{wkL}}</div><div class=\"rp-kpi-v\">{{kpiGain}}</div></div>\n<div class=\"rp-kpi\"><div class=\"rp-kpi-l\">Schedule Index (SPI)</div><div class=\"rp-kpi-v\" style=\"color: #B7791F\">{{kpiSpi}}</div></div>\n<div class=\"rp-kpi\"><div class=\"rp-kpi-l\">Status</div><div style=\"margin-top: 6px\"><span class=\"{{spiCls}}\">{{spiStatus}}</span></div></div>\n</div>\n\n<div style=\"overflow-x: auto\">\n<svg viewBox=\"0 0 1000 362\" role=\"img\" aria-label=\"{{chartLabel}}\" style=\"display: block; width: 100%; min-width: 720px; height: auto; font-family: inherit\">\n<template data-sc=\"for\" list=\"{{gridY}}\" as=\"g\">\n<line x1=\"56\" x2=\"980\" y1=\"{{g.y}}\" y2=\"{{g.y}}\" stroke=\"#E1E7F1\" stroke-width=\"1\"></line>\n<text x=\"46\" y=\"{{g.ty}}\" text-anchor=\"end\" font-size=\"11\" fill=\"#67748B\">{{g.t}}</text>\n</template>\n<template data-sc=\"for\" list=\"{{gridX}}\" as=\"g\">\n<text x=\"{{g.x}}\" y=\"352\" text-anchor=\"middle\" font-size=\"10.5\" font-weight=\"{{g.fw}}\" fill=\"{{g.c}}\" onClick=\"{{g.pick}}\" style=\"cursor: pointer\"><title>{{g.tip}}</title>{{g.t}}</text>\n</template>\n<line x1=\"{{nowX}}\" x2=\"{{nowX}}\" y1=\"26\" y2=\"332\" stroke=\"#2031A7\" stroke-width=\"1.2\" stroke-dasharray=\"4 4\"></line>\n<template data-sc=\"if\" value=\"{{showPlan}}\">\n<polyline points=\"{{planPts}}\" fill=\"none\" stroke=\"#266FF1\" stroke-width=\"2.4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n<template data-sc=\"for\" list=\"{{planDots}}\" as=\"d\">\n<circle cx=\"{{d.x}}\" cy=\"{{d.y}}\" r=\"3\" fill=\"#266FF1\"><title>{{d.tip}}</title></circle>\n<template data-sc=\"if\" value=\"{{showLabels}}\"><text x=\"{{d.x}}\" y=\"{{d.ly}}\" text-anchor=\"middle\" font-size=\"9.5\" fill=\"#266FF1\">{{d.t}}</text></template>\n</template>\n</template>\n<template data-sc=\"if\" value=\"{{showAct}}\">\n<polyline points=\"{{actPts}}\" fill=\"none\" stroke=\"#D92D20\" stroke-width=\"2.4\" stroke-linejoin=\"round\" stroke-linecap=\"round\"></polyline>\n<template data-sc=\"for\" list=\"{{actDots}}\" as=\"d\">\n<circle cx=\"{{d.x}}\" cy=\"{{d.y}}\" r=\"3.4\" fill=\"#D92D20\"><title>{{d.tip}}</title></circle>\n<template data-sc=\"if\" value=\"{{showLabels}}\"><text x=\"{{d.x}}\" y=\"{{d.ly}}\" text-anchor=\"middle\" font-size=\"9.5\" font-weight=\"700\" fill=\"#D92D20\">{{d.t}}</text></template>\n</template>\n</template>\n<template data-sc=\"if\" value=\"{{showSpi}}\">\n<polyline points=\"{{spiPts}}\" fill=\"none\" stroke=\"#E8A317\" stroke-width=\"2\" stroke-dasharray=\"5 4\" stroke-linejoin=\"round\"></polyline>\n<template data-sc=\"for\" list=\"{{spiDots}}\" as=\"d\"><circle cx=\"{{d.x}}\" cy=\"{{d.y}}\" r=\"2.6\" fill=\"#E8A317\"><title>{{d.tip}}</title></circle></template>\n</template>\n</svg>\n</div>\n\n<template data-sc=\"if\" value=\"{{editAct}}\">\n<div class=\"rp-edit\">\n<div class=\"rp-sec-t\"><h3>Edit S-Curve actual — {{repWkText}}</h3><span>Enter the cumulative actual percentage of each sub activity for {{wkL}}. Leave empty to use the previous week’s value. Changes are saved immediately and the S-Curve updates.</span></div>\n<template data-sc=\"if\" value=\"{{hasActErr}}\"><div class=\"rp-err\" role=\"alert\">{{actErr}}</div></template>\n<div class=\"rp-scroll\"><table class=\"rp-tbl\">\n<thead><tr><th>No</th><th>Activity</th><th class=\"r\">Weight</th><th class=\"r\">Plan {{wkL}}</th><th class=\"r\">Last week’s actual</th><th class=\"r\">Actual {{wkL}} (%)</th><th>Value source</th></tr></thead>\n<tbody>\n<template data-sc=\"for\" list=\"{{editRows}}\" as=\"r\">\n<tr class=\"{{r.z}}\"><td class=\"rp-mut rp-num\">{{r.id}}</td><td>{{r.name}}</td><td class=\"r rp-num rp-mut\">{{r.wText}}</td><td class=\"r rp-num\">{{r.planText}}</td><td class=\"r rp-num\">{{r.prevText}}</td>\n<td class=\"r\"><input class=\"rp-input rp-pct\" type=\"text\" inputmode=\"decimal\" aria-label=\"{{r.label}}\" value=\"{{r.val}}\" placeholder=\"{{r.ph}}\" onChange=\"{{r.on}}\"></td>\n<td><span class=\"{{r.srcCls}}\">{{r.src}}</span></td></tr>\n</template>\n</tbody></table></div>\n</div>\n</template>\n</section>\n\n<section class=\"rp-card\" aria-label=\"Completed\">\n<div class=\"rp-sec-h rp-pad-h\">\n<div class=\"rp-sec-t\"><h2>1. Work completed (up to {{repWkText}})</h2><span>{{doneSummary}}</span></div>\n<div class=\"rp-chips\">\n<template data-sc=\"for\" list=\"{{doneFilters}}\" as=\"fl\"><button type=\"button\" onClick=\"{{fl.pick}}\" aria-pressed=\"{{fl.on}}\" class=\"{{fl.cls}}\">{{fl.t}} <span class=\"rp-cnt\">{{fl.n}}</span></button></template>\n<button type=\"button\" onClick=\"{{addDone}}\" class=\"aks-btn-pri rp-btn-sm\">+ Add</button>\n</div>\n</div>\n<template data-sc=\"if\" value=\"{{formDone}}\">\n<div class=\"rp-form\" role=\"group\" aria-label=\"{{form.title}}\">\n<div class=\"rp-sec-h\"><h3>{{form.title}}</h3><button type=\"button\" onClick=\"{{form.cancel}}\" class=\"aks-mini\" aria-label=\"Close form\">×</button></div>\n<template data-sc=\"if\" value=\"{{form.canPickMode}}\"><div class=\"rp-chips\"><template data-sc=\"for\" list=\"{{form.modes}}\" as=\"m\"><button type=\"button\" class=\"{{m.cls}}\" aria-pressed=\"{{m.on}}\" onClick=\"{{m.pick}}\">{{m.t}}</button></template></div></template>\n<div class=\"rp-grid\">\n<template data-sc=\"if\" value=\"{{form.wbsPick}}\"><label class=\"rp-field rp-span2\"><span>Sub activity</span><select class=\"rp-input\" value=\"{{form.uid}}\" onChange=\"{{form.onUid}}\"><template data-sc=\"for\" list=\"{{form.opts}}\" as=\"o\"><option value=\"{{o.v}}\">{{o.t}}</option></template></select></label></template>\n<template data-sc=\"if\" value=\"{{form.wbsLocked}}\"><div class=\"rp-field rp-span2\"><span>Sub activity</span><div class=\"rp-input rp-ro\">{{form.curText}}</div></div></template>\n<template data-sc=\"if\" value=\"{{form.isManual}}\"><label class=\"rp-field rp-span2\"><span>Work name (outside WBS)</span><input class=\"rp-input\" type=\"text\" value=\"{{form.name}}\" onChange=\"{{form.onName}}\" placeholder=\"Example: Coordination meeting with the user\"></label></template>\n<template data-sc=\"if\" value=\"{{form.showPct}}\"><label class=\"rp-field\"><span>{{form.pctLabel}}</span><input class=\"rp-input\" type=\"text\" inputmode=\"decimal\" value=\"{{form.pct}}\" onChange=\"{{form.onPct}}\" placeholder=\"0 – 100\"></label></template>\n<template data-sc=\"if\" value=\"{{form.showStart}}\"><label class=\"rp-field\"><span>Planned start</span><select class=\"rp-input\" value=\"{{form.start}}\" onChange=\"{{form.onStart}}\"><template data-sc=\"for\" list=\"{{form.weekOpts}}\" as=\"o\"><option value=\"{{o.v}}\">{{o.t}}</option></template></select></label></template>\n</div>\n<label class=\"rp-field\"><span>{{form.ketLabel}}</span><textarea class=\"rp-input\" rows=\"3\" value=\"{{form.ket}}\" onChange=\"{{form.onKet}}\" placeholder=\"Optional\"></textarea></label>\n<template data-sc=\"if\" value=\"{{form.hasHint}}\"><div class=\"rp-small rp-mut\">{{form.hint}}</div></template>\n<template data-sc=\"if\" value=\"{{form.hasErr}}\"><div class=\"rp-err\" role=\"alert\">{{form.err}}</div></template>\n<div class=\"rp-form-foot\"><span></span><div class=\"rp-chips\"><button type=\"button\" onClick=\"{{form.cancel}}\" class=\"aks-btn-sec\">Cancel</button><button type=\"button\" onClick=\"{{form.save}}\" class=\"aks-btn-pri\">Save</button></div></div>\n</div>\n</template>\n<div class=\"rp-scroll\"><table class=\"rp-tbl\">\n<thead><tr><template data-sc=\"for\" list=\"{{doneT.head}}\" as=\"h\"><th class=\"{{h.cls}}\" aria-sort=\"{{h.aria}}\"><template data-sc=\"if\" value=\"{{h.sortable}}\"><button type=\"button\" class=\"rp-sort\" onClick=\"{{h.click}}\" title=\"{{h.title}}\">{{h.t}} <span class=\"{{h.aon}}\">{{h.arrow}}</span></button></template><template data-sc=\"if\" value=\"{{h.plain}}\">{{h.t}}</template></th></template></tr></thead>\n<tbody>\n<template data-sc=\"if\" value=\"{{doneT.empty}}\"><tr><td colspan=\"10\" class=\"rp-empty\">No work with progress up to {{wkL}}.</td></tr></template>\n<template data-sc=\"for\" list=\"{{doneT.rows}}\" as=\"r\">\n<tr class=\"{{r.z}}\">\n<td class=\"rp-mut rp-num\">{{r.id}}</td>\n<td><div class=\"rp-name\">{{r.name}}</div><div class=\"rp-sub\">{{r.sub}}</div></td>\n<td class=\"r rp-num rp-mut\">{{r.wText}}</td>\n<td><div class=\"rp-bar\"><div class=\"rp-bar-t\"><div style=\"width: {{r.plan}}%; background: #78AAFF\"></div></div><span class=\"rp-num\">{{r.planText}}</span></div></td>\n<td><div class=\"rp-bar\"><div class=\"rp-bar-t\"><div style=\"width: {{r.act}}%; background: #2031A7\"></div></div><span class=\"rp-num\">{{r.actText}}</span></div></td>\n<td class=\"r rp-num\">{{r.gainText}}</td>\n<td class=\"r {{r.devCls}}\">{{r.devText}}</td>\n<td><span class=\"{{r.sCls}}\">{{r.status}}</span></td>\n<td class=\"rp-ket\">{{r.ket}}</td>\n<td class=\"r\"><div class=\"rp-act\"><button type=\"button\" class=\"aks-mini\" onClick=\"{{r.edit}}\">Edit</button><template data-sc=\"if\" value=\"{{r.manual}}\"><button type=\"button\" class=\"aks-mini aks-mini-del\" onClick=\"{{r.del}}\">Delete</button></template></div></td>\n</tr>\n</template>\n</tbody></table></div>\n<template data-sc=\"if\" value=\"{{doneT.pager.show}}\"><div class=\"rp-pager\"><span class=\"rp-small rp-mut\">{{doneT.pager.text}}</span><div class=\"rp-chips\"><button type=\"button\" class=\"aks-mini\" onClick=\"{{doneT.pager.prev}}\" disabled=\"{{doneT.pager.prevDis}}\" aria-label=\"Previous page\">‹</button><template data-sc=\"for\" list=\"{{doneT.pager.nums}}\" as=\"p\"><button type=\"button\" class=\"{{p.cls}}\" aria-current=\"{{p.cur}}\" onClick=\"{{p.go}}\">{{p.n}}</button></template><button type=\"button\" class=\"aks-mini\" onClick=\"{{doneT.pager.next}}\" disabled=\"{{doneT.pager.nextDis}}\" aria-label=\"Next page\">›</button></div></div></template>\n</section>\n\n<section class=\"rp-card\" aria-label=\"Not done yet\">\n<div class=\"rp-sec-h rp-pad-h\">\n<div class=\"rp-sec-t\"><h2>2. Work not done yet (up to {{repWkText}})</h2><span>{{todoSummary}}</span></div>\n<div class=\"rp-chips\"><button type=\"button\" onClick=\"{{addTodo}}\" class=\"aks-btn-pri rp-btn-sm\">+ Add</button></div>\n</div>\n<template data-sc=\"if\" value=\"{{formTodo}}\">\n<div class=\"rp-form\" role=\"group\" aria-label=\"{{form.title}}\">\n<div class=\"rp-sec-h\"><h3>{{form.title}}</h3><button type=\"button\" onClick=\"{{form.cancel}}\" class=\"aks-mini\" aria-label=\"Close form\">×</button></div>\n<template data-sc=\"if\" value=\"{{form.canPickMode}}\"><div class=\"rp-chips\"><template data-sc=\"for\" list=\"{{form.modes}}\" as=\"m\"><button type=\"button\" class=\"{{m.cls}}\" aria-pressed=\"{{m.on}}\" onClick=\"{{m.pick}}\">{{m.t}}</button></template></div></template>\n<div class=\"rp-grid\">\n<template data-sc=\"if\" value=\"{{form.wbsPick}}\"><label class=\"rp-field rp-span2\"><span>Sub activity</span><select class=\"rp-input\" value=\"{{form.uid}}\" onChange=\"{{form.onUid}}\"><template data-sc=\"for\" list=\"{{form.opts}}\" as=\"o\"><option value=\"{{o.v}}\">{{o.t}}</option></template></select></label></template>\n<template data-sc=\"if\" value=\"{{form.wbsLocked}}\"><div class=\"rp-field rp-span2\"><span>Sub activity</span><div class=\"rp-input rp-ro\">{{form.curText}}</div></div></template>\n<template data-sc=\"if\" value=\"{{form.isManual}}\"><label class=\"rp-field rp-span2\"><span>Work name (outside WBS)</span><input class=\"rp-input\" type=\"text\" value=\"{{form.name}}\" onChange=\"{{form.onName}}\" placeholder=\"Example: Coordination meeting with the user\"></label></template>\n<template data-sc=\"if\" value=\"{{form.showPct}}\"><label class=\"rp-field\"><span>{{form.pctLabel}}</span><input class=\"rp-input\" type=\"text\" inputmode=\"decimal\" value=\"{{form.pct}}\" onChange=\"{{form.onPct}}\" placeholder=\"0 – 100\"></label></template>\n<template data-sc=\"if\" value=\"{{form.showStart}}\"><label class=\"rp-field\"><span>Planned start</span><select class=\"rp-input\" value=\"{{form.start}}\" onChange=\"{{form.onStart}}\"><template data-sc=\"for\" list=\"{{form.weekOpts}}\" as=\"o\"><option value=\"{{o.v}}\">{{o.t}}</option></template></select></label></template>\n</div>\n<label class=\"rp-field\"><span>{{form.ketLabel}}</span><textarea class=\"rp-input\" rows=\"3\" value=\"{{form.ket}}\" onChange=\"{{form.onKet}}\" placeholder=\"Optional\"></textarea></label>\n<template data-sc=\"if\" value=\"{{form.hasHint}}\"><div class=\"rp-small rp-mut\">{{form.hint}}</div></template>\n<template data-sc=\"if\" value=\"{{form.hasErr}}\"><div class=\"rp-err\" role=\"alert\">{{form.err}}</div></template>\n<div class=\"rp-form-foot\"><span></span><div class=\"rp-chips\"><button type=\"button\" onClick=\"{{form.cancel}}\" class=\"aks-btn-sec\">Cancel</button><button type=\"button\" onClick=\"{{form.save}}\" class=\"aks-btn-pri\">Save</button></div></div>\n</div>\n</template>\n<div class=\"rp-scroll\"><table class=\"rp-tbl\">\n<thead><tr><template data-sc=\"for\" list=\"{{todoT.head}}\" as=\"h\"><th class=\"{{h.cls}}\" aria-sort=\"{{h.aria}}\"><template data-sc=\"if\" value=\"{{h.sortable}}\"><button type=\"button\" class=\"rp-sort\" onClick=\"{{h.click}}\" title=\"{{h.title}}\">{{h.t}} <span class=\"{{h.aon}}\">{{h.arrow}}</span></button></template><template data-sc=\"if\" value=\"{{h.plain}}\">{{h.t}}</template></th></template></tr></thead>\n<tbody>\n<template data-sc=\"if\" value=\"{{todoT.empty}}\"><tr><td colspan=\"8\" class=\"rp-empty\">All work has progress.</td></tr></template>\n<template data-sc=\"for\" list=\"{{todoT.rows}}\" as=\"r\">\n<tr class=\"{{r.z}}\">\n<td class=\"rp-mut rp-num\">{{r.id}}</td>\n<td><div class=\"rp-name\">{{r.name}}</div><div class=\"rp-sub\">{{r.sub}}</div></td>\n<td class=\"r rp-num rp-mut\">{{r.wText}}</td>\n<td class=\"r rp-num\">{{r.planText}}</td>\n<td class=\"rp-num\">{{r.startText}}</td>\n<td><span class=\"{{r.sCls}}\">{{r.status}}</span></td>\n<td class=\"rp-ket\">{{r.ket}}</td>\n<td class=\"r\"><div class=\"rp-act\"><button type=\"button\" class=\"aks-mini\" onClick=\"{{r.edit}}\">Edit</button><template data-sc=\"if\" value=\"{{r.manual}}\"><button type=\"button\" class=\"aks-mini aks-mini-del\" onClick=\"{{r.del}}\">Delete</button></template></div></td>\n</tr>\n</template>\n</tbody></table></div>\n<template data-sc=\"if\" value=\"{{todoT.pager.show}}\"><div class=\"rp-pager\"><span class=\"rp-small rp-mut\">{{todoT.pager.text}}</span><div class=\"rp-chips\"><button type=\"button\" class=\"aks-mini\" onClick=\"{{todoT.pager.prev}}\" disabled=\"{{todoT.pager.prevDis}}\" aria-label=\"Previous page\">‹</button><template data-sc=\"for\" list=\"{{todoT.pager.nums}}\" as=\"p\"><button type=\"button\" class=\"{{p.cls}}\" aria-current=\"{{p.cur}}\" onClick=\"{{p.go}}\">{{p.n}}</button></template><button type=\"button\" class=\"aks-mini\" onClick=\"{{todoT.pager.next}}\" disabled=\"{{todoT.pager.nextDis}}\" aria-label=\"Next page\">›</button></div></div></template>\n</section>\n\n<section class=\"rp-card\" aria-label=\"Planned next\">\n<div class=\"rp-sec-h rp-pad-h\">\n<div class=\"rp-sec-t\"><h2>3. Work planned next ({{nextWkText}})</h2><span>{{nextSummary}}</span></div>\n<template data-sc=\"if\" value=\"{{hasNext}}\"><div class=\"rp-chips\"><span class=\"rp-badge rp-b-blue\">Total {{nextTotal}}</span><button type=\"button\" onClick=\"{{addNext}}\" class=\"aks-btn-pri rp-btn-sm\">+ Add</button></div></template>\n</div>\n<template data-sc=\"if\" value=\"{{formNext}}\">\n<div class=\"rp-form\" role=\"group\" aria-label=\"{{form.title}}\">\n<div class=\"rp-sec-h\"><h3>{{form.title}}</h3><button type=\"button\" onClick=\"{{form.cancel}}\" class=\"aks-mini\" aria-label=\"Close form\">×</button></div>\n<template data-sc=\"if\" value=\"{{form.canPickMode}}\"><div class=\"rp-chips\"><template data-sc=\"for\" list=\"{{form.modes}}\" as=\"m\"><button type=\"button\" class=\"{{m.cls}}\" aria-pressed=\"{{m.on}}\" onClick=\"{{m.pick}}\">{{m.t}}</button></template></div></template>\n<div class=\"rp-grid\">\n<template data-sc=\"if\" value=\"{{form.wbsPick}}\"><label class=\"rp-field rp-span2\"><span>Sub activity</span><select class=\"rp-input\" value=\"{{form.uid}}\" onChange=\"{{form.onUid}}\"><template data-sc=\"for\" list=\"{{form.opts}}\" as=\"o\"><option value=\"{{o.v}}\">{{o.t}}</option></template></select></label></template>\n<template data-sc=\"if\" value=\"{{form.wbsLocked}}\"><div class=\"rp-field rp-span2\"><span>Sub activity</span><div class=\"rp-input rp-ro\">{{form.curText}}</div></div></template>\n<template data-sc=\"if\" value=\"{{form.isManual}}\"><label class=\"rp-field rp-span2\"><span>Work name (outside WBS)</span><input class=\"rp-input\" type=\"text\" value=\"{{form.name}}\" onChange=\"{{form.onName}}\" placeholder=\"Example: Coordination meeting with the user\"></label></template>\n<template data-sc=\"if\" value=\"{{form.showPct}}\"><label class=\"rp-field\"><span>{{form.pctLabel}}</span><input class=\"rp-input\" type=\"text\" inputmode=\"decimal\" value=\"{{form.pct}}\" onChange=\"{{form.onPct}}\" placeholder=\"0 – 100\"></label></template>\n<template data-sc=\"if\" value=\"{{form.showStart}}\"><label class=\"rp-field\"><span>Planned start</span><select class=\"rp-input\" value=\"{{form.start}}\" onChange=\"{{form.onStart}}\"><template data-sc=\"for\" list=\"{{form.weekOpts}}\" as=\"o\"><option value=\"{{o.v}}\">{{o.t}}</option></template></select></label></template>\n</div>\n<label class=\"rp-field\"><span>{{form.ketLabel}}</span><textarea class=\"rp-input\" rows=\"3\" value=\"{{form.ket}}\" onChange=\"{{form.onKet}}\" placeholder=\"Optional\"></textarea></label>\n<template data-sc=\"if\" value=\"{{form.hasHint}}\"><div class=\"rp-small rp-mut\">{{form.hint}}</div></template>\n<template data-sc=\"if\" value=\"{{form.hasErr}}\"><div class=\"rp-err\" role=\"alert\">{{form.err}}</div></template>\n<div class=\"rp-form-foot\"><span></span><div class=\"rp-chips\"><button type=\"button\" onClick=\"{{form.cancel}}\" class=\"aks-btn-sec\">Cancel</button><button type=\"button\" onClick=\"{{form.save}}\" class=\"aks-btn-pri\">Save</button></div></div>\n</div>\n</template>\n<div class=\"rp-scroll\"><table class=\"rp-tbl\">\n<thead><tr><template data-sc=\"for\" list=\"{{nextT.head}}\" as=\"h\"><th class=\"{{h.cls}}\" aria-sort=\"{{h.aria}}\"><template data-sc=\"if\" value=\"{{h.sortable}}\"><button type=\"button\" class=\"rp-sort\" onClick=\"{{h.click}}\" title=\"{{h.title}}\">{{h.t}} <span class=\"{{h.aon}}\">{{h.arrow}}</span></button></template><template data-sc=\"if\" value=\"{{h.plain}}\">{{h.t}}</template></th></template></tr></thead>\n<tbody>\n<template data-sc=\"if\" value=\"{{nextT.empty}}\"><tr><td colspan=\"9\" class=\"rp-empty\">No work is planned for {{nextL}}.</td></tr></template>\n<template data-sc=\"for\" list=\"{{nextT.rows}}\" as=\"r\">\n<tr class=\"{{r.z}}\">\n<td class=\"rp-mut rp-num\">{{r.id}}</td>\n<td><div class=\"rp-name\">{{r.name}}</div><div class=\"rp-sub\">{{r.sub}}</div></td>\n<td class=\"r rp-num rp-mut\">{{r.wText}}</td>\n<td class=\"r rp-num\">{{r.actText}}</td>\n<td class=\"r\"><div class=\"{{r.tCls}}\">{{r.targetText}}</div><div class=\"rp-sub\">{{r.tNote}}</div></td>\n<td class=\"r rp-num\">{{r.needText}}</td>\n<td class=\"r rp-num rp-strong\">{{r.poinText}}</td>\n<td class=\"rp-ket\">{{r.ket}}</td>\n<td class=\"r\"><div class=\"rp-act\"><button type=\"button\" class=\"aks-mini\" onClick=\"{{r.edit}}\">Edit</button><button type=\"button\" class=\"aks-mini aks-mini-del\" onClick=\"{{r.del}}\" title=\"Remove from next week’s list\">Delete</button></div></td>\n</tr>\n</template>\n</tbody></table></div>\n<template data-sc=\"if\" value=\"{{nextT.pager.show}}\"><div class=\"rp-pager\"><span class=\"rp-small rp-mut\">{{nextT.pager.text}}</span><div class=\"rp-chips\"><button type=\"button\" class=\"aks-mini\" onClick=\"{{nextT.pager.prev}}\" disabled=\"{{nextT.pager.prevDis}}\" aria-label=\"Previous page\">‹</button><template data-sc=\"for\" list=\"{{nextT.pager.nums}}\" as=\"p\"><button type=\"button\" class=\"{{p.cls}}\" aria-current=\"{{p.cur}}\" onClick=\"{{p.go}}\">{{p.n}}</button></template><button type=\"button\" class=\"aks-mini\" onClick=\"{{nextT.pager.next}}\" disabled=\"{{nextT.pager.nextDis}}\" aria-label=\"Next page\">›</button></div></div></template>\n</section>\n\n<template data-sc=\"if\" value=\"{{kOpen}}\">\n<section class=\"rp-card rp-pad rp-form-card\" aria-label=\"Issue form\">\n<div class=\"rp-sec-h\">\n<div class=\"rp-sec-t\"><h2>{{kTitle}}</h2><span>{{kSub}}</span></div>\n<button type=\"button\" onClick=\"{{closeK}}\" class=\"aks-mini\" aria-label=\"Close issue form\">×</button>\n</div>\n<div class=\"rp-grid\">\n<label class=\"rp-field\"><span>Related activity</span>\n<select class=\"rp-input\" value=\"{{kf.uid}}\" onChange=\"{{onKAct}}\"><template data-sc=\"for\" list=\"{{actOptions}}\" as=\"o\"><option value=\"{{o.v}}\">{{o.t}}</option></template></select></label>\n<label class=\"rp-field\"><span>Category</span>\n<select class=\"rp-input\" value=\"{{kf.kat}}\" onChange=\"{{onKKat}}\"><template data-sc=\"for\" list=\"{{katOptions}}\" as=\"o\"><option value=\"{{o}}\">{{o}}</option></template></select></label>\n<label class=\"rp-field\"><span>PIC</span><input class=\"rp-input\" type=\"text\" value=\"{{kf.pic}}\" onChange=\"{{onKPic}}\" placeholder=\"Person in charge\"></label>\n<label class=\"rp-field\"><span>Target date</span><input class=\"rp-input\" type=\"date\" value=\"{{kf.target}}\" onChange=\"{{onKTarget}}\"></label>\n<label class=\"rp-field\"><span>Status</span>\n<select class=\"rp-input\" value=\"{{kf.status}}\" onChange=\"{{onKStatus}}\"><option value=\"Open\">Open</option><option value=\"Ongoing\">Ongoing</option><option value=\"Done\">Done</option></select></label>\n</div>\n<div class=\"rp-field\"><span id=\"lbl-dampak\">Schedule impact</span>\n<div role=\"group\" aria-labelledby=\"lbl-dampak\" class=\"rp-chips\">\n<template data-sc=\"for\" list=\"{{dampakPick}}\" as=\"d\"><button type=\"button\" onClick=\"{{d.pick}}\" aria-pressed=\"{{d.on}}\" class=\"{{d.cls}}\"><span aria-hidden=\"true\" style=\"width: 10px; height: 10px; border-radius: 999px; background: {{d.dot}}\"></span>{{d.t}}</button></template>\n</div></div>\n<div class=\"rp-grid rp-grid-2\">\n<label class=\"rp-field\"><span>Issue description</span><textarea class=\"{{uraianCls}}\" rows=\"4\" value=\"{{kf.uraian}}\" onChange=\"{{onKUraian}}\" placeholder=\"What is blocking, since when, and who is affected\"></textarea></label>\n<label class=\"rp-field\"><span>Action plan</span><textarea class=\"rp-input\" rows=\"4\" value=\"{{kf.tindakan}}\" onChange=\"{{onKTindakan}}\" placeholder=\"Resolution steps and support needed\"></textarea></label>\n</div>\n<div class=\"rp-form-foot\">\n<span role=\"status\" class=\"{{kMsgCls}} rp-small\">{{kMsg}}</span>\n<div class=\"rp-chips\"><button type=\"button\" onClick=\"{{closeK}}\" class=\"aks-btn-sec\">Cancel</button><button type=\"button\" onClick=\"{{submitK}}\" class=\"aks-btn-pri\">Save issue</button></div>\n</div>\n</section>\n</template>\n\n<section class=\"rp-card\" aria-label=\"Issue list\">\n<div class=\"rp-sec-h rp-pad-h\">\n<div class=\"rp-sec-t\"><h2>4. Issue list</h2><span>{{kendalaSummary}}</span></div>\n<div class=\"rp-chips\">\n<template data-sc=\"for\" list=\"{{filters}}\" as=\"fl\"><button type=\"button\" onClick=\"{{fl.pick}}\" aria-pressed=\"{{fl.on}}\" class=\"{{fl.cls}}\">{{fl.t}} <span class=\"rp-cnt\">{{fl.n}}</span></button></template>\n<button type=\"button\" onClick=\"{{openK}}\" class=\"aks-btn-pri rp-btn-sm\">+ Add issue</button>\n</div>\n</div>\n<div class=\"rp-scroll\"><table class=\"rp-tbl\">\n<thead><tr><template data-sc=\"for\" list=\"{{kT.head}}\" as=\"h\"><th class=\"{{h.cls}}\" aria-sort=\"{{h.aria}}\"><template data-sc=\"if\" value=\"{{h.sortable}}\"><button type=\"button\" class=\"rp-sort\" onClick=\"{{h.click}}\" title=\"{{h.title}}\">{{h.t}} <span class=\"{{h.aon}}\">{{h.arrow}}</span></button></template><template data-sc=\"if\" value=\"{{h.plain}}\">{{h.t}}</template></th></template></tr></thead>\n<tbody>\n<template data-sc=\"if\" value=\"{{kT.empty}}\"><tr><td colspan=\"8\" class=\"rp-empty\">No issues with this status.</td></tr></template>\n<template data-sc=\"for\" list=\"{{kT.rows}}\" as=\"r\">\n<tr class=\"{{r.z}}\">\n<td class=\"rp-mut rp-num rp-strong\">{{r.id}}</td>\n<td><button type=\"button\" class=\"rp-link\" onClick=\"{{r.pick}}\" aria-expanded=\"{{r.sel}}\"><span class=\"rp-name\">{{r.uraian}}</span><span class=\"rp-sub\">{{r.actText}}</span></button>\n<template data-sc=\"if\" value=\"{{r.sel}}\"><div class=\"rp-detail\"><div><b>Action plan:</b> {{r.tindakan}}</div><div class=\"rp-mut\">{{r.posText}}</div></div></template></td>\n<td>{{r.kat}}</td>\n<td><span class=\"{{r.dCls}}\"><span aria-hidden=\"true\" style=\"width: 8px; height: 8px; border-radius: 999px; background: {{r.dDot}}\"></span>{{r.dampak}}</span></td>\n<td>{{r.pic}}</td>\n<td class=\"rp-num {{r.tCls}}\">{{r.targetText}}</td>\n<td><select class=\"{{r.sCls}}\" aria-label=\"{{r.statusLabel}}\" value=\"{{r.status}}\" onChange=\"{{r.onStatus}}\"><option value=\"Open\">Open</option><option value=\"Ongoing\">Ongoing</option><option value=\"Done\">Done</option></select></td>\n<td class=\"r\"><button type=\"button\" class=\"aks-mini\" onClick=\"{{r.edit}}\">Edit</button></td>\n</tr>\n</template>\n</tbody></table></div>\n<template data-sc=\"if\" value=\"{{kT.pager.show}}\"><div class=\"rp-pager\"><span class=\"rp-small rp-mut\">{{kT.pager.text}}</span><div class=\"rp-chips\"><button type=\"button\" class=\"aks-mini\" onClick=\"{{kT.pager.prev}}\" disabled=\"{{kT.pager.prevDis}}\" aria-label=\"Previous page\">‹</button><template data-sc=\"for\" list=\"{{kT.pager.nums}}\" as=\"p\"><button type=\"button\" class=\"{{p.cls}}\" aria-current=\"{{p.cur}}\" onClick=\"{{p.go}}\">{{p.n}}</button></template><button type=\"button\" class=\"aks-mini\" onClick=\"{{kT.pager.next}}\" disabled=\"{{kT.pager.nextDis}}\" aria-label=\"Next page\">›</button></div></div></template>\n</section>\n\n<section class=\"rp-card rp-pad\" aria-label=\"Notes\">\n<div class=\"rp-sec-h\">\n<div class=\"rp-sec-t\"><h2>5. Notes ({{repWkText}})</h2><span>Free notes for this week’s report. Supports bold, italic, underline, bullet lists and images. Saved automatically per week.</span></div>\n<span id=\"rp-ket-status\" class=\"rp-small rp-mut\" role=\"status\">Saved automatically</span>\n</div>\n<div class=\"rp-toolbar\" role=\"toolbar\" aria-label=\"Notes formatting\">\n<button type=\"button\" class=\"aks-mini\" onMouseDown=\"{{fBold}}\" title=\"Bold (Ctrl+B)\" aria-label=\"Bold\"><b>B</b></button>\n<button type=\"button\" class=\"aks-mini\" onMouseDown=\"{{fItalic}}\" title=\"Italic (Ctrl+I)\" aria-label=\"Italic\"><i>I</i></button>\n<button type=\"button\" class=\"aks-mini\" onMouseDown=\"{{fUnder}}\" title=\"Underline (Ctrl+U)\" aria-label=\"Underline\"><u>U</u></button>\n<button type=\"button\" class=\"aks-mini\" onMouseDown=\"{{fList}}\" title=\"Bullet list\" aria-label=\"Bullet list\">• List</button>\n<button type=\"button\" class=\"aks-mini\" onMouseDown=\"{{fImage}}\" title=\"Insert image (PNG/JPG)\" aria-label=\"Insert image\">\n<svg width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"></rect><circle cx=\"9\" cy=\"10\" r=\"2\"></circle><path d=\"M21 17l-5-5-9 8\"></path></svg> Image</button>\n<button type=\"button\" class=\"aks-mini\" onMouseDown=\"{{fClear}}\" title=\"Clear formatting of the selected text\">Clear formatting</button>\n<input type=\"file\" id=\"rp-ket-img\" accept=\"image/png,image/jpeg,image/gif,image/webp\" onChange=\"{{onImage}}\" style=\"display: none\">\n</div>\n<div id=\"rp-ket\" class=\"rp-editor\" contenteditable=\"true\" role=\"textbox\" aria-multiline=\"true\" aria-label=\"Report notes\" data-ph=\"Write this week’s report notes…\" onInput=\"{{ketInput}}\" onBlur=\"{{ketBlur}}\" onKeyUp=\"{{ketKeyUp}}\" onMouseUp=\"{{ketMouseUp}}\"></div>\n</section>\n\n</div>\n", Logic: (function () {

const PAGE = 10;
const KAT = ['Technical', 'Resources', 'User / Business', 'Vendor', 'Infrastructure'];
const ALLOWED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, BR: 1, P: 1, DIV: 1, SPAN: 1, IMG: 1, UL: 1, OL: 1, LI: 1 };
function sanitize(html) {
  const t = document.createElement('template');
  t.innerHTML = String(html || '');
  const walk = (node) => {
    Array.from(node.childNodes).forEach((n) => {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1) { n.remove(); return; }
      if (n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'IFRAME' || n.tagName === 'OBJECT') { n.remove(); return; }
      walk(n);
      if (!ALLOWED[n.tagName]) { while (n.firstChild) n.parentNode.insertBefore(n.firstChild, n); n.remove(); return; }
      Array.from(n.attributes).forEach((a) => {
        const keep = n.tagName === 'IMG' && a.name === 'src' && /^(data:image\/(png|jpe?g|gif|webp);|https?:)/i.test(a.value);
        if (!keep) n.removeAttribute(a.name);
      });
    });
  };
  walk(t.content);
  const d = document.createElement('div');
  d.appendChild(t.content.cloneNode(true));
  return d.innerHTML;
}
function cmp(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a == null ? '' : a).localeCompare(String(b == null ? '' : b), 'id', { numeric: true, sensitivity: 'base' });
}
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('The image cannot be read.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image format not supported.'));
      img.onload = () => {
        const max = 1000;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * sc));
        c.height = Math.max(1, Math.round(img.height * sc));
        const g = c.getContext('2d');
        g.fillStyle = '#FFFFFF';
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

class Component extends DCLogic {
  ctx() { return reportContext(this.state.wk); }

  fmt(n) { return String(Math.round(n * 100) / 100); }

  persistState() { try { if (this._pageId) localStorage.setItem('pmo.aksel.v07.' + projectKey + '.' + this._pageId, JSON.stringify(this.state)); } catch (_e) { /* abaikan */ } }

  // Tabel generik: urutkan per kolom + pagination 10 baris + zebra
  tbl(key, rows, cols, def) {
    const st = this.state;
    const sorts = st.sort || {};
    const pgs = st.pg || {};
    const so = sorts[key] || def || { k: null, d: 1 };
    const list = rows.slice();
    if (so.k) list.sort((a, b) => cmp(a._s[so.k], b._s[so.k]) * so.d || cmp(a._s.no, b._s.no));
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    const pg = Math.min(Math.max(1, pgs[key] || 1), pages);
    const go = (n) => { const p = Object.assign({}, this.state.pg || {}); p[key] = n; this.setState({ pg: p }); };
    const view = list.slice((pg - 1) * PAGE, pg * PAGE).map((r, i) => Object.assign(r, { z: i % 2 ? 'rp-z' : '' }));
    const head = cols.map((c) => {
      const on = so.k === c.k;
      return {
        t: c.t, cls: c.cls || '', sortable: !!c.k, plain: !c.k,
        arrow: on ? (so.d > 0 ? '▲' : '▼') : '↕', aon: on ? 'rp-arrow on' : 'rp-arrow',
        aria: on ? (so.d > 0 ? 'ascending' : 'descending') : 'none',
        title: 'Sort by ' + c.t,
        click: () => {
          const s = Object.assign({}, this.state.sort || {});
          s[key] = { k: c.k, d: on ? -so.d : 1 };
          const p = Object.assign({}, this.state.pg || {}); p[key] = 1;
          this.setState({ sort: s, pg: p });
        },
      };
    });
    const nums = [];
    for (let i = 1; i <= pages; i += 1) nums.push({ n: i, cls: i === pg ? 'rp-pg on' : 'rp-pg', cur: i === pg ? 'page' : null, go: () => go(i) });
    const from = list.length ? (pg - 1) * PAGE + 1 : 0;
    const to = Math.min(pg * PAGE, list.length);
    return {
      rows: view, head: head, empty: !list.length, n: list.length,
      pager: { show: list.length > PAGE, text: from + '–' + to + ' of ' + list.length + ' rows', nums: nums,
        prevDis: pg <= 1, nextDis: pg >= pages, prev: () => go(Math.max(1, pg - 1)), next: () => go(Math.min(pages, pg + 1)) },
    };
  }

  note(rep, uid, f) { return (rep.note[uid] && rep.note[uid][f]) || ''; }

  // ---------- form tambah / edit ----------
  openForm(f) { this.setState({ form: Object.assign({ err: '' }, f) }); }
  setFF(key, val, rerender) {
    const f = Object.assign({}, this.state.form || {});
    f[key] = val;
    f.err = '';
    this.state.form = f;
    this.persistState();
    if (rerender) this.forceUpdate();
  }
  saveForm() {
    const f = this.state.form;
    if (!f) return;
    const C = this.ctx();
    const k = C.k;
    const num = (v) => parseNum(v);
    const fail = (m) => this.setState({ form: Object.assign({}, f, { err: m }) });
    if (f.mode === 'manual' && !String(f.name || '').trim()) return fail('Work name is required.');
    if (f.mode === 'wbs' && !C.byUid[f.uid]) return fail('Select a sub activity from the WBS.');
    if (f.sec === 'done' || f.sec === 'next') {
      const v = num(f.pct);
      if (isNaN(v) || v > 100) return fail('Enter a percentage from 0 to 100.');
      if (f.sec === 'done' && f.mode === 'wbs') {
        const it = C.byUid[f.uid].it;
        const prev = k > 0 ? WBS.actualAt(it, k - 1) : 0;
        if (v < prev) return fail('Actual W' + k + ' may not be lower than the actual of W' + (k - 1) + ' (' + this.fmt(prev) + '%), because actual progress is cumulative.');
      }
      if (f.sec === 'next' && f.mode === 'wbs') {
        const it = C.byUid[f.uid].it;
        const a = WBS.actualAt(it, k);
        if (v <= a) return fail('Target W' + (k + 1) + ' must be greater than the actual of W' + k + ' (' + this.fmt(a) + '%).');
      }
    }
    WBS.mutate((d) => {
      const rep = WBS.rep(k);
      const setNote = (uid, field, txt) => { if (!rep.note[uid]) rep.note[uid] = {}; rep.note[uid][field] = String(txt || '').trim(); };
      if (f.mode === 'wbs') {
        let it = null;
        d.phases.forEach((ph) => ph.items.forEach((x) => { if (x.uid === f.uid) it = x; }));
        if (f.sec === 'done') WBS.setActual(it, k, Math.round(num(f.pct) * 100) / 100);
        if (f.sec === 'next') rep.target[f.uid] = Math.round(num(f.pct) * 100) / 100;
        setNote(f.uid, f.sec, f.ket);
      } else {
        const row = { id: f.id || ('M-' + Date.now().toString(36)), sec: f.sec, name: String(f.name).trim(), ket: String(f.ket || '').trim() };
        if (f.sec === 'done' || f.sec === 'next') row.pct = Math.round(num(f.pct) * 100) / 100;
        if (f.sec === 'todo') row.start = f.start === '' || f.start == null ? null : Number(f.start);
        const i = rep.manual.findIndex((m) => m.id === row.id);
        if (i >= 0) rep.manual[i] = row; else rep.manual.push(row);
      }
    });
    const lbl = { done: 'Work completed', todo: 'Work not done yet', next: 'Work planned next' }[f.sec];
    this.setState({ form: null, msg: msgOk((f.id || f.edit ? 'Changes saved' : 'Row added') + ' in "' + lbl + '" W' + k, f.sec === 'done' && f.mode === 'wbs' ? ['Actual W' + k + ' is also updated in the S-Curve.'] : []) });
  }
  delManual(id) {
    const k = this.ctx().k;
    WBS.mutate(() => { const rep = WBS.rep(k); rep.manual = rep.manual.filter((m) => m.id !== id); });
    this.setState({ form: null });
  }
  skipNext(uid) {
    const k = this.ctx().k;
    WBS.mutate(() => { WBS.rep(k).target[uid] = 'x'; });
    this.setState({ form: null, msg: msgOk('Row removed from "Work planned next" W' + k, ['Use Add to put it back.']) });
  }

  // ---------- kendala ----------
  blankK(uid) { return { uid: uid || '', kat: 'Technical', dampak: 'Medium', pic: '', target: '', uraian: '', tindakan: '', status: 'Open' }; }
  setK(key, value, rerender) {
    const f = Object.assign({}, this.state.kf || this.blankK());
    f[key] = value;
    this.state.kf = f;
    this.state.kerr = false;
    this.persistState();
    if (rerender) this.forceUpdate();
  }

  // ---------- keterangan (rich text) ----------
  afterRender(root) {
    const el = root.querySelector('#rp-ket');
    if (el) {
      const k = this.ctx().k;
      el.innerHTML = sanitize(WBS.rep(k).ket);
      el.setAttribute('data-wk', String(k));
    }
  }
  ketEl() { return document.getElementById('rp-ket'); }
  saveKet(silent) {
    const el = this.ketEl();
    if (!el) return true;
    const k = Number(el.getAttribute('data-wk'));
    WBS.rep(k).ket = sanitize(el.innerHTML);
    const ok = WBS.persist();
    const s = document.getElementById('rp-ket-status');
    if (s) s.textContent = ok ? 'Saved automatically' : 'Save failed: browser storage is full. Shrink or remove images.';
    if (!ok && !silent) this.setState({ msg: msgErr('Notes could not be saved', ['Browser storage is full. Remove or shrink the images in Notes.']) });
    return ok;
  }
  keepRange() {
    const sel = window.getSelection();
    const el = this.ketEl();
    if (sel && sel.rangeCount && el && el.contains(sel.getRangeAt(0).commonAncestorContainer)) this._range = sel.getRangeAt(0).cloneRange();
  }
  restoreRange() {
    const el = this.ketEl();
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (this._range && el.contains(this._range.commonAncestorContainer)) { sel.removeAllRanges(); sel.addRange(this._range); }
    else { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
  }
  cmd(name) {
    return (e) => {
      if (e) e.preventDefault();
      const el = this.ketEl();
      if (!el) return;
      if (document.activeElement !== el) this.restoreRange();
      document.execCommand(name, false, null);
      this.keepRange();
      this.saveKet(true);
    };
  }

  renderVals() {
    const st = this.state || {};
    const C = this.ctx();
    const k = C.k;
    const NW = C.NW;
    const wk = C.wDates.map((x) => fmtDate(x));
    const nxt = Math.min(k + 1, NW - 1);
    const hasNext = k < NW - 1;
    const pctS = (x) => this.fmt(x) + '%';
    const rep = C.rep;
    const planAt = (x, j) => WBS.planOf(x.it, j);
    const actAt = (x, j) => (j < 0 ? 0 : WBS.actualAt(x.it, j));

    // ---------- Kurva S ----------
    const metrics = reportMetrics(C);
    const { plan, actual } = metrics;
    parent.postMessage({type:'shockwave-operations-metrics',project:projectKey,metrics},location.origin);
    const spiPct = actual.map((a, j) => Math.min(125, plan[j] > 0 ? a / plan[j] * 100 : 100));
    const step = NW > 1 ? 924 / (NW - 1) : 0;
    const X = (j) => 56 + j * step;
    const Y = (p) => 330 - p * 2.4;
    const pts = (arr) => arr.map((p, j) => X(j).toFixed(1) + ',' + Y(p).toFixed(1)).join(' ');
    const dots = (arr, name, below) => arr.map((p, j) => ({
      x: X(j).toFixed(1), y: Y(p).toFixed(1), ly: (below ? Y(p) + 18 : Y(p) - 10).toFixed(1),
      t: pctS(p), tip: name + ' W' + j + ': ' + pctS(p),
    }));
    const hide = st.hide || {};
    const series = [['plan', 'Planned', '#266FF1'], ['act', 'Actual', '#D92D20'], ['spi', 'Schedule Index', '#E8A317']].map((s) => {
      const on = !hide[s[0]];
      return { t: s[1], c: s[2], on: on, cls: on ? 'rp-chip' : 'rp-chip off', toggle: () => { const h = Object.assign({}, hide); h[s[0]] = on; this.setState({ hide: h }); } };
    });
    const showLabels = st.labels === undefined ? true : st.labels;
    const setWk = (j) => this.setState({ wk: Math.max(0, Math.min(NW - 1, j)), form: null, kOpen: false, actErr: '' });
    const totPlan = plan[k];
    const totAct = actual[k];
    const spi = totPlan > 0 ? totAct / totPlan : 1;
    const prevAct = k > 0 ? actual[k - 1] : 0;

    // Edit Kurva S: aktual semua sub activity di minggu terpilih
    const editRows = C.list.map((x, i) => {
      const prev = actAt(x, k - 1);
      const own = WBS.hasActual(x.it, k);
      return {
        id: x.code, name: x.name, wText: this.fmt(x.w) + '%', planText: pctS(planAt(x, k)), prevText: k > 0 ? pctS(prev) : '—',
        val: own ? this.fmt(WBS.actualAt(x.it, k)) : '', ph: this.fmt(actAt(x, k)),
        src: own ? 'Filled in W' + k : (k > 0 && prev > 0 ? 'Carried over from the previous week' : 'No progress yet'),
        srcCls: own ? 'rp-badge rp-b-blue' : 'rp-badge rp-b-grey',
        label: 'Actual ' + x.code + ' in W' + k,
        z: i % 2 ? 'rp-z' : '',
        on: (e) => {
          const raw = String(e.target.value).trim();
          if (raw === '') { WBS.mutate((d) => { d.phases.forEach((ph) => ph.items.forEach((it) => { if (it.uid === x.uid && it.actual) delete it.actual[k]; })); }); this.setState({ actErr: '' }); return; }
          const v = parseNum(raw);
          if (isNaN(v) || v > 100) { this.setState({ actErr: x.code + ': enter a number from 0 to 100.' }); return; }
          if (v < prev) { this.setState({ actErr: x.code + ': actual W' + k + ' may not be lower than W' + (k - 1) + ' (' + pctS(prev) + ').' }); return; }
          WBS.mutate((d) => { d.phases.forEach((ph) => ph.items.forEach((it) => { if (it.uid === x.uid) WBS.setActual(it, k, Math.round(v * 100) / 100); })); });
          this.setState({ actErr: '' });
        },
      };
    });

    // ---------- 1. Sudah dikerjakan ----------
    const doneFilter = st.doneFilter || 'All';
    const manual = rep.manual || [];
    const doneAll = [];
    C.list.forEach((x) => {
      const a = actAt(x, k);
      if (a <= 0) return;
      const p = planAt(x, k);
      const dev = Math.round((a - p) * 100) / 100;
      const gain = Math.round((a - actAt(x, k - 1)) * 100) / 100;
      const selesai = a >= 100;
      const ket = this.note(rep, x.uid, 'done');
      doneAll.push({
        id: x.code, name: x.name, sub: x.phase, wText: this.fmt(x.w) + '%', plan: Math.min(100, p), act: Math.min(100, a), planText: pctS(p), actText: pctS(a),
        gainText: gain > 0 ? '+' + this.fmt(gain) : '0', devText: (dev > 0 ? '+' : '') + this.fmt(dev), devCls: dev < 0 ? 'rp-num rp-neg' : (dev > 0 ? 'rp-num rp-pos' : 'rp-num rp-mut'),
        status: selesai ? 'Done' : 'In progress', sCls: selesai ? 'rp-badge rp-b-green' : 'rp-badge rp-b-blue', fin: selesai,
        ket: ket || '—', manual: false,
        edit: () => this.openForm({ sec: 'done', mode: 'wbs', uid: x.uid, pct: this.fmt(WBS.actualAt(x.it, k)), ket: ket, edit: true }),
        _s: { no: x.code, name: x.name, w: x.w, plan: p, act: a, gain: gain, dev: dev, status: selesai ? 1 : 0, ket: ket || '~' },
      });
    });
    manual.filter((m) => m.sec === 'done').forEach((m) => {
      const a = Number(m.pct) || 0;
      const selesai = a >= 100;
      doneAll.push({
        id: '—', name: m.name, sub: 'Outside WBS', wText: '—', plan: 0, act: Math.min(100, a), planText: '—', actText: pctS(a), gainText: '—', devText: '—', devCls: 'rp-num rp-mut',
        status: selesai ? 'Done' : 'In progress', sCls: selesai ? 'rp-badge rp-b-green' : 'rp-badge rp-b-blue', fin: selesai,
        ket: m.ket || '—', manual: true,
        edit: () => this.openForm({ sec: 'done', mode: 'manual', id: m.id, name: m.name, pct: this.fmt(a), ket: m.ket || '' }),
        del: () => this.delManual(m.id),
        _s: { no: 'zz', name: m.name, w: -1, plan: -1, act: a, gain: -1, dev: 0, status: selesai ? 1 : 0, ket: m.ket || '~' },
      });
    });
    const nSel = doneAll.filter((r) => r.fin).length;
    const doneFiltered = doneAll.filter((r) => doneFilter === 'All' || (doneFilter === 'Done' ? r.fin : !r.fin));
    const doneT = this.tbl('done', doneFiltered, [
      { k: 'no', t: 'No' }, { k: 'name', t: 'Activity' }, { k: 'w', t: 'Weight', cls: 'r' }, { k: 'plan', t: 'Plan W' + k }, { k: 'act', t: 'Actual W' + k },
      { k: 'gain', t: 'Gain W' + k, cls: 'r' }, { k: 'dev', t: 'Deviation', cls: 'r' }, { k: 'status', t: 'Status' }, { k: 'ket', t: 'Notes' }, { t: 'Actions', cls: 'r' },
    ]);
    const doneFilters = [['All', doneAll.length], ['Done', nSel], ['In progress', doneAll.length - nSel]].map((x) => ({
      t: x[0], n: x[1], on: x[0] === doneFilter, cls: x[0] === doneFilter ? 'rp-fchip on' : 'rp-fchip',
      pick: () => { const p = Object.assign({}, st.pg || {}); p.done = 1; this.setState({ doneFilter: x[0], pg: p }); },
    }));

    // ---------- 2. Belum dikerjakan ----------
    const todoAll = [];
    C.list.forEach((x) => {
      if (actAt(x, k) > 0) return;
      const p = planAt(x, k);
      const late = p > 0;
      const ket = this.note(rep, x.uid, 'todo');
      todoAll.push({
        id: x.code, name: x.name, sub: x.phase, wText: this.fmt(x.w) + '%', planText: pctS(p),
        startText: x.it.unset ? 'Not scheduled' : 'W' + x.it.s + ', ' + wk[Math.min(x.it.s, NW - 1)],
        status: late ? 'Late start' : 'Not scheduled', sCls: late ? 'rp-badge rp-b-red' : 'rp-badge rp-b-grey',
        ket: ket || '—', manual: false,
        edit: () => this.openForm({ sec: 'todo', mode: 'wbs', uid: x.uid, ket: ket, edit: true }),
        _s: { no: x.code, name: x.name, w: x.w, plan: p, start: x.it.unset ? 999 : x.it.s, status: late ? 0 : 1, ket: ket || '~' },
      });
    });
    manual.filter((m) => m.sec === 'todo').forEach((m) => {
      const s = m.start == null || m.start === '' ? null : Number(m.start);
      todoAll.push({
        id: '—', name: m.name, sub: 'Outside WBS', wText: '—', planText: '—', startText: s == null ? 'Not set' : 'W' + s + ', ' + (wk[s] || ''),
        status: 'Outside WBS', sCls: 'rp-badge rp-b-purple', ket: m.ket || '—', manual: true,
        edit: () => this.openForm({ sec: 'todo', mode: 'manual', id: m.id, name: m.name, start: s == null ? '' : String(s), ket: m.ket || '' }),
        del: () => this.delManual(m.id),
        _s: { no: 'zz', name: m.name, w: -1, plan: -1, start: s == null ? 999 : s, status: 2, ket: m.ket || '~' },
      });
    });
    const lateN = todoAll.filter((r) => r.status === 'Late start').length;
    const todoT = this.tbl('todo', todoAll, [
      { k: 'no', t: 'No' }, { k: 'name', t: 'Activity' }, { k: 'w', t: 'Weight', cls: 'r' }, { k: 'plan', t: 'Plan W' + k, cls: 'r' },
      { k: 'start', t: 'Scheduled start' }, { k: 'status', t: 'Status' }, { k: 'ket', t: 'Notes' }, { t: 'Actions', cls: 'r' },
    ]);

    // ---------- 3. Akan dikerjakan ----------
    let nextTotal = 0;
    const nextAll = [];
    const inNext = {};
    if (hasNext) {
      C.list.forEach((x) => {
        const a = actAt(x, k);
        const tv = rep.target[x.uid];
        if (tv === 'x') return;
        const explicit = tv != null && tv !== '';
        const t = explicit ? Number(tv) : planAt(x, nxt);
        if (!(t > a)) return;
        inNext[x.uid] = 1;
        const need = Math.round((t - a) * 100) / 100;
        const poin = x.w * need / 100;
        nextTotal += poin;
        const ket = this.note(rep, x.uid, 'next');
        nextAll.push({
          id: x.code, name: x.name, sub: x.phase, wText: this.fmt(x.w) + '%', actText: pctS(a), targetText: pctS(t), tCls: explicit ? 'rp-num rp-strong rp-blue' : 'rp-num rp-strong',
          tNote: explicit ? 'changed' : 'plan', needText: '+' + this.fmt(need), poinText: '+' + this.fmt(poin),
          ket: ket || '—', manual: true,
          edit: () => this.openForm({ sec: 'next', mode: 'wbs', uid: x.uid, pct: this.fmt(t), ket: ket, edit: true }),
          del: () => this.skipNext(x.uid),
          _s: { no: x.code, name: x.name, w: x.w, act: a, target: t, need: need, poin: poin, ket: ket || '~' },
        });
      });
      manual.filter((m) => m.sec === 'next').forEach((m) => {
        const t = Number(m.pct) || 0;
        nextAll.push({
          id: '—', name: m.name, sub: 'Outside WBS', wText: '—', actText: '—', targetText: pctS(t), tCls: 'rp-num rp-strong', tNote: 'outside WBS', needText: '—', poinText: '—',
          ket: m.ket || '—', manual: true,
          edit: () => this.openForm({ sec: 'next', mode: 'manual', id: m.id, name: m.name, pct: this.fmt(t), ket: m.ket || '' }),
          del: () => this.delManual(m.id),
          _s: { no: 'zz', name: m.name, w: -1, act: -1, target: t, need: -1, poin: -1, ket: m.ket || '~' },
        });
      });
    }
    const nextT = this.tbl('next', nextAll, [
      { k: 'no', t: 'No' }, { k: 'name', t: 'Activity' }, { k: 'w', t: 'Weight', cls: 'r' }, { k: 'act', t: 'Actual W' + k, cls: 'r' }, { k: 'target', t: 'Target W' + nxt, cls: 'r' },
      { k: 'need', t: 'Needs to rise', cls: 'r' }, { k: 'poin', t: 'Project points', cls: 'r' }, { k: 'ket', t: 'Notes' }, { t: 'Actions', cls: 'r' },
    ]);

    // ---------- form tambah / edit (bagian 1-3) ----------
    const f = st.form || null;
    let form = null;
    if (f) {
      let opts = [];
      if (f.sec === 'done') opts = C.list.filter((x) => (f.edit && x.uid === f.uid) || actAt(x, k) <= 0);
      if (f.sec === 'next') opts = C.list.filter((x) => (f.edit && x.uid === f.uid) || !inNext[x.uid]);
      const cur = f.uid && C.byUid[f.uid];
      const secT = { done: 'Work completed', todo: 'Work not done yet', next: 'Work planned next' }[f.sec];
      const isEdit = !!(f.edit || f.id);
      let hint = '';
      if (f.mode === 'wbs' && cur) {
        if (f.sec === 'done') hint = 'Plan W' + k + ': ' + pctS(planAt(cur, k)) + (k > 0 ? '. Actual W' + (k - 1) + ': ' + pctS(actAt(cur, k - 1)) : '') + '. This value becomes the actual of W' + k + ' and also updates the S-Curve.';
        if (f.sec === 'next') hint = 'Actual W' + k + ': ' + pctS(actAt(cur, k)) + '. Plan W' + nxt + ' from the Timeline: ' + pctS(planAt(cur, nxt)) + '.';
        if (f.sec === 'todo') hint = 'Scheduled start (W' + cur.it.s + ') is set in the Timeline tab. Here, just fill in notes or a reason.';
      }
      form = {
        sec: f.sec, title: (isEdit ? 'Edit row' : 'Add row') + ' — ' + secT + ' (W' + (f.sec === 'next' ? nxt : k) + ')',
        canPickMode: !isEdit && f.sec !== 'todo',
        modes: [['wbs', 'Sub activity from WBS'], ['manual', 'Other work (outside WBS)']].map((m) => ({
          t: m[1], cls: f.mode === m[0] ? 'rp-fchip on' : 'rp-fchip', on: f.mode === m[0],
          pick: () => this.setFF('mode', m[0], true),
        })),
        isManual: f.mode === 'manual',
        wbsLocked: f.mode === 'wbs' && isEdit,
        wbsPick: f.mode === 'wbs' && !isEdit,
        curText: cur ? cur.code + ' ' + cur.name : '',
        uid: f.uid || '',
        opts: [{ v: '', t: opts.length ? 'Select a sub activity…' : 'No sub activities to choose from' }].concat(opts.map((x) => ({ v: x.uid, t: x.code + ' ' + x.name }))),
        name: f.name || '', pct: f.pct == null ? '' : f.pct, ket: f.ket || '', start: f.start == null ? '' : String(f.start),
        showPct: f.sec === 'done' || f.sec === 'next',
        pctLabel: f.sec === 'done' ? (f.mode === 'wbs' ? 'Actual W' + k + ' (%)' : 'Progress (%)') : 'Target W' + nxt + ' (%)',
        showStart: f.sec === 'todo' && f.mode === 'manual',
        weekOpts: [{ v: '', t: 'Not set' }].concat(C.wDates.map((d0, j) => ({ v: String(j), t: 'W' + j + ', ' + wk[j] }))),
        ketLabel: f.sec === 'todo' ? 'Notes / reason not done yet' : 'Notes',
        hint: hint, hasHint: !!hint, err: f.err || '', hasErr: !!f.err,
        onUid: (e) => this.setFF('uid', e.target.value, true),
        onName: (e) => this.setFF('name', e.target.value),
        onPct: (e) => this.setFF('pct', e.target.value),
        onKet: (e) => this.setFF('ket', e.target.value),
        onStart: (e) => this.setFF('start', e.target.value),
        cancel: () => this.setState({ form: null }),
        save: () => this.saveForm(),
      };
    }
    const formIn = (sec) => !!(form && form.sec === sec);
    const add = (sec) => () => this.openForm({ sec: sec, mode: sec === 'todo' ? 'manual' : 'wbs', uid: '', pct: '', ket: '', name: '', start: '' });

    // ---------- 4. Kendala ----------
    const klist = C.d.report.kendala;
    const filter = st.filter || 'All';
    const kf = st.kf || this.blankK();
    const today = dateToIso(C.wDates[k]);
    const dStyle = { High: 'rp-badge rp-b-red', Medium: 'rp-badge rp-b-amber', Low: 'rp-badge rp-b-blue' };
    const dDot = { High: '#E23F3F', Medium: '#F79009', Low: '#78AAFF' };
    const sCls = { Open: 'rp-sel rp-s-open', Ongoing: 'rp-sel rp-s-prog', Done: 'rp-sel rp-s-done' };
    const counts = { All: klist.length, Open: 0, Ongoing: 0, Done: 0 };
    klist.forEach((x) => { counts[x.status] = (counts[x.status] || 0) + 1; });
    const kRows = klist.filter((x) => filter === 'All' || x.status === filter).map((x) => {
      const ref = C.byUid[x.uid];
      const isLate = x.status !== 'Done' && x.target && x.target < today;
      let targetText = 'Not filled in';
      if (x.target) { const dd = isoToDate(x.target); targetText = dd ? fmtDate(dd) + (isLate ? ', via' : '') : x.target; }
      const sel = st.kSel === x.id;
      return {
        id: x.id, uraian: x.uraian, tindakan: x.tindakan || 'Not filled in', actText: ref ? ref.code + ' ' + ref.name : 'Not linked to a sub activity',
        posText: ref ? 'Position W' + k + ': plan ' + pctS(planAt(ref, k)) + ', actual ' + pctS(actAt(ref, k)) : '',
        kat: x.kat, dampak: x.dampak, dCls: dStyle[x.dampak] || 'rp-badge', dDot: dDot[x.dampak] || '#999',
        pic: x.pic || 'Not filled in', targetText: targetText, tCls: isLate ? 'rp-neg' : '',
        status: x.status, statusLabel: 'Status ' + x.id, sCls: sCls[x.status] || 'rp-sel',
        sel: sel,
        pick: () => this.setState({ kSel: sel ? '' : x.id }),
        onStatus: (e) => { const v = e.target.value; WBS.mutate((d) => { d.report.kendala.forEach((y) => { if (y.id === x.id) y.status = v; }); }); this.forceUpdate(); },
        edit: () => this.setState({ kOpen: true, kEdit: x.id, kf: Object.assign(this.blankK(), x), kerr: false }),
        _s: { no: x.id, uraian: x.uraian, kat: x.kat, dampak: { High: 0, Medium: 1, Low: 2 }[x.dampak], pic: x.pic || '~', target: x.target || '9999', status: { Open: 0, Ongoing: 1, Done: 2 }[x.status] },
      };
    });
    const kT = this.tbl('issues', kRows, [
      { k: 'no', t: 'ID' }, { k: 'uraian', t: 'Issue and activity' }, { k: 'kat', t: 'Category' }, { k: 'dampak', t: 'Impact' },
      { k: 'pic', t: 'PIC' }, { k: 'target', t: 'Target' }, { k: 'status', t: 'Status' }, { t: 'Actions', cls: 'r' },
    ]);
    const filters = ['All', 'Open', 'Ongoing', 'Done'].map((t) => ({
      t: t, n: counts[t] || 0, on: t === filter, cls: t === filter ? 'rp-fchip on' : 'rp-fchip',
      pick: () => { const p = Object.assign({}, st.pg || {}); p.kendala = 1; this.setState({ filter: t, pg: p }); },
    }));
    const openN = klist.filter((x) => x.status !== 'Done').length;
    const kerr = !!st.kerr;
    const nowI = WBS.nowIndex();

    return Object.assign({
      projName: C.d.project.name,
      weekOpts: C.wDates.map((d0, j) => ({ v: String(j), t: 'W' + j + ' · ' + wk[j] + (j === nowI ? ' (status)' : '') })),
      wkVal: String(k),
      onWeek: (e) => setWk(Number(e.target.value)),
      prevWk: () => setWk(k - 1), nextWk: () => setWk(k + 1), prevDis: k <= 0, nextDis: k >= NW - 1,
      wkL: 'W' + k, nextL: 'W' + nxt, repWkText: 'W' + k + ', ' + wk[k], nextWkText: 'W' + nxt + ', ' + wk[nxt], hasNext: hasNext,
      statusNote: k === nowI ? 'This is the project status week.' : 'Project status week: W' + nowI + ', ' + wk[nowI] + '.',
      series: series, showPlan: !hide.plan, showAct: !hide.act, showSpi: !hide.spi, showLabels: showLabels,
      labelsCls: showLabels ? 'rp-chip' : 'rp-chip off', toggleLabels: () => this.setState({ labels: !showLabels }),
      planPts: pts(plan), actPts: pts(actual), spiPts: pts(spiPct),
      planDots: dots(plan, 'Planned', false), actDots: dots(actual, 'Actual', true), spiDots: dots(spiPct, 'Schedule Index', false),
      gridY: [0, 25, 50, 75, 100, 125].map((p) => ({ y: Y(p), ty: Y(p) + 4, t: p + '%' })),
      gridX: plan.map((p, j) => ({ x: X(j), t: (NW > 30 && j % 2 && j !== k) ? '' : 'W' + j, fw: j === k ? '800' : '500', c: j === k ? '#2031A7' : '#526079', pick: () => setWk(j), tip: 'Select W' + j + ', ' + wk[j] })),
      nowX: X(k),
      kpiPlan: pctS(totPlan), kpiAct: pctS(totAct), kpiSpi: spi.toFixed(3),
      kpiGain: (totAct - prevAct >= 0 ? '+' : '') + this.fmt(totAct - prevAct) + ' pts',
      spiStatus: totPlan <= 0 ? 'PLAN NOT SET' : (spi < 0.9 ? 'LAGGING' : (spi > 1.05 ? 'AHEAD' : 'ON TRACK')),
      spiCls: totPlan <= 0 ? 'rp-badge rp-b-amber' : (spi < 0.9 ? 'rp-badge rp-b-red' : 'rp-badge rp-b-green'),
      chartLabel: 'S-Curve up to W' + k + '. Planned ' + pctS(totPlan) + ', actual ' + pctS(totAct) + ', schedule index ' + spi.toFixed(3),
      editAct: !!st.editAct, editActLabel: st.editAct ? 'Tutup aktual' : 'Ubah aktual W' + k,
      toggleEditAct: () => this.setState({ editAct: !st.editAct, actErr: '' }),
      editRows: editRows, actErr: st.actErr || '', hasActErr: !!st.actErr,
      doneT: doneT, doneFilters: doneFilters, addDone: add('done'), formDone: formIn('done'),
      doneSummary: doneAll.length + ' work items with progress up to W' + k + ': ' + nSel + ' done, ' + (doneAll.length - nSel) + ' still in progress. Deviation = actual minus plan W' + k + '.',
      todoT: todoT, addTodo: add('todo'), formTodo: formIn('todo'),
      todoSummary: todoAll.length + ' work items without progress up to W' + k + '. ' + lateN + ' of them should have started according to the schedule.',
      nextT: nextT, addNext: add('next'), formNext: formIn('next'),
      nextTotal: '+' + this.fmt(nextTotal) + ' pts',
      nextSummary: hasNext ? nextAll.length + ' work items planned for W' + nxt + '. The default target follows the Timeline plan and can be changed with Edit. Project points = weight times the required gain.' : 'W' + k + ' is the last week of the project; there is no next week.',
      form: form || {},
      kT: kT, filters: filters,
      kendalaSummary: openN + ' open issues. Click Edit to change an issue, or change its status directly in the table.',
      kOpen: !!st.kOpen, kTitle: st.kEdit ? 'Edit issue ' + st.kEdit : 'Log a new issue',
      kSub: st.kEdit ? 'Changes are saved straight to the issue list.' : 'A new issue goes straight into the issue list.',
      kf: kf,
      actOptions: [{ v: '', t: 'Not linked to a sub activity' }].concat(C.list.map((x) => ({ v: x.uid, t: x.code + ' ' + x.name }))),
      katOptions: KAT,
      dampakPick: ['High', 'Medium', 'Low'].map((t) => ({ t: t, on: kf.dampak === t, dot: dDot[t], cls: kf.dampak === t ? 'rp-fchip on' : 'rp-fchip', pick: () => this.setK('dampak', t, true) })),
      uraianCls: kerr ? 'rp-input rp-input-err' : 'rp-input',
      kMsg: kerr ? 'Fill in the issue description before saving.' : 'The issue description is required. Other fields can be completed later.',
      kMsgCls: kerr ? 'rp-neg' : 'rp-mut',
      onKAct: (e) => this.setK('uid', e.target.value),
      onKKat: (e) => this.setK('kat', e.target.value),
      onKPic: (e) => this.setK('pic', e.target.value),
      onKTarget: (e) => this.setK('target', e.target.value),
      onKStatus: (e) => this.setK('status', e.target.value),
      onKUraian: (e) => this.setK('uraian', e.target.value),
      onKTindakan: (e) => this.setK('tindakan', e.target.value),
      openK: () => this.setState({ kOpen: true, kEdit: '', kf: this.blankK(), kerr: false }),
      closeK: () => this.setState({ kOpen: false, kEdit: '', kerr: false }),
      submitK: () => {
        const cur = this.state.kf || kf;
        if (String(cur.uraian || '').trim() === '') { this.setState({ kerr: true }); return; }
        const editId = this.state.kEdit;
        let newId = editId;
        WBS.mutate((d) => {
          if (editId) {
            d.report.kendala = d.report.kendala.map((x) => (x.id === editId ? Object.assign({}, x, cur, { id: editId }) : x));
          } else {
            let seq = 0;
            d.report.kendala.forEach((x) => { const n = parseInt(String(x.id).replace(/\D/g, ''), 10); if (n > seq) seq = n; });
            newId = 'K-' + String(seq + 1).padStart(3, '0');
            d.report.kendala.unshift(Object.assign({}, cur, { id: newId, status: cur.status || 'Open', wk: k }));
          }
        });
        this.setState({ kOpen: false, kEdit: '', kf: this.blankK(), filter: 'All', kSel: newId, kerr: false, msg: msgOk(editId ? 'Issues ' + editId + ' updated' : 'Issues ' + newId + ' logged', []) });
      },
      ketInput: () => { clearTimeout(this._kt); this._kt = setTimeout(() => this.saveKet(true), 500); const s = document.getElementById('rp-ket-status'); if (s) s.textContent = 'Saving…'; },
      ketBlur: () => { clearTimeout(this._kt); this.keepRange(); this.saveKet(false); },
      ketKeyUp: () => this.keepRange(),
      ketMouseUp: () => this.keepRange(),
      fBold: this.cmd('bold'), fItalic: this.cmd('italic'), fUnder: this.cmd('underline'), fList: this.cmd('insertUnorderedList'), fClear: this.cmd('removeFormat'),
      fImage: (e) => { if (e) e.preventDefault(); this.keepRange(); const inp = document.getElementById('rp-ket-img'); if (inp) { inp.value = ''; inp.click(); } },
      onImage: async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const url = await shrinkImage(file);
          this.restoreRange();
          document.execCommand('insertHTML', false, '<img src="' + url + '" alt=""><br>');
          this.keepRange();
          this.saveKet(false);
        } catch (err) {
          this.setState({ msg: msgErr('Image could not be inserted', [String(err && err.message || err)]) });
        }
      },
      ketWk: 'W' + k,
      msg: st.msg || null,
    }, xlActions(this, 'report', 'rp-import-file'));
  }

  afterImport() { this.setState({ form: null, kOpen: false, kEdit: '' }); }
  afterReset() { this.setState({ wk: null, form: null, kOpen: false, kEdit: '', kSel: '' }); }
}

return Component;
})() };

(function () {
  const NA = {
    pm: ['PM Assignment', 'Project Manager assignment for each project, including the assignment letter and PM change history.'],
    risk: ['Risk Register', 'The list of project risks with their likelihood, impact, risk owner and mitigation plan.'],
    mom: ['MOM', 'Project Minutes of Meeting: meeting notes, decisions, and follow-ups with PIC and deadlines.'],
    bast: ['BAST', 'Handover Certificate (BAST): the document handing over work results per term or per milestone.'],
  };
  Object.keys(NA).forEach((id) => {
    const tpl = '<div class="aksel-page" data-aksel-page="' + id + '"><div class="na-page" role="status">' +
      '<div class="na-ico" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg></div>' +
      '<span class="rp-badge rp-b-amber">Feature not available yet</span>' +
      '<h1>{{title}}</h1><p>{{desc}}</p>' +
      '<p class="rp-small">This menu is prepared in the PMO sidebar and will be built in the next phase. For now, use Operations (WBS, Timeline and Reports).</p>' +
      '<div class="rp-chips" style="justify-content:center"><button type="button" class="aks-btn-sec" onClick="{{goWbs}}">Open WBS</button><button type="button" class="aks-btn-pri" onClick="{{goReport}}">Open Reports</button></div>' +
      '</div></div>';
    PAGES[id] = { title: NA[id][0], tpl: tpl, Logic: class extends DCLogic {
      renderVals() {
        const go = (p) => () => { const b = document.createElement('button'); b.type = 'button'; b.dataset.action = 'nav'; b.dataset.page = p; b.style.display = 'none'; document.body.appendChild(b); b.click(); b.remove(); };
        return { title: NA[id][0], desc: NA[id][1], goWbs: go('aksel-main'), goReport: go('aksel-report') };
      }
    } };
  });
})();

const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
function lookup(path, scope) {
  if (path === 'true') return true;
  if (path === 'false') return false;
  if (path === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
  if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
  let v = scope;
  for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
  return v;
}
function interp(str, scope) {
  const whole = str.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
  if (whole) return { raw: true, v: lookup(whole[1], scope) };
  return { raw: false, v: str.replace(HOLE, (m, p) => { const x = lookup(p, scope); return x == null ? '' : String(x); }) };
}
const EVENTS = { onclick: 'click', onchange: 'change', oninput: 'input', onsubmit: 'submit', onkeydown: 'keydown', onkeyup: 'keyup', onmousedown: 'mousedown', onmouseup: 'mouseup', onblur: 'blur', onfocus: 'focus' };
const BOOL = { disabled: 1, checked: 1, selected: 1, readonly: 1, required: 1, hidden: 1 };
function kids(node) { return node.content ? node.content.childNodes : node.childNodes; }
function renderList(nodes, scope, out) { for (const n of nodes) renderNode(n, scope, out); }
function renderNode(node, scope, out) {
  if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.nodeValue, scope).v)); return; }
  if (node.nodeType !== 1) return;
  const sc = node.getAttribute('data-sc');
  if (node.localName === 'template' && sc === 'for') {
    const list = interp(node.getAttribute('list'), scope).v || [];
    const as = node.getAttribute('as') || 'item';
    list.forEach((item, i) => { const s2 = Object.create(scope); s2[as] = item; s2.$index = i; renderList(kids(node), s2, out); });
    return;
  }
  if (node.localName === 'template' && sc === 'if') {
    if (interp(node.getAttribute('value'), scope).v) renderList(kids(node), scope, out);
    return;
  }
  const el = document.createElementNS(node.namespaceURI, node.localName);
  let valueProp;
  for (const a of Array.from(node.attributes)) {
    const name = a.name;
    if (name.startsWith('hint-')) continue;
    const r = interp(a.value, scope);
    if (EVENTS[name]) {
      if (typeof r.v === 'function') {
        let ev = EVENTS[name];
        if (ev === 'change' && el.localName === 'select') ev = 'change';
        el.addEventListener(ev, r.v);
      }
      continue;
    }
    if (name === 'value' && (el.localName === 'input' || el.localName === 'select' || el.localName === 'textarea')) { valueProp = r.v; continue; }
    if (BOOL[name] && r.raw) { if (r.v) el.setAttribute(name, ''); continue; }
    if (r.v === undefined || r.v === null || r.v === false && !name.startsWith('aria-')) continue;
    el.setAttribute(name, String(r.v));
  }
  const ch = [];
  renderList(kids(node), scope, ch);
  ch.forEach((c) => el.appendChild(c));
  if (valueProp !== undefined) el.value = valueProp == null ? '' : String(valueProp);
  out.push(el);
}
const instances = {};
const parsed = {};
let current = 'main';
let pending = false;
function scheduleRender() { if (!pending) { pending=true; requestAnimationFrame(() => {pending=false; render();}); } }
function render() {
  const target=document.getElementById('aksel-view');
  if(!target) return;
  const pg=PAGES[current];
  if(!parsed[current]) { const t=document.createElement('template'); t.innerHTML=pg.tpl; parsed[current]=t; }
  if(!instances[current]) { const inst=new pg.Logic({}); inst._pageId=current; try { const saved=JSON.parse(localStorage.getItem('pmo.aksel.v07.'+projectKey+'.'+current)); if(saved && typeof saved==='object' && !Array.isArray(saved)) { delete saved.msg; delete saved.w; delete saved.plan; inst.state=saved; } } catch(_err){} instances[current]=inst; }
  const output=[];
  renderList(parsed[current].content.childNodes, instances[current].renderVals(), output);
  target.replaceChildren(...output); if(instances[current].afterRender) instances[current].afterRender(target);
  document.body.classList.toggle('read-only', readonly);
  if (readonly) {
    for (const e of target.querySelectorAll('input,textarea,select,button,[contenteditable]')) {
      if (e.closest('.rp-week') || e.dataset.ops === 'export') continue;
      e.disabled = true;
      if (e.hasAttribute('contenteditable')) e.setAttribute('contenteditable', 'false');
    }
  }
  parent.postMessage({type:'shockwave-operations-height',height:Math.ceil(target.getBoundingClientRect().height+10)},location.origin);
}
function navigate(page) {
  if(!PAGES[page]) return;
  current=page;
  render();
}
window.PMO_AKSEL={navigate,render,getPage:()=>current,getPages:()=>Object.keys(PAGES)};
addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent) return;
  const message = event.data;
  if (settings.get('mode') === 'assistant-export') {
    if (message.type !== 'shockwave-operations-export-week') return;
    readonly = true;
    projectName = String(message.name || '');
    try {
      if (message.data?.version === 2 && Array.isArray(message.data.phases) && message.data.project) {
        WBS.data = message.data;
        WBS.normalize();
      }
      const last = WBS.weeks().length - 1;
      const week = message.week;
      if (!Number.isInteger(week) || week < 0 || week > last) {
        parent.postMessage({type:'shockwave-operations-export-result',project:projectKey,error:'Laporan W'+week+' di luar jadwal proyek. Minggu yang tersedia W0–W'+last+'.'},location.origin);
      } else {
        parent.postMessage({type:'shockwave-operations-export-result',project:projectKey,metrics:reportMetrics(reportContext(week))},location.origin);
      }
    } catch {
      parent.postMessage({type:'shockwave-operations-export-result',project:projectKey,error:'Data Operasional proyek tidak dapat dibaca.'},location.origin);
    }
    return;
  }
  if (message.type === 'shockwave-operations-load') {
    try {
      readonly = !!message.readonly;
      projectName = String(message.name || '');
      if (message.data?.version === 2 && Array.isArray(message.data.phases) && message.data.project) {
        WBS.data = message.data;
        WBS.normalize();
      }
      navigate(settings.get('tab') || 'main');
      parent.postMessage({type:'shockwave-operations-ready',project:projectKey},location.origin);
    } catch (error) {
      parent.postMessage({type:'shockwave-operations-load-error',project:projectKey},location.origin);
      throw error;
    }
  }
  if (message.type === 'shockwave-operations-template' && !readonly && ['application','service','infrastructure'].includes(message.template)) {
    WBS.replace(buildTemplate(message.template));
    if(instances[current]?.afterReset) instances[current].afterReset();
    scheduleRender();
  }
  if (message.type === 'shockwave-operations-action') {
    const action = ['template', 'import', 'export', 'reset'].find(value => value === message.action);
    if (action && (!readonly || action === 'export')) {
      const button = document.querySelector('[data-ops="' + action + '"]');
      if (button && action === 'export') button.disabled = false;
      button?.click();
    }
  }
  if (message.type === 'shockwave-operations-week' && current === 'report') {
    const last = WBS.weeks().length - 1;
    instances.report.setState({wk:Math.max(0,Math.min(last,Number(message.week)||0)),form:null,kOpen:false,actErr:''});
  }
});
if (settings.get('mode') !== 'assistant-export') new ResizeObserver(() => parent.postMessage({ type:'shockwave-operations-height',height:Math.ceil(document.querySelector('#aksel-view').getBoundingClientRect().height+10)},location.origin)).observe(document.querySelector('#aksel-view'));

})();
