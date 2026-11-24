"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
import { BellRing, RefreshCw, TriangleAlert } from "lucide-react";
import { api, labelDate, money, type User } from "./client";
import { PageHeading } from "./governance";

export type Health = {
  id: string;
  code: string;
  name: string;
  customer: string;
  status: string;
  manager_name: string;
  pillar: string;
  end_date: string;
  progress: number;
  week: number;
  plan: number | null;
  actual: number | null;
  deviation: number | null;
  days_to_end: number;
  days_late: number;
  report_updated_at: string | null;
  finance: { contract_value: number; billed: number; paid: number; outstanding: number; unbilled: number };
  risks: { open: number; high: number };
  issues_open: number;
  actions: { open: number; overdue: number };
  documents: { needs_review: number; failed: number; bast_verified: number };
  approvals_pending: number;
  warnings: { level: "red" | "amber"; code: string; message: string }[];
  rag: "red" | "amber" | "green";
};
type Summary = {
  total: number;
  red: number;
  amber: number;
  green: number;
  late: number;
  contract_value: number;
  billed: number;
  paid: number;
  outstanding: number;
  high_risks: number;
  overdue_actions: number;
  documents_review: number;
};
const ragText = { red: "Merah", amber: "Kuning", green: "Hijau" };

export function Rag({ value }: { value: Health["rag"] }) {
  return <span className={`pmo-rag ${value}`}><i />{ragText[value]}</span>;
}

function usePortfolio() {
  const [data, setData] = useState<{ projects: Health[]; summary: Summary } | null>(null),
    [error, setError] = useState("");
  const load = useCallback(() => {
    api("/portfolio/health").then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  return { data, error, load };
}

/** Compact early-warning list for the dashboard. */
export function WarningsPanel() {
  const { data, error } = usePortfolio();
  const warnings = (data?.projects || []).flatMap((p) => p.warnings.map((w) => ({ ...w, project: p })));
  warnings.sort((a, b) => (a.level === b.level ? 0 : a.level === "red" ? -1 : 1));
  return (
    <section className="panel pmo-section pmo-warnings">
      <div className="panel-heading">
        <div>
          <h2>Peringatan dini <span className="count-pill">{warnings.length}</span></h2>
          <p>Keterlambatan, deadline, laporan basi, BAST/termin, risiko tinggi, dan tindak lanjut terlambat.</p>
        </div>
        {data && (
          <div className="pmo-rag-summary">
            <Rag value="red" /> {data.summary.red} <Rag value="amber" /> {data.summary.amber} <Rag value="green" /> {data.summary.green}
          </div>
        )}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {!data ? (
        <p className="pmo-empty">Memuat peringatan…</p>
      ) : !warnings.length ? (
        <p className="pmo-empty">Tidak ada peringatan. Semua proyek dalam kondisi hijau.</p>
      ) : (
        <ul className="pmo-warning-list">
          {warnings.slice(0, 8).map((w, i) => (
            <li key={i} className={w.level}>
              <TriangleAlert size={15} />
              <span><strong>{w.project.code}</strong> {w.message}</span>
            </li>
          ))}
          {warnings.length > 8 && <li className="more">+{warnings.length - 8} peringatan lain di Portfolio Health</li>}
        </ul>
      )}
    </section>
  );
}

export function PortfolioHealthPage({ user }: { user: User }) {
  const { data, error, load } = usePortfolio(),
    [rag, setRag] = useState<"all" | Health["rag"]>("all"),
    [open, setOpen] = useState<string | null>(null),
    [running, setRunning] = useState(""),
    [query, setQuery] = useState("");
  const rows = (data?.projects || []).filter(
    (p) => (rag === "all" || p.rag === rag) && `${p.code} ${p.name} ${p.customer} ${p.manager_name}`.toLowerCase().includes(query.toLowerCase()),
  );
  const s = data?.summary;
  return (
    <>
      <PageHeading eyebrow="PMO / INSIGHT" title="Portfolio Health" text="Status RAG otomatis dari jadwal, deadline, laporan, keuangan, risiko, tindak lanjut, dan dokumen.">
        <div className="pmo-actions">
          <button className="secondary" onClick={load}><RefreshCw size={15} /> Muat ulang</button>
          {user.role === "admin" && (
            <button
              className="secondary"
              onClick={async () => {
                setRunning("Menjalankan…");
                try {
                  const r = await api("/admin/early-warning/run", { method: "POST" });
                  setRunning(r.skipped ? "Pemeriksaan lain sedang berjalan." : `${r.notifications} notifikasi baru${r.teams ? " · terkirim ke Teams" : ""}.`);
                } catch (e) {
                  setRunning((e as Error).message);
                }
              }}
            >
              <BellRing size={15} /> Kirim peringatan sekarang
            </button>
          )}
        </div>
      </PageHeading>
      {running && <p className="pmo-hint" role="status">{running}</p>}
      {error && <div className="error" role="alert">{error}</div>}
      {s && (
        <section className="pmo-tiles">
          <button className={rag === "all" ? "active" : ""} onClick={() => setRag("all")}><span>Total proyek</span><strong>{s.total}</strong><small>{s.late} melewati target</small></button>
          {(["red", "amber", "green"] as const).map((k) => (
            <button key={k} className={`${k} ${rag === k ? "active" : ""}`} onClick={() => setRag(k)}><span>{ragText[k]}</span><strong>{s[k]}</strong><small>{k === "red" ? "Butuh eskalasi" : k === "amber" ? "Perlu perhatian" : "Sesuai rencana"}</small></button>
          ))}
          <div><span>Nilai kontrak</span><strong className="small">{money(s.contract_value)}</strong><small>Dibayar {money(s.paid)}</small></div>
          <div><span>Outstanding</span><strong className="small">{money(s.outstanding)}</strong><small>Ditagih {money(s.billed)}</small></div>
          <div><span>Risiko tinggi</span><strong>{s.high_risks}</strong><small>{s.overdue_actions} tindak lanjut terlambat</small></div>
          <div><span>Dokumen</span><strong>{s.documents_review}</strong><small>menunggu verifikasi</small></div>
        </section>
      )}
      <section className="panel pmo-section">
        <div className="table-toolbar">
          <div className="search"><input aria-label="Cari proyek" placeholder="Cari proyek, klien, PM…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        </div>
        {!data ? (
          <p className="pmo-empty">Memuat portofolio…</p>
        ) : !rows.length ? (
          <p className="pmo-empty">Tidak ada proyek pada filter ini.</p>
        ) : (
          <div className="table-scroll">
            <table className="pmo-health-table">
              <thead><tr><th>PROYEK</th><th>RAG</th><th>JADWAL</th><th>TARGET</th><th>KEUANGAN</th><th>RISIKO / TINDAK LANJUT</th><th>DOKUMEN</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <Fragment key={p.id}>
                    <tr onClick={() => setOpen(open === p.id ? null : p.id)} className="pmo-clickable">
                      <td><strong>{p.code} · {p.name}</strong><p>{p.customer} · PM {p.manager_name}</p></td>
                      <td><Rag value={p.rag} /><p>{p.warnings.length} peringatan</p></td>
                      <td>
                        {p.deviation === null ? <>Progres {p.progress}%<p>WBS belum ada</p></> : <>Rencana {p.plan}% · Real {p.actual}%<p className={p.deviation < -5 ? "pmo-text-red" : ""}>Deviasi {p.deviation} (W{p.week})</p></>}
                      </td>
                      <td>{labelDate(p.end_date)}<p className={p.days_late ? "pmo-text-red" : ""}>{p.days_late ? `Terlambat ${p.days_late} hari` : `${p.days_to_end} hari lagi`}</p></td>
                      <td>{money(p.finance.contract_value)}<p>Outstanding {money(p.finance.outstanding)}</p></td>
                      <td>{p.risks.high} tinggi / {p.risks.open} risiko<p>{p.actions.overdue} terlambat / {p.actions.open} terbuka</p></td>
                      <td>{p.documents.needs_review} review · {p.documents.bast_verified} BAST<p>{p.approvals_pending} persetujuan menunggu</p></td>
                    </tr>
                    {open === p.id && (
                      <tr className="pmo-detail-row">
                        <td colSpan={7}>
                          {p.warnings.length ? (
                            <ul className="pmo-warning-list">
                              {p.warnings.map((w, i) => <li key={i} className={w.level}><TriangleAlert size={14} /> <span>{w.message}</span></li>)}
                            </ul>
                          ) : <p>Tidak ada peringatan untuk proyek ini.</p>}
                          <p className="pmo-hint">Laporan terakhir diperbarui: {p.report_updated_at ? labelDate(p.report_updated_at.slice(0, 10)) : "belum ada"} · {p.issues_open} kendala terbuka · belum ditagih {money(p.finance.unbilled)}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

type Person = {
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
const monthLabel = (m: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" }).format(new Date(`${m}-01T00:00:00`));

export function WorkloadPage({ user }: { user: User }) {
  const [data, setData] = useState<{ scope: string; people: Person[] } | null>(null),
    [error, setError] = useState("");
  const load = useCallback(() => {
    api("/resources/workload?months=6").then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(load, [load]);
  const months = data?.people[0]?.months.map((m) => m.month) || [];
  return (
    <>
      <PageHeading
        eyebrow="PMO / INSIGHT"
        title="Kapasitas Resource"
        text={data?.scope === "self" ? "Beban proyek dan tindak lanjut Anda. Admin PMO melihat seluruh tim." : "Beban kerja PM/admin: proyek dikelola (1), keanggotaan (0,5), tindak lanjut, dan benturan jadwal per bulan."}
      />
      {error && <div className="error" role="alert">{error}</div>}
      <section className="panel pmo-section">
        {!data ? (
          <p className="pmo-empty">Memuat beban kerja…</p>
        ) : !data.people.length ? (
          <p className="pmo-empty">Belum ada PM atau admin aktif.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ORANG</th><th>KAPASITAS</th><th>BEBAN</th><th>TINDAK LANJUT</th>
                  {months.map((m) => <th key={m}>{monthLabel(m).toUpperCase()}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <p>{p.managed.map((m) => m.code).join(", ") || "Tidak mengelola proyek"}{p.member_of ? ` · anggota ${p.member_of}` : ""}</p>
                      {p.conflicts.map((c) => <p key={c} className="pmo-text-red">{c}</p>)}
                    </td>
                    <td>
                      {user.role === "admin" ? (
                        <input
                          className="pmo-capacity"
                          type="number"
                          min={1}
                          max={50}
                          aria-label={`Kapasitas ${p.name}`}
                          defaultValue={p.capacity}
                          onBlur={async (e) => {
                            const capacity = Number(e.target.value);
                            if (capacity === p.capacity || !capacity) return;
                            try {
                              await api(`/admin/users/${p.id}/capacity`, { method: "PATCH", body: JSON.stringify({ capacity }) });
                              load();
                            } catch (err) {
                              setError((err as Error).message);
                            }
                          }}
                        />
                      ) : p.capacity}
                      <p>proyek setara</p>
                    </td>
                    <td>
                      <div className="pmo-util"><i className={p.utilization > 100 ? "over" : p.utilization >= 80 ? "high" : ""} style={{ width: `${Math.min(100, p.utilization)}%` }} /></div>
                      <p>{p.load} / {p.capacity} · {p.utilization}%</p>
                    </td>
                    <td>{p.actions.open} terbuka<p className={p.actions.overdue ? "pmo-text-red" : ""}>{p.actions.overdue} terlambat</p></td>
                    {p.months.map((m) => (
                      <td key={m.month} title={m.names.join(", ")}>
                        <span className={`pmo-heat ${m.over ? "over" : m.projects >= p.capacity ? "full" : m.projects ? "busy" : ""}`}>{m.projects}</span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
