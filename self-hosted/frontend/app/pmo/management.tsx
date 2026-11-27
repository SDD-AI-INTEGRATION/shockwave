"use client";
import { useEffect, useState, type FormEvent } from "react";
import { api, type Project, type User, iso } from "./client";
import { Field, Dialog } from "./ui";
type Person = User & { active: boolean; must_change_password?: boolean };
export function PasswordPanel({
  onDone,
  required = false,
}: {
  onDone: () => void;
  required?: boolean;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) {
      setError("Konfirmasi password berbeda.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: f.get("current"),
          password: f.get("password"),
        }),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="panel pmo-section"
      style={{ maxWidth: 540, margin: "40px auto" }}
    >
      <h1>Ganti password</h1>
      <p>
        {required
          ? "Ganti password sementara sebelum menggunakan workspace."
          : "Semua sesi akan dicabut setelah password diperbarui."}
      </p>
      <form onSubmit={submit}>
        <label>
          Password saat ini
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </label>
        <label>
          Password baru
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <label>
          Konfirmasi password baru
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="primary" disabled={busy}>
          Simpan password dan masuk kembali
        </button>
      </form>
    </section>
  );
}
export function AdminPanel() {
  const [users, setUsers] = useState<Person[]>([]),
    [archives, setArchives] = useState<
      { id: string; name: string; code: string }[]
    >([]),
    [logs, setLogs] = useState<
      { id: string; name: string; action: string; created_at: string }[]
    >([]),
    [edit, setEdit] = useState<(Person & { password: string }) | null>(null),
    [reset, setReset] = useState<Person | null>(null),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [operations, setOperations] = useState<{
      pool: { total: number; waiting: number };
      documents: { status: string; count: number }[];
    } | null>(null);
  async function load() {
    const [u, a, l, o] = await Promise.all([
      api("/admin/users"),
      api("/admin/archives"),
      api("/admin/audit"),
      api("/admin/operations"),
    ]);
    setUsers(u.users);
    setArchives(a.projects);
    setLogs(l.logs);
    setOperations(o);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Administrasi</h1>
          <p>Kelola pengguna, akses, arsip, dan jejak audit.</p>
        </div>
        <button
          className="primary"
          onClick={() =>
            setEdit({
              id: "",
              email: "",
              name: "",
              role: "viewer",
              active: true,
              password: "",
            })
          }
        >
          Pengguna baru
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <section className="panel pmo-section">
        <h2>Status layanan</h2>
        <p>
          Database terhubung · {operations?.pool.total ?? 0} koneksi ·{" "}
          {operations?.pool.waiting ?? 0} permintaan menunggu koneksi.
        </p>
        <div className="pmo-toolbar">
          {operations?.documents.map((d) => (
            <span className="badge" key={d.status}>
              {(
                {
                  queued: "Antrean OCR",
                  processing: "OCR berjalan",
                  needs_review: "Perlu verifikasi",
                  verified: "Terverifikasi",
                  failed: "Gagal",
                } as Record<string, string>
              )[d.status] || d.status}
              : {d.count}
            </span>
          ))}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void run(async () => {})}
          >
            Perbarui status
          </button>
        </div>
      </section>
      <section className="panel pmo-section">
        <h2>Pengguna</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>NAMA / EMAIL</th>
                <th>ROLE</th>
                <th>STATUS</th>
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name}
                    <p>{u.email}</p>
                  </td>
                  <td>{u.role}</td>
                  <td>{u.active ? "Aktif" : "Nonaktif"}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => setEdit({ ...u, password: "" })}
                    >
                      Edit akses
                    </button>
                    <button
                      className="text-button"
                      onClick={() => {
                        setPassword("");
                        setReset(u);
                      }}
                    >
                      Reset password
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel pmo-section">
        <h2>Arsip proyek</h2>
        {archives.map((p) => (
          <div className="pmo-toolbar" key={p.id}>
            <span>
              {p.code} · {p.name}
            </span>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (confirm("Pulihkan proyek ini?"))
                  void run(() =>
                    api(`/admin/archives/${p.id}/restore`, { method: "POST" }),
                  );
              }}
            >
              Pulihkan
            </button>
          </div>
        ))}
        {!archives.length && <p>Belum ada proyek diarsipkan.</p>}
      </section>
      <details className="panel pmo-section">
        <summary>Audit terbaru (200 aktivitas)</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>WAKTU</th>
                <th>PENGGUNA</th>
                <th>AKTIVITAS</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.created_at).toLocaleString("id-ID")}</td>
                  <td>{l.name || "Sistem"}</td>
                  <td>{l.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      {edit && (
        <Dialog
          title={edit.id ? "Edit pengguna" : "Pengguna baru"}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(
                  edit.id ? `/admin/users/${edit.id}` : "/admin/users",
                  {
                    method: edit.id ? "PATCH" : "POST",
                    body: JSON.stringify(edit),
                  },
                );
                setEdit(null);
              });
            }}
          >
            <Field
              label="Nama pengguna"
              value={edit.name}
              required
              onChange={(v) => setEdit({ ...edit, name: v })}
            />
            <Field
              label="Email pengguna"
              type="email"
              value={edit.email}
              required
              onChange={(v) => setEdit({ ...edit, email: v })}
            />
            <Field
              label="Role"
              value={edit.role}
              options={["admin", "pm", "viewer"].map((v) => [v, v])}
              onChange={(v) => setEdit({ ...edit, role: v as User["role"] })}
            />
            <Field
              label="Status pengguna"
              value={String(edit.active)}
              options={[
                ["true", "Aktif"],
                ["false", "Nonaktif"],
              ]}
              onChange={(v) => setEdit({ ...edit, active: v === "true" })}
            />
            {!edit.id && (
              <Field
                label="Password sementara (minimal 12 karakter)"
                type="password"
                value={edit.password}
                required
                onChange={(v) => setEdit({ ...edit, password: v })}
              />
            )}
            <p className="pmo-hint">
              Pengguna baru wajib mengganti password pada login pertama.
              Perubahan akses mencabut seluruh sesi pengguna.
            </p>
            <button className="primary" disabled={busy}>
              Simpan pengguna
            </button>
          </form>
        </Dialog>
      )}
      {reset && (
        <Dialog
          title={`Reset password ${reset.name}`}
          onClose={() => setReset(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api(`/admin/users/${reset.id}/password`, {
                  method: "POST",
                  body: JSON.stringify({ password }),
                });
                setPassword("");
                setReset(null);
              });
            }}
          >
            <Field
              label="Password sementara baru"
              type="password"
              value={password}
              required
              onChange={setPassword}
            />
            <p className="pmo-hint">
              Sampaikan password secara langsung melalui kanal perusahaan yang
              aman. Pengguna wajib menggantinya setelah login.
            </p>
            <button className="primary" disabled={busy}>
              Reset password
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function ProjectManagement({
  projects,
  onUpdated,
  user,
}: {
  projects: Project[];
  onUpdated: () => Promise<void>;
  user: User;
}) {
  const [id, setId] = useState(projects[0]?.id || ""),
    [error, setError] = useState("");
  const project = projects.find((p) => p.id === id) || projects[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Pengaturan proyek</h1>
          <p>
            Ubah master dan anggota proyek. Arsip mempertahankan histori dan
            dokumen.
          </p>
        </div>
        <Field
          label="Proyek yang dikelola"
          value={project?.id || ""}
          options={projects.map((p) => [p.id, p.name])}
          onChange={setId}
        />
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {project ? (
        <ProjectEditor
          key={project.id}
          project={project}
          user={user}
          onUpdated={onUpdated}
          onError={setError}
        />
      ) : (
        <p className="panel pmo-empty">Buat proyek terlebih dahulu.</p>
      )}
    </>
  );
}
function ProjectEditor({
  project: p,
  user,
  onUpdated,
  onError,
}: {
  project: Project;
  user: User;
  onUpdated: () => Promise<void>;
  onError: (s: string) => void;
}) {
  const canManage = user.role === "admin" || user.id === p.manager_id;
  const [data, setData] = useState({
      code: p.code,
      name: p.name,
      customer: p.customer,
      description: p.description,
      status: p.status,
      start_date: iso(p.start_date),
      end_date: iso(p.end_date),
      manager_id: (p as Project & { manager_id: string }).manager_id,
    }),
    [options, setOptions] = useState<Person[]>([]),
    [members, setMembers] = useState<Person[]>([]),
    [member, setMember] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const m = await api(`/projects/${p.id}/members`);
    setMembers(m.members);
    try {
      setOptions((await api(`/projects/${p.id}/member-options`)).users);
    } catch {
      /* Viewers can still inspect current membership. */
    }
  }
  useEffect(() => {
    load().catch((e) => onError(e.message));
  }, [p.id]);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    onError("");
    try {
      await fn();
      await load();
      await onUpdated();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <section className="panel pmo-section">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() =>
              api(`/projects/${p.id}`, {
                method: "PATCH",
                body: JSON.stringify(data),
              }),
            );
          }}
        >
          <div className="pmo-form-grid">
            {(
              [
                ["code", "Kode proyek"],
                ["name", "Nama proyek"],
                ["customer", "Pelanggan"],
                ["start_date", "Mulai proyek"],
                ["end_date", "Selesai proyek"],
              ] as const
            ).map(([k, l]) => (
              <Field
                key={k}
                label={l}
                value={data[k]}
                required
                disabled={!canManage}
                type={k.endsWith("date") ? "date" : "text"}
                onChange={(v) => setData({ ...data, [k]: v })}
              />
            ))}
            <Field
              label="Status proyek"
              value={data.status}
              disabled={!canManage}
              options={["planning", "active", "at_risk", "completed"].map(
                (v) => [v, v],
              )}
              onChange={(v) =>
                setData({ ...data, status: v as Project["status"] })
              }
            />
            {user.role === "admin" && (
              <Field
                label="Manager proyek"
                value={data.manager_id}
                options={options
                  .filter((u) => u.role !== "viewer")
                  .map((u) => [u.id, u.name])}
                onChange={(v) => setData({ ...data, manager_id: v })}
              />
            )}
          </div>
          <Field
            label="Deskripsi proyek"
            type="textarea"
            disabled={!canManage}
            value={data.description}
            onChange={(v) => setData({ ...data, description: v })}
          />
          {canManage && (
            <div className="pmo-actions">
              <button className="primary" disabled={busy}>
                Simpan master proyek
              </button>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Arsipkan proyek beserta akses operasionalnya? Data tetap dipertahankan dan dapat dipulihkan admin.",
                    )
                  )
                    void run(() =>
                      api(`/projects/${p.id}`, { method: "DELETE" }),
                    );
                }}
              >
                Arsipkan proyek
              </button>
            </div>
          )}
        </form>
      </section>
      <section className="panel pmo-section">
        <h2>Anggota proyek</h2>
        {members.map((m) => (
          <div className="pmo-toolbar" key={m.id}>
            <span>
              {m.name} · {m.role}
            </span>
            {canManage && (
              <button
                className="text-button"
                onClick={() =>
                  void run(() =>
                    api(`/projects/${p.id}/members/${m.id}`, {
                      method: "DELETE",
                    }),
                  )
                }
              >
                Hapus anggota
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <div className="pmo-toolbar">
            <Field
              label="Tambah anggota"
              value={member}
              options={[
                ["", "Pilih pengguna"],
                ...options.map(
                  (u) => [u.id, `${u.name} · ${u.role}`] as [string, string],
                ),
              ]}
              onChange={setMember}
            />
            <button
              className="primary"
              disabled={!member || busy}
              onClick={() =>
                void run(() =>
                  api(`/projects/${p.id}/members`, {
                    method: "POST",
                    body: JSON.stringify({ user_id: member }),
                  }),
                )
              }
            >
              Tambahkan anggota
            </button>
          </div>
        )}
      </section>
    </>
  );
}
