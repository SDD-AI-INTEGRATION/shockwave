"use client";
import { useEffect, useState, type FormEvent } from "react";
import { PmoSuite, PortfolioTools, pmoPages } from "./pmo/suite";
import { SDD_LOGO } from "./pmo/logo";
import { api, money, type Project, type User } from "./pmo/client";
import { AdminPanel, ProjectManagement, PasswordPanel } from "./pmo/management";
import { ActionItemsPage, ApprovalsPage } from "./pmo/governance";
import { PortfolioHealthPage, WarningsPanel, WorkloadPage } from "./pmo/insights";
import { AssistantPage, KnowledgePage, NotificationBell } from "./pmo/assistant-page";
import {
  Activity,
  Archive,
  BookOpen,
  Bot,
  Gauge,
  GitPullRequestArrow,
  ListChecks,
  Stamp,
  UsersRound,
  Wallet,
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  CalendarRange,
  ChartGantt,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Eye,
  EyeOff,
  FileChartColumn,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  ListTree,
  LockKeyhole,
  LogOut,
  Menu,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Presentation,
  ScanText,
  Search,
  Settings2,
  ShieldCheck,
  TrendingUp,
  TriangleAlert,
  UserCheck,
  UserCog,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";

type ActivityEvent = {
  id: string;
  action: string;
  created_at: string;
  name: string;
};
const statuses: Record<Project["status"], string> = {
  planning: "Perencanaan",
  active: "Berjalan",
  at_risk: "Perlu perhatian",
  completed: "Selesai",
};
const activityLabels: Record<string, string> = {
  "auth.login": "Masuk ke workspace",
  "project.created": "Membuat proyek baru",
  "project.progress_updated": "Memperbarui progres proyek",
  "project.metadata_updated": "Memperbarui pilar dan pendapatan proyek",
  "module.operations.saved": "Memperbarui WBS, jadwal, dan laporan",
  "module.risks.saved": "Memperbarui register risiko",
  "module.assignments.saved": "Menyimpan surat penunjukan PM",
  "module.mom.saved": "Menyimpan notulen rapat",
  "meeting.created": "Membuat rapat korporat",
  "meeting.updated": "Memperbarui informasi rapat",
  "meeting.reviewed": "Mereview proyek dalam rapat",
  "meeting.finalized": "Memfinalisasi rapat",
  "meeting.deleted": "Menghapus draf rapat",
  "approval.approved": "Menyetujui permintaan",
  "approval.rejected": "Menolak permintaan",
  "approval.cancelled": "Membatalkan permintaan persetujuan",
  "approval.requested.baseline": "Mengajukan persetujuan baseline",
  "approval.requested.weekly_report": "Mengajukan persetujuan laporan mingguan",
  "approval.requested.document": "Mengajukan persetujuan dokumen",
  "approval.requested.change_request": "Mengajukan change request",
  "approval.requested.closure": "Mengajukan penutupan proyek",
  "change_request.created": "Membuat change request",
  "change_request.applied": "Menerapkan change request",
  "action_item.created": "Membuat tindak lanjut",
  "action_item.done": "Menyelesaikan tindak lanjut",
  "action_item.in_progress": "Memperbarui tindak lanjut",
  "billing.created": "Menambah termin penagihan",
  "billing.updated": "Memperbarui termin/invoice/pembayaran",
  "project.contract_updated": "Memperbarui kontrak proyek",
  "document.applied_to_finance": "Menerapkan dokumen ke keuangan proyek",
  "closure.saved": "Memperbarui checklist penutupan",
  "project.closed": "Menutup proyek",
  "assistant.asked": "Bertanya ke Asisten PMO",
};
type NavItem = { name: string; icon: LucideIcon; adminOnly?: boolean };
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Ringkasan",
    items: [
      { name: "Dashboard", icon: LayoutDashboard },
      { name: "Proyek", icon: FolderKanban },
      { name: "Timeline", icon: CalendarRange },
    ],
  },
  {
    label: "Insight",
    items: [
      { name: "Portfolio Health", icon: Gauge },
      { name: "Kapasitas Resource", icon: UsersRound },
      { name: "Asisten PMO", icon: Bot },
      { name: "Knowledge Base", icon: BookOpen },
    ],
  },
  {
    label: "Governance",
    items: [
      { name: "Persetujuan", icon: Stamp },
      { name: "Corporate Meeting", icon: Presentation },
      { name: "Action Items", icon: ListChecks },
      { name: "PM Assignment", icon: UserCheck },
      { name: "Risk Register", icon: TriangleAlert },
      { name: "MOM", icon: NotebookPen },
      { name: "Change Request", icon: GitPullRequestArrow },
    ],
  },
  {
    label: "Operasional",
    items: [
      { name: "WBS", icon: ListTree },
      { name: "Timeline WBS", icon: ChartGantt },
      { name: "Laporan", icon: FileChartColumn },
      { name: "Keuangan & Termin", icon: Wallet },
      { name: "Dokumen & OCR", icon: ScanText },
      { name: "Penutupan Proyek", icon: Archive },
    ],
  },
  {
    label: "Pengaturan",
    items: [
      { name: "Pengaturan proyek", icon: Settings2 },
      { name: "Password", icon: KeyRound },
      { name: "Administrasi", icon: UserCog, adminOnly: true },
    ],
  },
];
const date = (v: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(v));
function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? "light" : ""}`}>
      <span className="brand-icon">
        <Waves size={25} />
      </span>
      <div>
        shockwave<span>PROJECT MANAGEMENT OFFICE</span>
      </div>
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [initialError, setInitialError] = useState("");
  useEffect(() => {
    api("/auth/me")
      .then((v) => setUser(v.user))
      .catch((e) => {
        if (e.status !== 401)
          setInitialError(
            "Backend belum terhubung. Pastikan layanan API dan PostgreSQL berjalan.",
          );
      })
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <div className="loading">
        <Brand />
        <span className="spinner" />
        Menyiapkan workspace…
      </div>
    );
  if(user?.must_change_password)return <PasswordPanel required onDone={()=>setUser(null)}/>;
  return user ? (
    <Workspace user={user} onLogout={() => setUser(null)} />
  ) : (
    <Login onLogin={setUser} initialError={initialError} />
  );
}
function Login({
  onLogin,
  initialError,
}: {
  onLogin: (u: User) => void;
  initialError: string;
}) {
  const [show, setShow] = useState(false),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
        }),
      });
      onLogin(data.user);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand light />
        <div className="story-main">
          <div className="eyebrow">
            <span className="live-dot" /> ONE WORKSPACE. EVERY PROJECT.
          </div>
          <h1>
            Proyek terarah.
            <br />
            Tim selaras.
            <br />
            <span>Hasil berdampak.</span>
          </h1>
          <p>
            Satukan rencana, pantau setiap progres, dan wujudkan keberhasilan
            proyek bersama.
          </p>
          <div className="story-preview">
            <div className="preview-top">
              <span>
                <span className="live-dot" /> PORTFOLIO OVERVIEW
              </span>
              <TrendingUp size={18} />
            </div>
            <div className="preview-bars">
              {[32, 46, 40, 62, 55, 74, 68, 88, 79, 96, 89, 100].map((v, i) => (
                <i key={i} style={{ height: `${v}%` }} />
              ))}
            </div>
            <div className="preview-bottom">
              <span>Dari rencana menuju realisasi</span>
              <ArrowUpRight size={18} />
            </div>
          </div>
          <div className="story-points">
            <span>
              <Check size={15} /> Monitoring terpusat
            </span>
            <span>
              <Check size={15} /> Kolaborasi terarah
            </span>
          </div>
        </div>
        <footer>
          PT Swadharma Duta Data <span>Internal workspace</span>
        </footer>
      </section>
      <section className="login-form-side">
        <span className="login-top">
          <img src={SDD_LOGO} alt="SDD Make IT real" className="company-logo" />
          <ShieldCheck size={15} /> Akses internal perusahaan
        </span>
        <div className="login-form-wrap">
          <div className="welcome-icon">
            <LockKeyhole size={24} />
          </div>
          <div className="eyebrow blue">SELAMAT DATANG KEMBALI</div>
          <h2>Masuk ke workspace</h2>
          <p>Kelola proyek dan langkah berikutnya, dari sini.</p>
          <form onSubmit={submit}>
            <label htmlFor="email">Email perusahaan</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="nama@perusahaan.co.id"
              autoComplete="username"
              maxLength={254}
              required
            />
            <div className="label-row">
              <label htmlFor="password">Password</label>
              <span className="field-hint">Akun dikelola administrator</span>
            </div>
            <div className="password-field">
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                placeholder="Masukkan password Anda"
                autoComplete="current-password"
                maxLength={128}
                required
              />
              <button
                type="button"
                aria-label={
                  show ? "Sembunyikan password" : "Tampilkan password"
                }
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                <TriangleAlert size={16} />
                {error}
              </div>
            )}
            <button className="primary login-submit" disabled={busy}>
              {busy ? "Memverifikasi…" : "Masuk ke workspace"}
              {busy ? <span className="spinner" /> : <ArrowRight size={18} />}
            </button>
          </form>
          <div className="login-security">
            <ShieldCheck size={17} />
            <span>Sesi aman. Akses sesuai peran Anda.</span>
          </div>
          <div className="help-box">
            <CircleHelp size={19} />
            <div>
              <strong>Belum memiliki akses?</strong>
              <span>
                Hubungi administrator PMO untuk pembuatan akun
                <br />
                atau bantuan pemulihan password.
              </span>
            </div>
          </div>
        </div>
        <footer>
          SHOCKWAVE <span>Project Management Office</span>
        </footer>
      </section>
    </main>
  );
}
function Workspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("shockwave.sidebar.collapsed") === "1");
    } catch {}
  }, []);
  function toggleSidebar() {
    setCollapsed((v) => {
      try {
        localStorage.setItem("shockwave.sidebar.collapsed", v ? "0" : "1");
      } catch {}
      return !v;
    });
  }
  const [page, setPage] = useState("Dashboard"),
    [projects, setProjects] = useState<Project[]>([]),
    [activity, setActivity] = useState<ActivityEvent[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [modal, setModal] = useState(false),
    [selected, setSelected] = useState<Project | null>(null),
    [menu, setMenu] = useState(false);
  async function load() {
    setError("");
    try {
      const [p, a] = await Promise.all([api("/projects"), api("/activity")]);
      setProjects(p.projects);
      setActivity(a.activity);
    } catch (e) {
      if ((e as { status: number }).status === 401) onLogout();
      else setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [moduleDirty, setModuleDirty] = useState(false),
    [pillar, setPillar] = useState(""),
    [revenueOnly, setRevenueOnly] = useState(false);
  function navigate(name: string) {
    if (
      moduleDirty &&
      !confirm("Tinggalkan perubahan modul yang belum disimpan?")
    )
      return;
    setPage(name);
    setMenu(false);
    setModuleDirty(false);
  }
  const active = projects.filter((p) => p.status === "active").length,
    risk = projects.filter((p) => p.status === "at_risk").length,
    done = projects.filter((p) => p.status === "completed").length;
  const average = projects.length
    ? Math.round(projects.reduce((a, p) => a + p.progress, 0) / projects.length)
    : 0;
  const filtered = projects.filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      (!pillar || p.pillar === pillar) &&
      (!revenueOnly || Number(p.revenue_actual) > 0) &&
      `${p.name} ${p.code} ${p.customer} ${p.pillar || ""} ${p.sub_pillar || ""} ${p.manager_name}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
      onLogout();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className={`app-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="sidebar-head">
          <Brand />
          <button
            className="sidebar-close"
            aria-label="Tutup navigasi"
            onClick={() => setMenu(false)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className="workspace-avatar">
            <img src={SDD_LOGO} alt="SDD" className="workspace-logo" />
          </span>
          <div>
            <strong>Swadharma Duta Data</strong>
            <span>Company workspace</span>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Navigasi utama">
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items
                .filter((item) => !item.adminOnly || user.role === "admin")
                .map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    title={name}
                    aria-label={name}
                    aria-current={page === name ? "page" : undefined}
                    className={page === name ? "selected" : ""}
                    onClick={() => navigate(name)}
                  >
                    <Icon size={18} />
                    <span className="nav-text">{name}</span>
                    {name === "Proyek" && (
                      <span className="nav-count">{projects.length}</span>
                    )}
                  </button>
                ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-collapse"
            title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            onClick={toggleSidebar}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            <span>Ciutkan sidebar</span>
          </button>
          <div className="account">
            <span className="avatar">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <strong>{user.name}</strong>
              <span>
                {user.role === "admin"
                  ? "Administrator"
                  : user.role === "pm"
                    ? "Project Manager"
                    : "Viewer"}
              </span>
            </div>
            <button title="Keluar" aria-label="Keluar" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="mobile-scrim"
          aria-label="Tutup navigasi"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu"
              aria-label="Buka navigasi"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="internal-badge">
              <span className="live-dot" /> Internal workspace
            </span>
            <NotificationBell />
            <span className="divider" />
            <span className="avatar small">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <main className="workspace-main">
          {page === "Portfolio Health" ? (
            <PortfolioHealthPage user={user} />
          ) : page === "Kapasitas Resource" ? (
            <WorkloadPage user={user} />
          ) : page === "Asisten PMO" ? (
            <AssistantPage projects={projects} />
          ) : page === "Knowledge Base" ? (
            <KnowledgePage />
          ) : page === "Persetujuan" ? (
            <ApprovalsPage user={user} />
          ) : page === "Action Items" ? (
            <ActionItemsPage projects={projects} user={user} />
          ) : page==="Administrasi"&&user.role==="admin"?<AdminPanel/>:page==="Password"?<PasswordPanel onDone={onLogout}/>:page==="Pengaturan proyek"?<ProjectManagement projects={projects} user={user} onUpdated={load}/>:pmoPages.includes(page) ? (
            <PmoSuite
              page={page}
              projects={projects}
              user={user}
              onUpdated={load}
              onDirty={setModuleDirty}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow blue">PROJECT MANAGEMENT OFFICE</div>
                  <h1>
                    {page === "Dashboard"
                      ? "Setiap proyek, dalam kendali."
                      : page === "Proyek"
                        ? "Portofolio proyek"
                        : "Timeline proyek"}
                  </h1>
                  <p>
                    {page === "Dashboard"
                      ? `Halo, ${user.name.split(" ")[0]}. Berikut ringkasan perjalanan proyek Anda.`
                      : page === "Proyek"
                        ? "Satu tempat untuk rencana, progres, dan kolaborasi proyek."
                        : "Pantau rentang waktu dan jadwal penyelesaian setiap proyek."}
                  </p>
                </div>
                {user.role !== "viewer" && (
                  <button className="primary" onClick={() => setModal(true)}>
                    <Plus size={17} /> Proyek baru
                  </button>
                )}
              </div>
              {error && (
                <div className="error" role="alert">
                  {error}
                  <button onClick={load}>Coba lagi</button>
                </div>
              )}
              {page === "Dashboard" && (
                <>
                  <section className="hero-panel">
                    <div>
                      <div className="eyebrow">
                        <span className="live-dot" /> PORTFOLIO PULSE
                      </div>
                      <h2>
                        Rencana yang jelas.
                        <br />
                        Eksekusi yang terukur.
                      </h2>
                      <p>
                        Pantau progres, temukan prioritas, dan terus bergerak
                        maju.
                      </p>
                      <button onClick={() => setPage("Proyek")}>
                        Jelajahi portofolio <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="hero-metric">
                      <div
                        className="progress-ring"
                        style={{
                          background: `conic-gradient(#78AAFF ${average * 3.6}deg,rgba(255,255,255,.12) 0)`,
                        }}
                      >
                        <div>
                          <strong>
                            {average}
                            <span>%</span>
                          </strong>
                          <small>Rata-rata progres</small>
                        </div>
                      </div>
                      <span>{projects.length} proyek dalam workspace</span>
                    </div>
                    <span className="hero-orbit orbit-one" />
                    <span className="hero-orbit orbit-two" />
                  </section>
                  <section className="stats-grid">
                    {[
                      {
                        label: "Total proyek",
                        value: projects.length,
                        icon: BriefcaseBusiness,
                        note: "Seluruh portofolio",
                        tone: "blue",
                      },
                      {
                        label: "Sedang berjalan",
                        value: active,
                        icon: Activity,
                        note: "Dalam tahap eksekusi",
                        tone: "green",
                      },
                      {
                        label: "Perlu perhatian",
                        value: risk,
                        icon: TriangleAlert,
                        note: "Prioritaskan tindak lanjut",
                        tone: "amber",
                      },
                      {
                        label: "Proyek selesai",
                        value: done,
                        icon: Check,
                        note: "Pencapaian bersama",
                        tone: "violet",
                      },
                    ].map(({ label, value, icon: Icon, note, tone }) => (
                      <article className="stat" key={label}>
                        <div>
                          <span>{label}</span>
                          <span className={`stat-icon ${tone}`}>
                            <Icon size={18} />
                          </span>
                        </div>
                        <strong>
                          {busy ? "—" : String(value).padStart(2, "0")}
                        </strong>
                        <small>{note}</small>
                      </article>
                    ))}
                  </section>
                  <WarningsPanel />
                </>
              )}
              {page === "Proyek" && (
                <PortfolioTools
                  projects={projects}
                  filtered={filtered}
                  user={user}
                  pillar={pillar}
                  onPillar={setPillar}
                  revenueOnly={revenueOnly}
                  onRevenueOnly={setRevenueOnly}
                  onUpdated={load}
                />
              )}
              <div className={page === "Dashboard" ? "content-grid" : ""}>
                <section className="panel project-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>
                        {page === "Timeline" ? "Jadwal proyek" : "Proyek Anda"}
                        <span className="count-pill">{projects.length}</span>
                      </h2>
                      <p>
                        {page === "Timeline"
                          ? "Rentang pelaksanaan berdasarkan tanggal rencana."
                          : "Perkembangan terbaru di seluruh portofolio."}
                      </p>
                    </div>
                    {page === "Dashboard" && (
                      <button
                        className="text-button"
                        onClick={() => setPage("Proyek")}
                      >
                        Lihat semua <ArrowUpRight size={15} />
                      </button>
                    )}
                  </div>
                  <div className="table-toolbar">
                    <div className="filter-tabs">
                      {[
                        { value: "all", label: "Semua proyek" },
                        { value: "active", label: "Berjalan" },
                        { value: "at_risk", label: "Perhatian" },
                      ].map((f) => (
                        <button
                          key={f.value}
                          className={filter === f.value ? "active" : ""}
                          onClick={() => setFilter(f.value)}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <div className="search">
                      <Search size={16} />
                      <input
                        aria-label="Cari proyek"
                        placeholder="Cari proyek…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                  </div>
                  {busy ? (
                    <div className="empty">
                      <span className="spinner" />
                      Memuat proyek…
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="empty">
                      <span className="empty-icon">
                        <FolderKanban size={29} />
                      </span>
                      <h3>
                        {projects.length
                          ? "Tidak ada proyek yang sesuai"
                          : "Proyek besar dimulai dari satu langkah."}
                      </h3>
                      <p>
                        {projects.length
                          ? "Coba kata kunci atau filter lainnya."
                          : "Buat proyek pertama untuk mulai memantau progres tim."}
                      </p>
                      {!projects.length && user.role !== "viewer" && (
                        <button
                          className="primary"
                          onClick={() => setModal(true)}
                        >
                          <Plus size={16} /> Buat proyek pertama
                        </button>
                      )}
                    </div>
                  ) : page === "Timeline" ? (
                    <div className="timeline-list">
                      {filtered.map((p) => (
                        <button key={p.id} onClick={() => setSelected(p)}>
                          <div>
                            <strong>{p.name}</strong>
                            <span className={`status ${p.status}`}>
                              {statuses[p.status]}
                            </span>
                          </div>
                          <p>
                            <CalendarDays size={14} />
                            {date(p.start_date)}
                            <ArrowRight size={14} />
                            {date(p.end_date)}
                          </p>
                          <div className="progress-track">
                            <i style={{ width: `${p.progress}%` }} />
                          </div>
                          <small>{p.progress}% terealisasi</small>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>NAMA PROYEK</th>
                            {page === "Proyek" && (
                              <>
                                <th>PILAR / SUB PILAR</th>
                                <th>PM</th>
                                <th>PENDAPATAN</th>
                              </>
                            )}
                            <th>STATUS</th>
                            <th>PROGRES</th>
                            <th>TARGET SELESAI</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {filtered
                            .slice(0, page === "Dashboard" ? 5 : undefined)
                            .map((p) => (
                              <tr key={p.id}>
                                <td>
                                  <button
                                    className="project-name"
                                    onClick={() => setSelected(p)}
                                  >
                                    <span className="project-avatar">
                                      {p.name.slice(0, 2).toUpperCase()}
                                    </span>
                                    <span>
                                      <strong>{p.name}</strong>
                                      <small>
                                        {p.code} · {p.customer}
                                      </small>
                                    </span>
                                  </button>
                                </td>
                                {page === "Proyek" && (
                                  <>
                                    <td>
                                      {p.pillar || "—"}
                                      <p>{p.sub_pillar}</p>
                                    </td>
                                    <td>{p.manager_name}</td>
                                    <td>
                                      {money(p.revenue_actual)}
                                      <p>
                                        Prognosa {money(p.revenue_forecast)}
                                      </p>
                                    </td>
                                  </>
                                )}
                                <td>
                                  <span className={`status ${p.status}`}>
                                    <i />
                                    {statuses[p.status]}
                                  </span>
                                </td>
                                <td>
                                  <div className="table-progress">
                                    <span>{p.progress}%</span>
                                    <div className="progress-track">
                                      <i style={{ width: `${p.progress}%` }} />
                                    </div>
                                  </div>
                                </td>
                                <td className="date-cell">
                                  {date(p.end_date)}
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={`Detail ${p.name}`}
                                    onClick={() => setSelected(p)}
                                  >
                                    <ChevronRight size={17} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="panel-footer">
                    <span>
                      <ShieldCheck size={13} /> Sesuai akses proyek Anda
                    </span>
                    <span>{filtered.length} proyek</span>
                  </div>
                </section>
                {page === "Dashboard" && (
                  <aside className="panel activity-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>Aktivitas terbaru</h2>
                        <p>Langkah kecil, progres nyata.</p>
                      </div>
                      <Clock3 size={18} />
                    </div>
                    <div className="activity-list">
                      {activity.length ? (
                        activity.slice(0, 5).map((a) => (
                          <div className="activity-item" key={a.id}>
                            <span>
                              <Activity size={15} />
                            </span>
                            <div>
                              <strong>{a.name}</strong>
                              <p>
                                {activityLabels[a.action] ||
                                  "Memperbarui workspace"}
                              </p>
                              <small>
                                {new Intl.DateTimeFormat("id-ID", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }).format(new Date(a.created_at))}
                              </small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="activity-empty">
                          Aktivitas workspace akan muncul di sini.
                        </p>
                      )}
                    </div>
                    <div className="activity-note">
                      <TrendingUp size={18} />
                      <p>
                        Update progres secara berkala membantu tim mengambil
                        keputusan lebih cepat.
                      </p>
                    </div>
                  </aside>
                )}
              </div>
            </>
          )}
          <footer className="app-footer">
            <span>© {new Date().getFullYear()} PT Swadharma Duta Data</span>
            <span>
              <span className="live-dot" /> Shockwave · PMO
            </span>
          </footer>
        </main>
      </div>
      {modal && (
        <ProjectModal
          onClose={() => setModal(false)}
          onSave={async () => {
            setModal(false);
            await load();
          }}
        />
      )}
      {selected && (
        <ProjectDetail
          project={selected}
          user={user}
          onClose={() => setSelected(null)}
          onSave={async () => {
            setSelected(null);
            await load();
          }}
        />
      )}
    </div>
  );
}
function useDialog(onClose: () => void) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    dialog?.querySelector<HTMLElement>("input,button")?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select,textarea",
        ),
      );
      if (e.shiftKey && document.activeElement === items[0]) {
        e.preventDefault();
        items.at(-1)?.focus();
      } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
        e.preventDefault();
        items[0]?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
function ProjectModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  useDialog(onClose);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/projects", {
        method: "POST",
        body: JSON.stringify({ ...data, progress: 0 }),
      });
      await onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow blue">MULAI LANGKAH BARU</div>
            <h2 id="modal-title">Buat proyek</h2>
          </div>
          <button aria-label="Tutup" className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="p-name">Nama proyek</label>
          <input
            autoFocus
            id="p-name"
            name="name"
            required
            minLength={3}
            maxLength={150}
            placeholder="Contoh: Implementasi Core Banking"
          />
          <div className="form-grid">
            <div>
              <label htmlFor="p-code">Kode proyek</label>
              <input
                id="p-code"
                name="code"
                required
                minLength={2}
                maxLength={30}
                pattern="[A-Za-z0-9_-]+"
                placeholder="PRJ-2026-001"
              />
            </div>
            <div>
              <label htmlFor="p-customer">Pelanggan</label>
              <input
                id="p-customer"
                name="customer"
                required
                minLength={2}
                maxLength={150}
                placeholder="Nama pelanggan"
              />
            </div>
          </div>
          <div className="form-grid">
            <div>
              <label htmlFor="p-start">Tanggal mulai</label>
              <input id="p-start" type="date" name="start_date" required />
            </div>
            <div>
              <label htmlFor="p-end">Target selesai</label>
              <input id="p-end" type="date" name="end_date" required />
            </div>
          </div>
          <label htmlFor="p-status">Status proyek</label>
          <select id="p-status" name="status">
            {Object.entries(statuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label htmlFor="p-desc">
            Deskripsi <small>(opsional)</small>
          </label>
          <textarea
            id="p-desc"
            name="description"
            maxLength={2000}
            rows={3}
            placeholder="Tujuan dan ruang lingkup proyek…"
          />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <div className="modal-actions">
            <button type="button" className="secondary" onClick={onClose}>
              Batal
            </button>
            <button className="primary" disabled={busy}>
              {busy ? "Menyimpan…" : "Buat proyek"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
function ProjectDetail({
  project: p,
  user,
  onClose,
  onSave,
}: {
  project: Project;
  user: User;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  useDialog(onClose);
  const [progress, setProgress] = useState(p.progress),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/projects/${p.id}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ progress }),
      });
      await onSave();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-title"
      >
        <div className="modal-header">
          <div>
            <div className="eyebrow blue">{p.code}</div>
            <h2 id="detail-title">{p.name}</h2>
          </div>
          <button className="icon-button" aria-label="Tutup" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <span className={`status ${p.status}`}>{statuses[p.status]}</span>
        <p className="detail-description">
          {p.description || "Belum ada deskripsi proyek."}
        </p>
        <dl className="detail-grid">
          <div>
            <dt>Pelanggan</dt>
            <dd>{p.customer}</dd>
          </div>
          <div>
            <dt>Project manager</dt>
            <dd>{p.manager_name}</dd>
          </div>
          <div>
            <dt>Tanggal mulai</dt>
            <dd>{date(p.start_date)}</dd>
          </div>
          <div>
            <dt>Target selesai</dt>
            <dd>{date(p.end_date)}</dd>
          </div>
        </dl>
        <form onSubmit={save}>
          <label htmlFor="progress">
            Progres realisasi <strong>{progress}%</strong>
          </label>
          <input
            id="progress"
            type="range"
            min={0}
            max={100}
            value={progress}
            disabled={user.role === "viewer"}
            onChange={(e) => setProgress(Number(e.target.value))}
          />
          <p className="field-hint">
            Setiap perubahan disimpan dalam histori progres dan audit.
          </p>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {user.role !== "viewer" && (
            <div className="modal-actions">
              <button
                className="primary"
                disabled={busy || progress === p.progress}
              >
                {busy ? "Menyimpan…" : "Simpan progres"}
                <Check size={16} />
              </button>
            </div>
          )}
        </form>
      </section>
    </div>
  );
}
