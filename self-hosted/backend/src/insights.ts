import type { Pool, PoolClient } from "pg";
import { metrics, type Operations, type Risk } from "./pmo-models.js";

const DAY = 86400000;
export type Level = "red" | "amber";
export type Warning = { level: Level; code: string; message: string };
export type ProjectHealth = {
  id: string;
  code: string;
  name: string;
  customer: string;
  status: string;
  manager_id: string;
  manager_name: string;
  pillar: string;
  start_date: string;
  end_date: string;
  progress: number;
  week: number;
  plan: number | null;
  actual: number | null;
  deviation: number | null;
  days_to_end: number;
  days_late: number;
  report_updated_at: string | null;
  finance: {
    contract_value: number;
    billed: number;
    paid: number;
    outstanding: number;
    unbilled: number;
  };
  risks: { open: number; high: number };
  issues_open: number;
  actions: { open: number; overdue: number };
  documents: { needs_review: number; failed: number; bast_verified: number };
  approvals_pending: number;
  warnings: Warning[];
  rag: "red" | "amber" | "green";
};

type Row = Record<string, unknown>;
const iso = (v: unknown) =>
  v instanceof Date
    ? new Date(v.getTime() - v.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 10)
    : String(v).slice(0, 10);
const num = (v: unknown) => Number(v) || 0;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const rupiah = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);

/** Today's date in the company time zone (WIB). */
export const todayIso = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/**
 * Loads every input the rules need for the given projects in a fixed number
 * of queries, then evaluates the rules in memory.
 */
export async function projectHealth(
  db: Pool | PoolClient,
  projectIds: string[],
  today = todayIso(),
): Promise<ProjectHealth[]> {
  if (!projectIds.length) return [];
  const ids = [projectIds];
  const [projects, modules, milestones, actions, docs, approvals] =
    await Promise.all([
      db.query(
        "SELECT p.*,u.name AS manager_name FROM projects p JOIN users u ON u.id=p.manager_id WHERE p.id=ANY($1::uuid[])",
        ids,
      ),
      db.query(
        "SELECT project_id,kind,data,updated_at FROM project_modules WHERE project_id=ANY($1::uuid[]) AND kind IN ('operations','risks')",
        ids,
      ),
      db.query(
        "SELECT * FROM billing_milestones WHERE project_id=ANY($1::uuid[]) ORDER BY sort_order,created_at",
        ids,
      ),
      db.query(
        "SELECT project_id,status,due FROM action_items WHERE project_id=ANY($1::uuid[]) AND status NOT IN ('done','cancelled')",
        ids,
      ),
      db.query(
        "SELECT project_id,count(*) FILTER(WHERE status='needs_review')::int AS needs_review,count(*) FILTER(WHERE status='failed')::int AS failed,count(*) FILTER(WHERE status='verified' AND category='bast')::int AS bast_verified FROM documents WHERE project_id=ANY($1::uuid[]) AND deleted_at IS NULL GROUP BY project_id",
        ids,
      ),
      db.query(
        "SELECT project_id,requested_at FROM approvals WHERE project_id=ANY($1::uuid[]) AND status='pending'",
        ids,
      ),
    ]);
  const by = <T extends Row>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const r of rows) {
      const key = String(r.project_id);
      map.set(key, [...(map.get(key) || []), r]);
    }
    return map;
  };
  const moduleMap = by(modules.rows),
    milestoneMap = by(milestones.rows),
    actionMap = by(actions.rows),
    docMap = by(docs.rows),
    approvalMap = by(approvals.rows);
  return projects.rows.map((p) =>
    evaluate(p, {
      modules: moduleMap.get(p.id) || [],
      milestones: milestoneMap.get(p.id) || [],
      actions: actionMap.get(p.id) || [],
      docs: docMap.get(p.id)?.[0],
      approvals: approvalMap.get(p.id) || [],
      today,
    }),
  );
}

function evaluate(
  p: Row,
  input: {
    modules: Row[];
    milestones: Row[];
    actions: Row[];
    docs?: Row;
    approvals: Row[];
    today: string;
  },
): ProjectHealth {
  const { today } = input;
  const start = iso(p.start_date),
    end = iso(p.end_date);
  const weeks = Math.max(1, Math.ceil((Date.parse(end) - Date.parse(start)) / (7 * DAY)) + 1);
  const week = Math.max(
    0,
    Math.min(weeks - 1, Math.floor((Date.parse(today) - Date.parse(start)) / (7 * DAY))),
  );
  const opsRow = input.modules.find((m) => m.kind === "operations"),
    riskRow = input.modules.find((m) => m.kind === "risks");
  const ops = opsRow?.data as Operations | undefined,
    tasks = ops?.phases.flatMap((x) => x.tasks) || [];
  const m = tasks.length && ops ? metrics(ops, week) : null;
  const risks = ((riskRow?.data as { risks?: Risk[] })?.risks || []).filter(
    (r) => r.status !== "closed",
  );
  const highRisks = risks.filter(
    (r) => r.severity === "high" && r.probability !== "low",
  );
  const finished = p.status === "completed" || !!p.closed_at;
  const progress = num(p.progress);
  const daysToEnd = daysBetween(today, end);
  const daysLate = !finished && daysToEnd < 0 && progress < 100 ? -daysToEnd : 0;
  const reportUpdated = opsRow ? new Date(opsRow.updated_at as string) : null;
  const warnings: Warning[] = [];
  const add = (level: Level, code: string, message: string) =>
    warnings.push({ level, code, message });

  if (!finished) {
    if (daysLate) add("red", "late", `Melewati target selesai ${daysLate} hari (progres ${progress}%).`);
    else if (daysToEnd <= 30 && progress < 80)
      add("amber", "deadline", `Target selesai ${daysToEnd} hari lagi, progres baru ${progress}%.`);
    if (m && m.deviation <= -10)
      add("red", "behind", `Realisasi ${m.actual}% tertinggal ${Math.abs(m.deviation)}% dari rencana ${m.plan}% (W${week}).`);
    else if (m && m.deviation <= -5)
      add("amber", "behind", `Realisasi ${m.actual}% di bawah rencana ${m.plan}% (W${week}).`);
    const started = Date.parse(today) >= Date.parse(start) + 14 * DAY;
    if (started && ["active", "at_risk"].includes(String(p.status))) {
      if (!tasks.length)
        add("amber", "no_wbs", "WBS dan laporan mingguan belum dibuat.");
      else if (reportUpdated && Date.parse(today) - reportUpdated.getTime() > 14 * DAY)
        add("amber", "stale_report", `Laporan belum diperbarui sejak ${iso(reportUpdated)}.`);
    }
    // Tasks that should finish within two weeks but are not complete yet.
    const dueSoon = tasks.filter((t) => {
      const finishWeek = t.start + t.duration - 1;
      const actual = Object.entries(t.actual)
        .filter(([k]) => Number(k) <= week)
        .sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1] || 0;
      return finishWeek >= week && finishWeek <= week + 2 && actual < 100;
    });
    if (dueSoon.length)
      add("amber", "milestone_due", `${dueSoon.length} aktivitas WBS dijadwalkan selesai ≤ 2 minggu: ${dueSoon.slice(0, 3).map((t) => t.name).join(", ")}${dueSoon.length > 3 ? ", …" : ""}.`);
  }

  let billed = 0,
    paid = 0;
  for (const ms of input.milestones) {
    const amount = num(ms.amount),
      paidAmount = num(ms.paid_amount),
      due = ms.due_date ? iso(ms.due_date) : null;
    if (ms.invoice_date) billed += amount;
    paid += paidAmount;
    const linkedTask = tasks.find((t) => t.id === ms.wbs_task_id);
    const taskDone = linkedTask
      ? Math.max(0, ...Object.values(linkedTask.actual)) >= 100
      : false;
    if (ms.requires_bast && !ms.bast_document_id) {
      if (due && due < today)
        add("red", `bast_${ms.id}`, `BAST termin "${ms.name}" belum tersedia, jatuh tempo ${due}.`);
      else if (taskDone)
        add("amber", `bast_${ms.id}`, `Pekerjaan termin "${ms.name}" selesai, BAST belum diunggah/diverifikasi.`);
    }
    if (!ms.invoice_date && due && due >= today && daysBetween(today, due) <= 14)
      add("amber", `billing_${ms.id}`, `Termin "${ms.name}" jatuh tempo ${due} dan belum ditagihkan.`);
    if (ms.invoice_date && paidAmount < amount && daysBetween(iso(ms.invoice_date), today) > 30)
      add("amber", `invoice_${ms.id}`, `Invoice ${ms.invoice_number || ms.name} belum lunas > 30 hari (sisa ${rupiah(amount - paidAmount)}).`);
  }
  const overdueActions = input.actions.filter((a) => iso(a.due) < today).length;
  if (overdueActions)
    add("amber", "actions_overdue", `${overdueActions} tindak lanjut melewati target.`);
  if (highRisks.length)
    add("amber", "high_risk", `${highRisks.length} risiko tinggi masih terbuka.`);
  const staleApprovals = input.approvals.filter(
    (a) => Date.parse(today) - new Date(a.requested_at as string).getTime() > 7 * DAY,
  ).length;
  if (staleApprovals)
    add("amber", "approval_stale", `${staleApprovals} persetujuan menunggu > 7 hari.`);

  const contract = num(p.contract_value);
  const rag = warnings.some((w) => w.level === "red")
    ? "red"
    : warnings.length
      ? "amber"
      : "green";
  return {
    id: String(p.id),
    code: String(p.code),
    name: String(p.name),
    customer: String(p.customer),
    status: String(p.status),
    manager_id: String(p.manager_id),
    manager_name: String(p.manager_name),
    pillar: String(p.pillar || ""),
    start_date: start,
    end_date: end,
    progress,
    week,
    plan: m?.plan ?? null,
    actual: m?.actual ?? null,
    deviation: m?.deviation ?? null,
    days_to_end: daysToEnd,
    days_late: daysLate,
    report_updated_at: reportUpdated ? reportUpdated.toISOString() : null,
    finance: {
      contract_value: contract,
      billed,
      paid,
      outstanding: Math.max(0, billed - paid),
      unbilled: Math.max(0, contract - billed),
    },
    risks: { open: risks.length, high: highRisks.length },
    issues_open: (ops?.issues || []).filter((i) => i.status !== "closed").length,
    actions: { open: input.actions.length, overdue: overdueActions },
    documents: {
      needs_review: num(input.docs?.needs_review),
      failed: num(input.docs?.failed),
      bast_verified: num(input.docs?.bast_verified),
    },
    approvals_pending: input.approvals.length,
    warnings,
    rag,
  };
}

export type Workload = {
  id: string;
  name: string;
  email: string;
  role: string;
  capacity: number;
  managed: { id: string; code: string; name: string; start_date: string; end_date: string }[];
  member_of: number;
  load: number;
  utilization: number;
  actions: { open: number; overdue: number };
  months: { month: string; projects: number; over: boolean; names: string[] }[];
  conflicts: string[];
};

/** Members count as half a project; managing counts as one. */
export async function workload(
  db: Pool,
  userIds: string[] | null,
  monthsAhead = 6,
  today = todayIso(),
): Promise<Workload[]> {
  const users = await db.query(
    `SELECT id,name,email,role,capacity FROM users WHERE active AND role IN ('admin','pm') ${userIds ? "AND id=ANY($1::uuid[])" : ""} ORDER BY name`,
    userIds ? [userIds] : [],
  );
  const projects = await db.query(
    "SELECT p.id,p.code,p.name,p.start_date,p.end_date,p.manager_id,array_remove(array_agg(m.user_id),NULL) AS members FROM projects p LEFT JOIN project_members m ON m.project_id=p.id WHERE p.archived_at IS NULL AND p.closed_at IS NULL AND p.status<>'completed' GROUP BY p.id",
  );
  const actions = await db.query(
    "SELECT pic_user_id,lower(pic) AS pic,due FROM action_items WHERE status NOT IN ('done','cancelled')",
  );
  const first = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  const months = Array.from({ length: monthsAhead }, (_, i) => {
    const s = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1));
    const e = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 0));
    return { key: s.toISOString().slice(0, 7), start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
  });
  return users.rows.map((u) => {
    const managed = projects.rows.filter((p) => p.manager_id === u.id);
    const member = projects.rows.filter(
      (p) => p.manager_id !== u.id && (p.members as string[]).includes(u.id),
    );
    const capacity = num(u.capacity) || 3;
    const load = managed.length + member.length * 0.5;
    const mine = actions.rows.filter(
      (a) => a.pic_user_id === u.id || (!a.pic_user_id && a.pic === String(u.name).toLowerCase()),
    );
    const timeline = months.map((m) => {
      const active = [...managed, ...member].filter(
        (p) => iso(p.start_date) <= m.end && iso(p.end_date) >= m.start,
      );
      const weight = active.reduce((s, p) => s + (p.manager_id === u.id ? 1 : 0.5), 0);
      return {
        month: m.key,
        projects: weight,
        over: weight > capacity,
        names: active.map((p) => String(p.code)),
      };
    });
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      capacity,
      managed: managed.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        start_date: iso(p.start_date),
        end_date: iso(p.end_date),
      })),
      member_of: member.length,
      load,
      utilization: Math.round((load / capacity) * 100),
      actions: {
        open: mine.length,
        overdue: mine.filter((a) => iso(a.due) < today).length,
      },
      months: timeline,
      conflicts: timeline
        .filter((t) => t.over)
        .map((t) => `${t.month}: ${t.projects} beban proyek (${t.names.join(", ")}) melebihi kapasitas ${capacity}`),
    };
  });
}
