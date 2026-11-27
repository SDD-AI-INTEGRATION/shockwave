"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Send, Trash2 } from "lucide-react";
import type { Operations } from "../../../backend/src/pmo-models";
import { api, labelDate, money, type Project, type User } from "./client";
import { ApprovalBadge, type Approval } from "./governance";
import { lessonCategories } from "./assistant-page";
import { Dialog, Field } from "./ui";

type Doc = { id: string; name: string; status: string; category: string };
const useLoad = <T,>(path: string) => {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  const load = useCallback(() => {
    api(path).then(setData).catch((e) => setError(e.message));
  }, [path]);
  useEffect(load, [load]);
  return { data, error, setError, load };
};
const d10 = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");
const canManage = (user: User, project: Project) => user.role === "admin" || project.manager_id === user.id;

/* ------------------------------ Finance ------------------------------ */
type Milestone = {
  id: string;
  name: string;
  percentage: string;
  amount: string;
  due_date: string | null;
  wbs_task_id: string | null;
  requires_bast: boolean;
  bast_document_id: string | null;
  bast_document_name: string | null;
  invoice_number: string;
  invoice_date: string | null;
  invoice_document_id: string | null;
  invoice_document_name: string | null;
  paid_amount: string;
  paid_date: string | null;
  notes: string;
  sort_order: number;
};
type MilestoneForm = Record<string, string | boolean>;
const emptyMilestone: MilestoneForm = { name: "", percentage: "", amount: "", due_date: "", wbs_task_id: "", requires_bast: true, bast_document_id: "", invoice_number: "", invoice_date: "", invoice_document_id: "", paid_amount: "", paid_date: "", notes: "", sort_order: "0" };
const toForm = (m: Milestone): MilestoneForm => ({
  name: m.name, percentage: String(Number(m.percentage) || ""), amount: String(Number(m.amount) || ""), due_date: d10(m.due_date), wbs_task_id: m.wbs_task_id || "", requires_bast: m.requires_bast,
  bast_document_id: m.bast_document_id || "", invoice_number: m.invoice_number, invoice_date: d10(m.invoice_date), invoice_document_id: m.invoice_document_id || "",
  paid_amount: String(Number(m.paid_amount) || ""), paid_date: d10(m.paid_date), notes: m.notes, sort_order: String(m.sort_order),
});
const fromForm = (f: MilestoneForm) => ({
  name: f.name, percentage: Number(f.percentage) || 0, amount: Number(f.amount) || 0, due_date: f.due_date || null, wbs_task_id: f.wbs_task_id || null,
  requires_bast: !!f.requires_bast, bast_document_id: f.bast_document_id || null, invoice_number: f.invoice_number, invoice_date: f.invoice_date || null,
  invoice_document_id: f.invoice_document_id || null, paid_amount: Number(f.paid_amount) || 0, paid_date: f.paid_date || null, notes: f.notes, sort_order: Number(f.sort_order) || 0,
});

export function FinanceView({ project, user }: { project: Project; user: User }) {
  const { data, error, setError, load } = useLoad<{
    contract: { contract_number: string; contract_value: string; revenue_forecast: string; revenue_actual: string };
    milestones: Milestone[];
    summary: { contract_value: number; billed: number; paid: number; outstanding: number; unbilled: number };
    warnings: { level: string; message: string }[];
  }>(`/projects/${project.id}/finance`);
  const [docs, setDocs] = useState<Doc[]>([]),
    [tasks, setTasks] = useState<{ id: string; name: string }[]>([]),
    [contract, setContract] = useState({ contract_number: "", contract_value: "" }),
    [editing, setEditing] = useState<{ id: string | null; form: MilestoneForm } | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/projects/${project.id}/documents`).then((r) => setDocs(r.documents)).catch(() => setDocs([]));
    api(`/projects/${project.id}/modules/operations`).then((r) => setTasks((r.data as Operations).phases.flatMap((p) => p.tasks.map((t) => ({ id: t.id, name: `${p.name} › ${t.name}` }))))).catch(() => setTasks([]));
  }, [project.id]);
  useEffect(() => {
    if (data) setContract({ contract_number: data.contract.contract_number, contract_value: String(Number(data.contract.contract_value) || "") });
  }, [data]);
  const writable = user.role !== "viewer";
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const bastDocs = docs.filter((d) => d.status === "verified" && d.category === "bast");
  if (!data) return <div className="panel pmo-empty">{error || "Memuat keuangan proyek…"}</div>;
  const s = data.summary;
  return (
    <>
      <div className="pmo-metrics">
        {[["Nilai kontrak", s.contract_value], ["Sudah ditagih", s.billed], ["Sudah dibayar", s.paid], ["Outstanding", s.outstanding], ["Belum ditagih", s.unbilled]].map(([l, v]) => (
          <div className="panel" key={l as string}><span>{l}</span><strong className="pmo-money">{money(v)}</strong></div>
        ))}
      </div>
      {!!data.warnings.length && (
        <ul className="pmo-warning-list panel pmo-section">
          {data.warnings.map((w, i) => <li key={i} className={w.level}>{w.message}</li>)}
        </ul>
      )}
      {error && <div className="error" role="alert">{error}</div>}
      <section className="panel pmo-section">
        <h2>Kontrak</h2>
        <div className="pmo-form-grid">
          <Field label="Nomor kontrak / PKS / SPK" value={contract.contract_number} disabled={!writable || !canManage(user, project)} onChange={(v) => setContract({ ...contract, contract_number: v })} maxLength={100} />
          <Field label="Nilai kontrak (Rp)" type="number" value={contract.contract_value} disabled={!writable || !canManage(user, project)} onChange={(v) => setContract({ ...contract, contract_value: v })} />
        </div>
        <p className="pmo-hint">Nilai yang sudah ditetapkan hanya dapat diubah admin atau melalui Change Request tipe biaya. Nomor/nilai juga dapat diisi dari SPK/PKS yang diverifikasi di Dokumen & OCR.</p>
        {writable && canManage(user, project) && (
          <button className="primary" disabled={busy} onClick={() => run(() => api(`/projects/${project.id}/contract`, { method: "PUT", body: JSON.stringify({ contract_number: contract.contract_number, contract_value: Number(contract.contract_value) || 0 }) }))}>
            <Save size={15} /> Simpan kontrak
          </button>
        )}
      </section>
      <section className="panel pmo-section">
        <div className="pmo-toolbar">
          <div>
            <h2>Termin penagihan</h2>
            <p>Termin yang memerlukan BAST baru dapat ditagihkan setelah BAST terverifikasi ditautkan. Realisasi pendapatan proyek = total pembayaran.</p>
          </div>
          {writable && <button className="primary" onClick={() => setEditing({ id: null, form: { ...emptyMilestone, sort_order: String(data.milestones.length + 1) } })}><Plus size={15} /> Termin</button>}
        </div>
        {!data.milestones.length ? (
          <p className="pmo-empty">Belum ada termin. Tambahkan manual atau buat dari field termin_N pada PKS/SPK terverifikasi.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>TERMIN</th><th>NILAI</th><th>JATUH TEMPO</th><th>BAST</th><th>INVOICE</th><th>PEMBAYARAN</th><th /></tr></thead>
              <tbody>
                {data.milestones.map((m) => {
                  const amount = Number(m.amount), paid = Number(m.paid_amount);
                  return (
                    <tr key={m.id}>
                      <td><strong>{m.name}</strong><p>{Number(m.percentage) ? `${Number(m.percentage)}%` : ""}{m.wbs_task_id ? ` · ${tasks.find((t) => t.id === m.wbs_task_id)?.name || "aktivitas WBS"}` : ""}</p></td>
                      <td>{money(amount)}</td>
                      <td>{m.due_date ? labelDate(d10(m.due_date)) : "—"}</td>
                      <td>{m.bast_document_name ? <span className="pmo-chip approved">{m.bast_document_name}</span> : m.requires_bast ? <span className="pmo-chip pending">Belum ada</span> : "Tidak wajib"}</td>
                      <td>{m.invoice_date ? <>{m.invoice_number || "Invoice"}<p>{labelDate(d10(m.invoice_date))}</p></> : "—"}</td>
                      <td>{paid ? <>{money(paid)}<p>{paid >= amount ? "Lunas" : `Sisa ${money(amount - paid)}`}</p></> : m.invoice_date ? <span className="pmo-chip rejected">Belum dibayar</span> : "—"}</td>
                      <td className="pmo-actions">
                        {writable && <button className="secondary" onClick={() => setEditing({ id: m.id, form: toForm(m) })}>Ubah</button>}
                        {writable && !m.invoice_date && <button className="icon-button" aria-label={`Hapus ${m.name}`} onClick={() => confirm(`Hapus ${m.name}?`) && run(() => api(`/milestones/${m.id}`, { method: "DELETE" }))}><Trash2 size={15} /></button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && (
        <Dialog title={editing.id ? "Ubah termin" : "Termin baru"} onClose={() => setEditing(null)}>
          {(() => {
            const f = editing.form, set = (k: string, v: string | boolean) => setEditing({ ...editing, form: { ...f, [k]: v } });
            return (
              <>
                <div className="pmo-form-grid">
                  <Field label="Nama termin" value={f.name as string} onChange={(v) => set("name", v)} maxLength={200} />
                  <Field label="Jatuh tempo" type="date" value={f.due_date as string} onChange={(v) => set("due_date", v)} />
                  <Field label="Persentase (%)" type="number" value={f.percentage as string} onChange={(v) => set("percentage", v)} />
                  <Field label="Nilai (Rp) — kosongkan untuk dihitung dari %" type="number" value={f.amount as string} onChange={(v) => set("amount", v)} />
                </div>
                <Field label="Milestone WBS terkait" value={f.wbs_task_id as string} onChange={(v) => set("wbs_task_id", v)} options={[["", "— Tidak ditautkan —"], ...tasks.map((t) => [t.id, t.name] as [string, string])]} />
                <label className="pmo-check"><input type="checkbox" checked={!!f.requires_bast} onChange={(e) => set("requires_bast", e.target.checked)} /> Memerlukan BAST sebelum ditagih</label>
                <Field label="BAST terverifikasi" value={f.bast_document_id as string} onChange={(v) => set("bast_document_id", v)} options={[["", "— Belum ada —"], ...bastDocs.map((d) => [d.id, d.name] as [string, string])]} />
                <div className="pmo-form-grid">
                  <Field label="Nomor invoice" value={f.invoice_number as string} onChange={(v) => set("invoice_number", v)} maxLength={100} />
                  <Field label="Tanggal invoice" type="date" value={f.invoice_date as string} onChange={(v) => set("invoice_date", v)} />
                  <Field label="Dibayar (Rp)" type="number" value={f.paid_amount as string} onChange={(v) => set("paid_amount", v)} />
                  <Field label="Tanggal bayar" type="date" value={f.paid_date as string} onChange={(v) => set("paid_date", v)} />
                </div>
                <Field label="Dokumen invoice" value={f.invoice_document_id as string} onChange={(v) => set("invoice_document_id", v)} options={[["", "— Tidak ada —"], ...docs.map((d) => [d.id, `${d.name} [${d.category}]`] as [string, string])]} />
                <Field label="Catatan" type="textarea" value={f.notes as string} onChange={(v) => set("notes", v)} maxLength={2000} />
                {error && <div className="error" role="alert">{error}</div>}
                <div className="modal-actions">
                  <button className="secondary" onClick={() => setEditing(null)}>Batal</button>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await run(() =>
                        api(editing.id ? `/milestones/${editing.id}` : `/projects/${project.id}/milestones`, { method: editing.id ? "PUT" : "POST", body: JSON.stringify(fromForm(f)) }),
                      );
                      if (ok) setEditing(null);
                    }}
                  >
                    Simpan
                  </button>
                </div>
              </>
            );
          })()}
        </Dialog>
      )}
    </>
  );
}

/* --------------------------- Change requests -------------------------- */
type ChangeRequest = {
  id: string;
  number: string;
  title: string;
  type: "scope" | "timeline" | "cost" | "pic";
  description: string;
  reason: string;
  impact: string;
  changes: { new_end_date?: string; new_contract_value?: number; new_manager_id?: string; rebaseline?: boolean };
  status: "draft" | "pending" | "approved" | "rejected" | "cancelled";
  created_by_name: string;
  created_at: string;
  applied_at: string | null;
  approval: Pick<Approval, "id" | "status" | "current_step"> | null;
};
const crTypes: [string, string][] = [["scope", "Scope"], ["timeline", "Timeline"], ["cost", "Biaya"], ["pic", "PIC / manager"]];
const crStatus: Record<ChangeRequest["status"], [string, string]> = {
  draft: ["Draf", "pending"], pending: ["Menunggu persetujuan", "pending"], approved: ["Disetujui & diterapkan", "approved"], rejected: ["Ditolak", "rejected"], cancelled: ["Dibatalkan", "cancelled"],
};
const emptyCr = { title: "", type: "timeline", description: "", reason: "", impact: "", new_end_date: "", new_contract_value: "", new_manager_id: "", rebaseline: false };

export function ChangeRequestsView({ project, user }: { project: Project; user: User }) {
  const list = useLoad<{ change_requests: ChangeRequest[] }>(`/projects/${project.id}/change-requests`);
  const history = useLoad<{ baselines: { id: string; version: number; phases: Operations["phases"]; reason: string; created_at: string; created_by_name: string; change_number: string | null }[] }>(`/projects/${project.id}/baselines`);
  const [form, setForm] = useState<typeof emptyCr | null>(null),
    [editId, setEditId] = useState<string | null>(null),
    [managers, setManagers] = useState<[string, string][]>([]),
    [current, setCurrent] = useState<Operations | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api(`/projects/${project.id}/modules/operations`).then((r) => setCurrent(r.data)).catch(() => setCurrent(null));
    if (canManage(user, project))
      api(`/projects/${project.id}/member-options`).then((r) => setManagers(r.users.filter((u: { role: string }) => u.role !== "viewer").map((u: { id: string; name: string }) => [u.id, u.name]))).catch(() => setManagers([]));
  }, [project, user]);
  const writable = user.role !== "viewer";
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    list.setError("");
    try {
      await fn();
      list.load();
      history.load();
      return true;
    } catch (e) {
      list.setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const body = (f: typeof emptyCr) => ({
    title: f.title, type: f.type, description: f.description, reason: f.reason, impact: f.impact,
    changes: {
      ...(f.new_end_date ? { new_end_date: f.new_end_date } : {}),
      ...(f.new_contract_value ? { new_contract_value: Number(f.new_contract_value) } : {}),
      ...(f.new_manager_id ? { new_manager_id: f.new_manager_id } : {}),
      ...(f.rebaseline ? { rebaseline: true } : {}),
    },
  });
  const summary = (phases?: Operations["phases"]) => {
    const tasks = phases?.flatMap((p) => p.tasks) || [];
    return { tasks: tasks.length, finish: tasks.length ? Math.max(...tasks.map((t) => t.start + t.duration)) : 0 };
  };
  const now = summary(current?.phases);
  return (
    <>
      {list.error && <div className="error" role="alert">{list.error}</div>}
      <section className="panel pmo-section">
        <div className="pmo-toolbar">
          <div>
            <h2>Change request</h2>
            <p>Perubahan scope, timeline, biaya, dan PIC dicatat dengan alasan, lalu diterapkan otomatis setelah disetujui PM dan PMO.</p>
          </div>
          {writable && <button className="primary" onClick={() => { setForm({ ...emptyCr }); setEditId(null); }}><Plus size={15} /> Change request</button>}
        </div>
        {!list.data ? (
          <p className="pmo-empty">Memuat…</p>
        ) : !list.data.change_requests.length ? (
          <p className="pmo-empty">Belum ada change request.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>NOMOR</th><th>PERUBAHAN</th><th>ALASAN</th><th>STATUS</th><th /></tr></thead>
              <tbody>
                {list.data.change_requests.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.number}</strong><p>{crTypes.find((t) => t[0] === c.type)?.[1]}</p></td>
                    <td>
                      <strong>{c.title}</strong>
                      <p>
                        {[
                          c.changes.new_end_date && `Selesai → ${labelDate(c.changes.new_end_date)}`,
                          c.changes.new_contract_value !== undefined && `Kontrak → ${money(c.changes.new_contract_value)}`,
                          c.changes.new_manager_id && `PIC → ${managers.find((m) => m[0] === c.changes.new_manager_id)?.[1] || "manager baru"}`,
                          c.changes.rebaseline && "Baseline baru",
                        ].filter(Boolean).join(" · ") || "Catatan perubahan (tanpa penerapan otomatis)"}
                      </p>
                    </td>
                    <td>{c.reason}{c.impact && <p>Dampak: {c.impact}</p>}</td>
                    <td><span className={`pmo-chip ${crStatus[c.status][1]}`}>{crStatus[c.status][0]}</span>{c.status === "pending" && <p><ApprovalBadge approval={c.approval} /></p>}<p>{c.created_by_name}</p></td>
                    <td className="pmo-actions">
                      {writable && ["draft", "rejected"].includes(c.status) && (
                        <>
                          <button className="secondary" onClick={() => { setEditId(c.status === "draft" ? c.id : null); setForm({ title: c.title, type: c.type, description: c.description, reason: c.reason, impact: c.impact, new_end_date: c.changes.new_end_date || "", new_contract_value: c.changes.new_contract_value !== undefined ? String(c.changes.new_contract_value) : "", new_manager_id: c.changes.new_manager_id || "", rebaseline: !!c.changes.rebaseline }); }}>{c.status === "draft" ? "Ubah" : "Salin"}</button>
                          <button className="primary" disabled={busy} onClick={() => confirm(`Ajukan ${c.number} untuk persetujuan?`) && run(() => api(`/change-requests/${c.id}/submit`, { method: "POST" }))}><Send size={14} /> Ajukan</button>
                          <button className="icon-button" aria-label={`Batalkan ${c.number}`} onClick={() => confirm(`Batalkan ${c.number}?`) && run(() => api(`/change-requests/${c.id}/cancel`, { method: "POST" }))}><Trash2 size={15} /></button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel pmo-section">
        <h2>Riwayat baseline</h2>
        {!history.data?.baselines.length ? (
          <p className="pmo-empty">Baseline belum disimpan. Simpan baseline di menu WBS; baseline berikutnya hanya melalui change request yang disetujui.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>VERSI</th><th>ALASAN</th><th>AKTIVITAS</th><th>SELESAI</th><th>SELISIH VS JADWAL SAAT INI</th></tr></thead>
              <tbody>
                {history.data.baselines.map((b) => {
                  const s = summary(b.phases);
                  return (
                    <tr key={b.id}>
                      <td><strong>v{b.version}</strong><p>{labelDate(d10(b.created_at))} · {b.created_by_name}</p></td>
                      <td>{b.reason}{b.change_number && <p>{b.change_number}</p>}</td>
                      <td>{s.tasks}</td>
                      <td>W{s.finish}</td>
                      <td className={now.finish > s.finish ? "pmo-text-red" : ""}>{now.finish - s.finish > 0 ? `+${now.finish - s.finish}` : now.finish - s.finish} minggu · {now.tasks - s.tasks >= 0 ? "+" : ""}{now.tasks - s.tasks} aktivitas</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {form && (
        <Dialog title={editId ? "Ubah change request" : "Change request baru"} onClose={() => setForm(null)}>
          <div className="pmo-form-grid">
            <Field label="Judul" value={form.title} onChange={(v) => setForm({ ...form, title: v })} maxLength={200} />
            <Field label="Tipe" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={crTypes} />
          </div>
          <Field label="Deskripsi perubahan" type="textarea" value={form.description} onChange={(v) => setForm({ ...form, description: v })} maxLength={5000} />
          <Field label="Alasan (wajib)" type="textarea" value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} maxLength={5000} />
          <Field label="Dampak (jadwal, biaya, kualitas)" type="textarea" value={form.impact} onChange={(v) => setForm({ ...form, impact: v })} maxLength={5000} />
          <h3 className="pmo-subheading">Diterapkan otomatis setelah disetujui</h3>
          <div className="pmo-form-grid">
            <Field label={`Target selesai baru (kini ${labelDate(d10(project.end_date))})`} type="date" value={form.new_end_date} onChange={(v) => setForm({ ...form, new_end_date: v })} />
            <Field label="Nilai kontrak baru (Rp)" type="number" value={form.new_contract_value} onChange={(v) => setForm({ ...form, new_contract_value: v })} />
          </div>
          {!!managers.length && <Field label="PIC / manager baru" value={form.new_manager_id} onChange={(v) => setForm({ ...form, new_manager_id: v })} options={[["", "— Tidak berubah —"], ...managers]} />}
          <label className="pmo-check"><input type="checkbox" checked={form.rebaseline} onChange={(e) => setForm({ ...form, rebaseline: e.target.checked })} /> Jadikan jadwal WBS saat ini sebagai baseline baru</label>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setForm(null)}>Batal</button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                const ok = await run(() => api(editId ? `/change-requests/${editId}` : `/projects/${project.id}/change-requests`, { method: editId ? "PUT" : "POST", body: JSON.stringify(body(form)) }));
                if (ok) setForm(null);
              }}
            >
              Simpan draf
            </button>
          </div>
          {list.error && <div className="error" role="alert">{list.error}</div>}
        </Dialog>
      )}
    </>
  );
}

/* ------------------------------- Closure ------------------------------ */
type Closure = {
  checklist: { id: string; label: string; required: boolean; done: boolean; note: string }[];
  handover: { recipient: string; date: string; notes: string };
  lessons: { id: string; category: string; title: string; insight: string; recommendation: string; tags: string }[];
  summary: string;
  status: "open" | "pending" | "closed";
  version: number;
};

export function ClosureView({ project, user, onUpdated }: { project: Project; user: User; onUpdated: () => Promise<void> }) {
  const { data, error, setError, load } = useLoad<{
    closure: Closure;
    readiness: Record<string, number>;
    approval: Pick<Approval, "id" | "status" | "current_step"> | null;
  }>(`/projects/${project.id}/closure`);
  const [c, setC] = useState<Closure | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    if (data) setC(structuredClone(data.closure));
  }, [data]);
  if (!data || !c) return <div className="panel pmo-empty">{error || "Memuat penutupan proyek…"}</div>;
  const editable = user.role !== "viewer" && c.status === "open";
  const r = data.readiness;
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(ok);
      load();
      await onUpdated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const save = () => run(() => api(`/projects/${project.id}/closure`, { method: "PUT", body: JSON.stringify(c) }), "Penutupan tersimpan.");
  return (
    <>
      <section className="panel pmo-section">
        <div className="pmo-toolbar">
          <div>
            <h2>Kesiapan penutupan</h2>
            <p>Data otomatis dari modul proyek. Selesaikan atau alihkan item terbuka sebelum mengajukan penutupan.</p>
          </div>
          <span className={`pmo-chip ${c.status === "closed" ? "approved" : "pending"}`}>{c.status === "closed" ? "Proyek ditutup" : c.status === "pending" ? "Menunggu persetujuan" : "Terbuka"}</span>
          <ApprovalBadge approval={data.approval} />
        </div>
        <div className="pmo-readiness">
          {[
            ["Progres", `${r.progress}%`, r.progress < 100],
            ["BAST terverifikasi", r.bast_verified, !r.bast_verified],
            ["Belum ditagih", money(r.unbilled), r.unbilled > 0],
            ["Outstanding", money(r.outstanding), r.outstanding > 0],
            ["Risiko terbuka", r.open_risks, r.open_risks > 0],
            ["Kendala terbuka", r.open_issues, r.open_issues > 0],
            ["Tindak lanjut terbuka", r.open_actions, r.open_actions > 0],
            ["Dokumen belum diverifikasi", r.documents_review, r.documents_review > 0],
          ].map(([l, v, warn]) => <div key={l as string} className={warn ? "warn" : "ok"}><span>{l}</span><strong>{v}</strong></div>)}
        </div>
      </section>
      {error && <div className="error" role="alert">{error}</div>}
      {message && <p className="pmo-hint" role="status">{message}</p>}
      <section className="panel pmo-section">
        <h2>Checklist penutupan</h2>
        {c.checklist.map((i, idx) => (
          <div className="pmo-checklist-item" key={i.id}>
            <label className="pmo-check">
              <input type="checkbox" checked={i.done} disabled={!editable} onChange={(e) => { const next = structuredClone(c); next.checklist[idx].done = e.target.checked; setC(next); }} />
              {i.label}{i.required && <span className="pmo-required"> wajib</span>}
            </label>
            <input aria-label={`Catatan ${i.label}`} placeholder="Catatan / bukti" value={i.note} disabled={!editable} maxLength={1000} onChange={(e) => { const next = structuredClone(c); next.checklist[idx].note = e.target.value; setC(next); }} />
          </div>
        ))}
      </section>
      <section className="panel pmo-section">
        <h2>Serah terima</h2>
        <div className="pmo-form-grid">
          <Field label="Penerima (klien / tim operasional)" value={c.handover.recipient} disabled={!editable} onChange={(v) => setC({ ...c, handover: { ...c.handover, recipient: v } })} maxLength={200} />
          <Field label="Tanggal serah terima" type="date" value={c.handover.date} disabled={!editable} onChange={(v) => setC({ ...c, handover: { ...c.handover, date: v } })} />
        </div>
        <Field label="Catatan serah terima (aset, akses, garansi, kontak support)" type="textarea" value={c.handover.notes} disabled={!editable} onChange={(v) => setC({ ...c, handover: { ...c.handover, notes: v } })} maxLength={5000} />
        <Field label="Ringkasan akhir proyek" type="textarea" value={c.summary} disabled={!editable} onChange={(v) => setC({ ...c, summary: v })} maxLength={10000} />
      </section>
      <section className="panel pmo-section">
        <div className="pmo-toolbar">
          <div><h2>Lessons learned</h2><p>Dapat dicari seluruh tim di Knowledge Base setelah proyek ditutup.</p></div>
          {editable && <button className="secondary" onClick={() => setC({ ...c, lessons: [...c.lessons, { id: crypto.randomUUID(), category: "planning", title: "", insight: "", recommendation: "", tags: "" }] })}><Plus size={15} /> Lesson</button>}
        </div>
        {!c.lessons.length && <p className="pmo-empty">Belum ada lessons learned.</p>}
        {c.lessons.map((l, idx) => {
          const set = (k: keyof typeof l, v: string) => { const next = structuredClone(c); next.lessons[idx][k] = v; setC(next); };
          return (
            <div className="pmo-lesson-edit" key={l.id}>
              <div className="pmo-form-grid">
                <Field label="Judul" value={l.title} disabled={!editable} onChange={(v) => set("title", v)} maxLength={200} />
                <Field label="Kategori" value={l.category} disabled={!editable} onChange={(v) => set("category", v)} options={lessonCategories} />
              </div>
              <Field label="Apa yang terjadi / berhasil" type="textarea" value={l.insight} disabled={!editable} onChange={(v) => set("insight", v)} maxLength={5000} />
              <Field label="Rekomendasi untuk proyek berikutnya" type="textarea" value={l.recommendation} disabled={!editable} onChange={(v) => set("recommendation", v)} maxLength={5000} />
              <div className="pmo-toolbar">
                <Field label="Tag (pisahkan koma)" value={l.tags} disabled={!editable} onChange={(v) => set("tags", v)} maxLength={300} />
                {editable && <button className="icon-button" aria-label="Hapus lesson" onClick={() => setC({ ...c, lessons: c.lessons.filter((x) => x.id !== l.id) })}><Trash2 size={15} /></button>}
              </div>
            </div>
          );
        })}
      </section>
      {editable && (
        <div className="pmo-actions pmo-sticky-actions">
          <button className="secondary" disabled={busy} onClick={save}><Save size={15} /> Simpan</button>
          {canManage(user, project) && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => confirm("Simpan lalu ajukan penutupan proyek untuk persetujuan PMO?") &&
                run(async () => {
                  await api(`/projects/${project.id}/closure`, { method: "PUT", body: JSON.stringify(c) });
                  await api(`/projects/${project.id}/closure/submit`, { method: "POST" });
                }, "Penutupan diajukan untuk persetujuan.")}
            >
              <Send size={15} /> Ajukan penutupan
            </button>
          )}
        </div>
      )}
    </>
  );
}
