"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Plus, Send, X } from "lucide-react";
import { api, labelDate, type Project, type User } from "./client";
import { Dialog, Field } from "./ui";

export type Approval = {
  id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  kind: "baseline" | "weekly_report" | "document" | "change_request" | "closure";
  resource_id: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  current_step: number;
  requested_by: string;
  requester_name: string;
  requested_at: string;
  decided_at: string | null;
  can_decide: boolean;
  snapshot: Record<string, unknown>;
  steps?: {
    step: number;
    approver_role: "project_manager" | "pmo";
    decision: string;
    decided_by_name: string | null;
    decided_at: string | null;
    note: string;
  }[];
};
export const approvalKinds: Record<Approval["kind"], string> = {
  baseline: "Baseline WBS",
  weekly_report: "Laporan mingguan",
  document: "Dokumen/BAST",
  change_request: "Change request",
  closure: "Penutupan proyek",
};
const statusText: Record<Approval["status"], string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};
const decisionText: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  skipped: "Dilewati",
};
const when = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v))
    : "—";

export function ApprovalBadge({ approval }: { approval: Pick<Approval, "status" | "current_step"> | null | undefined }) {
  if (!approval) return null;
  return (
    <span className={`pmo-chip ${approval.status}`}>
      {statusText[approval.status]}
      {approval.status === "pending" && ` · tahap ${approval.current_step === 1 ? "PM" : "PMO"}`}
    </span>
  );
}

/** Shows the latest approval for a resource and lets writers request one. */
export function RequestApproval({
  projectId,
  kind,
  resourceId,
  body,
  user,
  label = "Ajukan persetujuan",
  disabled = false,
}: {
  projectId: string;
  kind: "baseline" | "weekly_report" | "document";
  resourceId: string;
  body: Record<string, unknown>;
  user: User;
  label?: string;
  disabled?: boolean;
}) {
  const [latest, setLatest] = useState<Approval | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const r = await api(`/approvals?scope=all&project_id=${projectId}`);
      setLatest(
        (r.approvals as Approval[]).find((a) => a.kind === kind && a.resource_id === resourceId) || null,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [projectId, kind, resourceId]);
  useEffect(() => {
    void load();
  }, [load]);
  const canRequest =
    user.role !== "viewer" && !disabled && (!latest || ["rejected", "cancelled"].includes(latest.status));
  return (
    <span className="pmo-approval-inline">
      {latest && <small className="pmo-hint">Persetujuan:</small>}
      <ApprovalBadge approval={latest} />
      {canRequest && (
        <button
          className="secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/approvals", { method: "POST", body: JSON.stringify({ kind, project_id: projectId, ...body }) });
              await load();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Send size={14} /> {label}
        </button>
      )}
      {error && <small className="pmo-inline-error">{error}</small>}
    </span>
  );
}

function Snapshot({ a }: { a: Approval }) {
  const s = a.snapshot || {};
  if (a.kind === "weekly_report") {
    const m = s.metrics as { plan: number; actual: number; deviation: number } | undefined;
    const r = s.report as Record<string, string> | null;
    return (
      <div className="pmo-snapshot">
        <p>Minggu W{String(s.week)} · rencana {m?.plan}% · realisasi {m?.actual}% · deviasi {m?.deviation}</p>
        {r && <p>{[r.notes, r.done && `Selesai: ${r.done}`, r.next && `Berikutnya: ${r.next}`].filter(Boolean).join(" · ")}</p>}
        <p>{(s.open_issues as unknown[])?.length || 0} kendala terbuka</p>
      </div>
    );
  }
  if (a.kind === "change_request") {
    const cr = s.change_request as Record<string, unknown> & { changes: Record<string, unknown> };
    const before = s.before as Record<string, unknown>;
    return (
      <div className="pmo-snapshot">
        <p><strong>{String(cr.number)}</strong> · {String(cr.type)} · {String(cr.title)}</p>
        <p>Alasan: {String(cr.reason)}</p>
        {!!cr.impact && <p>Dampak: {String(cr.impact)}</p>}
        <ul>
          {cr.changes.new_end_date !== undefined && <li>Target selesai: {String(before.end_date)} → {String(cr.changes.new_end_date)}</li>}
          {cr.changes.new_contract_value !== undefined && <li>Nilai kontrak: {Number(before.contract_value).toLocaleString("id-ID")} → {Number(cr.changes.new_contract_value).toLocaleString("id-ID")}</li>}
          {!!cr.changes.new_manager_id && <li>PIC/manager diganti (sebelumnya {String(before.manager_name)})</li>}
          {!!cr.changes.rebaseline && <li>Baseline WBS diperbarui dari jadwal saat ini</li>}
        </ul>
      </div>
    );
  }
  if (a.kind === "baseline")
    return <div className="pmo-snapshot"><p>{String(s.tasks)} aktivitas · selesai minggu W{String(s.finish_week)}</p></div>;
  if (a.kind === "document")
    return <div className="pmo-snapshot"><p>{String(s.name)} · {String(s.category).toUpperCase()} · versi {String(s.version_number)}</p></div>;
  if (a.kind === "closure")
    return <div className="pmo-snapshot"><p>{String(s.lessons)} lessons learned · serah terima ke {String((s.handover as Record<string, string>)?.recipient || "—")}</p>{!!s.summary && <p>{String(s.summary)}</p>}</div>;
  return null;
}

function ApprovalDialog({ id, user, onClose }: { id: string; user: User; onClose: (changed: boolean) => void }) {
  const [a, setA] = useState<Approval | null>(null),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api(`/approvals/${id}`).then(setA).catch((e) => setError(e.message));
  }, [id]);
  async function act(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
      onClose(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={a?.title || "Persetujuan"} onClose={() => onClose(false)}>
      {!a ? (
        <p className="pmo-empty">{error || "Memuat…"}</p>
      ) : (
        <>
          <p className="pmo-hint">
            {approvalKinds[a.kind]} · {a.project_code} · diajukan {a.requester_name}, {when(a.requested_at)} · <ApprovalBadge approval={a} />
          </p>
          <Snapshot a={a} />
          <ol className="pmo-steps">
            {a.steps?.map((s) => (
              <li key={s.step} className={s.decision}>
                <strong>Tahap {s.step} · {s.approver_role === "pmo" ? "PMO (admin)" : "Project manager"}</strong>
                <span>{decisionText[s.decision]}{s.decided_by_name ? ` oleh ${s.decided_by_name}` : ""} · {when(s.decided_at)}</span>
                {s.note && <p>{s.note}</p>}
              </li>
            ))}
          </ol>
          {error && <div className="error" role="alert">{error}</div>}
          {a.can_decide && (
            <>
              <Field label="Catatan / alasan (wajib saat menolak)" type="textarea" value={note} onChange={setNote} maxLength={2000} />
              <div className="modal-actions">
                <button className="secondary" disabled={busy || note.trim().length < 3} onClick={() => act(`/approvals/${id}/decision`, { decision: "rejected", note })}>
                  <X size={15} /> Tolak
                </button>
                <button className="primary" disabled={busy} onClick={() => act(`/approvals/${id}/decision`, { decision: "approved", note })}>
                  <Check size={15} /> Setujui
                </button>
              </div>
            </>
          )}
          {a.status === "pending" && (a.requested_by === user.id || user.role === "admin") && !a.can_decide && (
            <div className="modal-actions">
              <button className="secondary" disabled={busy} onClick={() => confirm("Batalkan permintaan persetujuan ini?") && act(`/approvals/${id}/cancel`)}>
                Batalkan permintaan
              </button>
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

export function ApprovalsPage({ user }: { user: User }) {
  const [scope, setScope] = useState("inbox"),
    [rows, setRows] = useState<Approval[] | null>(null),
    [open, setOpen] = useState<string | null>(null),
    [error, setError] = useState("");
  const load = useCallback(() => {
    setRows(null);
    api(`/approvals?scope=${scope}`)
      .then((r) => setRows(r.approvals))
      .catch((e) => setError(e.message));
  }, [scope]);
  useEffect(load, [load]);
  return (
    <>
      <PageHeading eyebrow="PMO / GOVERNANCE" title="Persetujuan" text="Persetujuan berjenjang: project manager, lalu PMO. Pengaju tidak dapat menyetujui permintaannya sendiri." />
      <section className="panel pmo-section">
        <div className="filter-tabs pmo-tabs">
          {[["inbox", "Perlu keputusan saya"], ["mine", "Pengajuan saya"], ["all", "Semua riwayat"]].map(([v, t]) => (
            <button key={v} className={scope === v ? "active" : ""} onClick={() => setScope(v)}>{t}</button>
          ))}
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        {!rows ? (
          <p className="pmo-empty">Memuat persetujuan…</p>
        ) : !rows.length ? (
          <p className="pmo-empty">{scope === "inbox" ? "Tidak ada persetujuan yang menunggu keputusan Anda." : "Belum ada persetujuan."}</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>PERMINTAAN</th><th>JENIS</th><th>PENGAJU</th><th>STATUS</th><th /></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td><strong>{a.title}</strong><p>{a.project_code} · {a.project_name}</p></td>
                    <td>{approvalKinds[a.kind]}</td>
                    <td>{a.requester_name}<p>{when(a.requested_at)}</p></td>
                    <td><ApprovalBadge approval={a} /></td>
                    <td><button className={a.can_decide ? "primary" : "secondary"} onClick={() => setOpen(a.id)}>{a.can_decide ? "Tinjau" : "Detail"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {open && <ApprovalDialog id={open} user={user} onClose={(changed) => { setOpen(null); if (changed) load(); }} />}
    </>
  );
}

export function PageHeading({ eyebrow, title, text, children }: { eyebrow: string; title: string; text: string; children?: React.ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow blue">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {children}
    </div>
  );
}

type ActionItem = {
  id: string;
  project_id: string;
  project_code: string;
  project_name: string;
  source: "meeting" | "mom" | "manual";
  source_label: string;
  text: string;
  pic: string;
  due: string;
  status: "not_started" | "in_progress" | "pending" | "done" | "cancelled";
  evidence: string;
  evidence_document_id: string | null;
  evidence_document_name: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
};
const actionStatus: [ActionItem["status"], string][] = [
  ["not_started", "Belum mulai"],
  ["in_progress", "Berjalan"],
  ["pending", "Tertunda"],
  ["done", "Selesai"],
  ["cancelled", "Dibatalkan"],
];
const sourceText = { meeting: "Corporate Meeting", mom: "MOM", manual: "Manual" };

function ActionDialog({ item, onClose }: { item: ActionItem; onClose: (changed: boolean) => void }) {
  const [form, setForm] = useState({ status: item.status, evidence: item.evidence, evidence_document_id: item.evidence_document_id || "", pic: item.pic, due: item.due.slice(0, 10) }),
    [docs, setDocs] = useState<{ id: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    api(`/projects/${item.project_id}/documents`).then((r) => setDocs(r.documents)).catch(() => setDocs([]));
  }, [item.project_id]);
  return (
    <Dialog title="Perbarui tindak lanjut" onClose={() => onClose(false)}>
      <p className="pmo-hint">{item.project_code} · {item.source_label || sourceText[item.source]}</p>
      <p><strong>{item.text}</strong></p>
      <div className="pmo-form-grid">
        <Field label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v as ActionItem["status"] })} options={actionStatus} />
        <Field label="Target" type="date" value={form.due} onChange={(v) => setForm({ ...form, due: v })} />
      </div>
      <Field label="PIC" value={form.pic} onChange={(v) => setForm({ ...form, pic: v })} maxLength={150} />
      <Field label={`Bukti penyelesaian${form.status === "done" ? " (wajib bila tanpa dokumen)" : ""}`} type="textarea" value={form.evidence} onChange={(v) => setForm({ ...form, evidence: v })} maxLength={5000} />
      <Field label="Dokumen bukti (opsional)" value={form.evidence_document_id} onChange={(v) => setForm({ ...form, evidence_document_id: v })} options={[["", "— Tanpa dokumen —"], ...docs.map((d) => [d.id, d.name] as [string, string])]} />
      {error && <div className="error" role="alert">{error}</div>}
      <div className="modal-actions">
        <button className="secondary" onClick={() => onClose(false)}>Batal</button>
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api(`/action-items/${item.id}`, { method: "PATCH", body: JSON.stringify({ ...form, evidence_document_id: form.evidence_document_id || null }) });
              onClose(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Simpan
        </button>
      </div>
    </Dialog>
  );
}

export function ActionItemsPage({ projects, user }: { projects: Project[]; user: User }) {
  const [status, setStatus] = useState("open"),
    [projectId, setProjectId] = useState(""),
    [mine, setMine] = useState(false),
    [data, setData] = useState<{ items: ActionItem[]; today: string } | null>(null),
    [editing, setEditing] = useState<ActionItem | null>(null),
    [adding, setAdding] = useState(false),
    [draft, setDraft] = useState({ project_id: projects[0]?.id || "", text: "", pic: "", due: "" }),
    [error, setError] = useState("");
  const load = useCallback(() => {
    api(`/action-items?status=${status}${projectId ? `&project_id=${projectId}` : ""}${mine ? "&mine=1" : ""}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [status, projectId, mine]);
  useEffect(load, [load]);
  const writable = user.role !== "viewer";
  return (
    <>
      <PageHeading eyebrow="PMO / GOVERNANCE" title="Action Items" text="Keputusan rapat dan MOM menjadi tugas dengan PIC, target, status, dan bukti penyelesaian. Tugas terbuka terbawa ke rapat berikutnya.">
        {writable && <button className="primary" onClick={() => setAdding(true)}><Plus size={16} /> Tindak lanjut</button>}
      </PageHeading>
      <section className="panel pmo-section">
        <div className="pmo-toolbar">
          <Field label="Status" value={status} onChange={setStatus} options={[["open", "Terbuka"], ["overdue", "Melewati target"], ["done", "Selesai"], ["all", "Semua"]]} />
          <Field label="Proyek" value={projectId} onChange={setProjectId} options={[["", "Semua proyek"], ...projects.map((p) => [p.id, `${p.code} · ${p.name}`] as [string, string])]} />
          <label className="pmo-check"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Hanya PIC saya</label>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        {!data ? (
          <p className="pmo-empty">Memuat tindak lanjut…</p>
        ) : !data.items.length ? (
          <p className="pmo-empty">Tidak ada tindak lanjut pada filter ini.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>TINDAK LANJUT</th><th>PROYEK</th><th>PIC</th><th>TARGET</th><th>STATUS</th><th>BUKTI</th><th /></tr></thead>
              <tbody>
                {data.items.map((a) => {
                  const overdue = !["done", "cancelled"].includes(a.status) && a.due.slice(0, 10) < data.today;
                  return (
                    <tr key={a.id} className={overdue ? "pmo-row-overdue" : ""}>
                      <td><strong>{a.text}</strong><p>{a.source_label || sourceText[a.source]}</p></td>
                      <td>{a.project_code}</td>
                      <td>{a.pic}</td>
                      <td>{labelDate(a.due.slice(0, 10))}{overdue && <p className="pmo-text-red">Terlambat</p>}</td>
                      <td><span className={`pmo-chip ${a.status === "done" ? "approved" : overdue ? "rejected" : "pending"}`}>{actionStatus.find((s) => s[0] === a.status)?.[1]}</span></td>
                      <td>{a.evidence || a.evidence_document_name || "—"}{a.completed_by_name && <p>oleh {a.completed_by_name}</p>}</td>
                      <td>{writable && <button className="secondary" onClick={() => setEditing(a)}>Perbarui</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <ActionDialog item={editing} onClose={(changed) => { setEditing(null); if (changed) load(); }} />}
      {adding && (
        <Dialog title="Tindak lanjut baru" onClose={() => setAdding(false)}>
          <Field label="Proyek" value={draft.project_id} onChange={(v) => setDraft({ ...draft, project_id: v })} options={projects.map((p) => [p.id, `${p.code} · ${p.name}`])} />
          <Field label="Tindak lanjut" value={draft.text} onChange={(v) => setDraft({ ...draft, text: v })} maxLength={250} />
          <div className="pmo-form-grid">
            <Field label="PIC" value={draft.pic} onChange={(v) => setDraft({ ...draft, pic: v })} maxLength={150} />
            <Field label="Target" type="date" value={draft.due} onChange={(v) => setDraft({ ...draft, due: v })} />
          </div>
          {error && <div className="error" role="alert">{error}</div>}
          <div className="modal-actions">
            <button className="secondary" onClick={() => setAdding(false)}>Batal</button>
            <button
              className="primary"
              onClick={async () => {
                setError("");
                try {
                  await api("/action-items", { method: "POST", body: JSON.stringify(draft) });
                  setAdding(false);
                  setDraft({ ...draft, text: "", pic: "", due: "" });
                  load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Simpan
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
