"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BookOpen, Bot, Search, Send } from "lucide-react";
import { api, labelDate, type Project } from "./client";
import { PageHeading } from "./governance";
import { Field } from "./ui";

type Turn = { question: string; answer: string; mode: string; model?: string; provider?: string; sources: string[] };
const suggestions = [
  "Proyek mana yang berisiko terlambat bulan ini?",
  "Apa blocker proyek yang paling kritis?",
  "Ringkas progres minggu ini",
  "Termin mana yang belum ditagih atau belum dibayar?",
  "Dokumen apa yang masih menunggu verifikasi?",
];

export function AssistantPage({ projects }: { projects: Project[] }) {
  const [projectId, setProjectId] = useState(""),
    [question, setQuestion] = useState(""),
    [turns, setTurns] = useState<Turn[]>([]),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState<{ mode: string; model: string | null } | null>(null),
    [fallback, setFallback] = useState(''),
    [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    api("/assistant/status").then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => {
    // scrollIntoView returns a Promise in current browsers; never return it as a cleanup.
    void end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);
  async function ask(q = question) {
    if (q.trim().length < 3) return;
    setBusy(true);
    setError("");
    try {
      const r = await api("/assistant/ask", { method: "POST", body: JSON.stringify({ question: q, project_id: projectId || null }) });
      setFallback(r.fallback_reason || '');
      setTurns((t) => [...t, { question: q, ...r }]);
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="PMO / INSIGHT"
        title="Asisten PMO"
        text="Tanyakan kondisi portofolio. Jawaban hanya memakai data proyek dan dokumen yang boleh Anda akses; asisten tidak mengubah data."
      >
        <span className={`pmo-chip ${status?.mode === "ai" && !fallback ? "approved" : "pending"}`}>
          {fallback ? 'Mode lokal · OpenAI belum tersedia' : status?.mode === "ai" ? `AI · OpenAI · ${status.model}` : "Mode aturan lokal"}
        </span>
      </PageHeading>
      <section className="panel pmo-section pmo-chat">
        {status?.mode === 'ai' && <p className="pmo-hint">Mode AI mengirim ringkasan proyek yang boleh Anda akses ke OpenAI untuk menjawab pertanyaan.</p>}
        {fallback && <p className="pmo-hint" role="status">Jawaban lokal digunakan karena {fallback}. Hubungi administrator untuk memeriksa konfigurasi atau saldo API.</p>}
        <div className="pmo-toolbar">
          <Field label="Cakupan" value={projectId} onChange={setProjectId} options={[["", "Seluruh portofolio saya"], ...projects.map((p) => [p.id, `${p.code} · ${p.name}`] as [string, string])]} />
        </div>
        <div className="pmo-chat-log" aria-live="polite">
          {!turns.length && (
            <div className="pmo-chat-empty">
              <Bot size={28} />
              <p>Pilih contoh pertanyaan atau tulis pertanyaan Anda.</p>
              <div className="pmo-suggestions">
                {suggestions.map((s) => <button key={s} className="secondary" disabled={busy} onClick={() => ask(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className="pmo-turn">
              <p className="q">{t.question}</p>
              <div className="a">
                <p>{t.answer}</p>
                <small>{t.mode === "ai" ? `Dijawab OpenAI · ${t.model || 'AI'}` : "Aturan lokal"} · sumber: {t.sources.length ? t.sources.slice(0, 12).join(", ") + (t.sources.length > 12 ? ", …" : "") : "—"}</small>
              </div>
            </div>
          ))}
          {busy && <p className="pmo-hint">Membaca data proyek…</p>}
          <div ref={end} />
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <form className="pmo-chat-input" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
          <input aria-label="Pertanyaan" placeholder="Contoh: Apa blocker proyek BTN?" value={question} maxLength={1000} onChange={(e) => setQuestion(e.target.value)} />
          <button className="primary" disabled={busy || question.trim().length < 3}><Send size={15} /> Tanya</button>
        </form>
      </section>
    </>
  );
}

type Lesson = {
  project_id: string;
  code: string;
  name: string;
  customer: string;
  pillar: string;
  closed_at: string | null;
  lesson: { id: string; category: string; title: string; insight: string; recommendation: string; tags: string };
};
export const lessonCategories: [string, string][] = [
  ["planning", "Perencanaan"],
  ["technical", "Teknis"],
  ["stakeholder", "Stakeholder"],
  ["resource", "Resource"],
  ["commercial", "Komersial"],
  ["quality", "Kualitas"],
  ["other", "Lainnya"],
];

export function KnowledgePage() {
  const [q, setQ] = useState(""),
    [data, setData] = useState<{ lessons: Lesson[]; documents: { id: string; name: string; category: string; code: string; project_name: string }[] } | null>(null),
    [error, setError] = useState("");
  const search = useCallback((query: string) => {
    api(`/knowledge?q=${encodeURIComponent(query)}`).then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    search("");
  }, [search]);
  return (
    <>
      <PageHeading eyebrow="PMO / INSIGHT" title="Knowledge Base" text="Lessons learned dari proyek yang sudah ditutup, dapat dicari seluruh tim. Dokumen terverifikasi ditampilkan sesuai akses proyek Anda." />
      <section className="panel pmo-section">
        <form className="pmo-chat-input" onSubmit={(e) => { e.preventDefault(); search(q); }}>
          <input aria-label="Cari pengalaman" placeholder="Cari: migrasi, akses server, BAST, nama klien…" value={q} maxLength={200} onChange={(e) => setQ(e.target.value)} />
          <button className="primary"><Search size={15} /> Cari</button>
        </form>
        {error && <div className="error" role="alert">{error}</div>}
        {!data ? (
          <p className="pmo-empty">Memuat pengetahuan…</p>
        ) : (
          <>
            {!data.lessons.length ? (
              <p className="pmo-empty">{q ? "Tidak ada lessons learned yang cocok." : "Belum ada proyek yang ditutup dengan lessons learned."}</p>
            ) : (
              <div className="pmo-lessons">
                {data.lessons.map((l) => (
                  <article key={`${l.project_id}-${l.lesson.id}`} className="panel">
                    <span className="pmo-chip pending">{lessonCategories.find((c) => c[0] === l.lesson.category)?.[1]}</span>
                    <h3>{l.lesson.title}</h3>
                    <p>{l.lesson.insight}</p>
                    {l.lesson.recommendation && <p><strong>Rekomendasi:</strong> {l.lesson.recommendation}</p>}
                    <small><BookOpen size={12} /> {l.code} · {l.name} · {l.customer}{l.closed_at ? ` · ditutup ${labelDate(l.closed_at.slice(0, 10))}` : ""}{l.lesson.tags ? ` · #${l.lesson.tags.split(",").map((t) => t.trim()).filter(Boolean).join(" #")}` : ""}</small>
                  </article>
                ))}
              </div>
            )}
            {!!data.documents.length && (
              <>
                <h2 className="pmo-subheading">Dokumen terverifikasi</h2>
                <ul className="pmo-plain-list">
                  {data.documents.map((d) => <li key={d.id}><strong>{d.name}</strong> · {d.category.toUpperCase()} · {d.code} {d.project_name}</li>)}
                </ul>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}

type Note = { id: number; level: "red" | "amber" | "info"; title: string; body: string; read_at: string | null; created_at: string };

export function NotificationBell() {
  const [data, setData] = useState<{ notifications: Note[]; unread: number } | null>(null),
    [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const load = useCallback(() => {
    api("/notifications").then(setData).catch(() => {});
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  useEffect(() => {
    load();
    const t = setInterval(load, 120000);
    return () => clearInterval(t);
  }, [load]);
  return (
    <div className="pmo-bell" ref={root}>
      <button className="icon-button" aria-label={`Notifikasi${data?.unread ? `, ${data.unread} belum dibaca` : ""}`} aria-expanded={open} onClick={() => { if (!open) load(); setOpen(!open); }}>
        <Bell size={18} />
        {!!data?.unread && <span className="pmo-bell-count">{data.unread > 99 ? "99+" : data.unread}</span>}
      </button>
      {open && (
        <div className="pmo-bell-menu" role="dialog" aria-label="Notifikasi">
          <div className="pmo-bell-head">
            <strong>Notifikasi</strong>
            {!!data?.unread && (
              <button className="text-button" onClick={async () => { await api("/notifications/read-all", { method: "POST" }).catch(() => {}); load(); }}>
                Tandai semua dibaca
              </button>
            )}
          </div>
          {!data?.notifications.length ? (
            <p className="pmo-empty">Belum ada notifikasi.</p>
          ) : (
            <ul>
              {data.notifications.map((n) => (
                <li
                  key={n.id}
                  className={`${n.level} ${n.read_at ? "" : "unread"}`}
                  onClick={async () => {
                    if (!n.read_at) {
                      await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
                      load();
                    }
                  }}
                >
                  <strong>{n.title}</strong>
                  {n.body && <span>{n.body}</span>}
                  <small>{new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(n.created_at))}</small>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
