"use client";
import { useEffect, useState, useRef } from "react";
import { api, type User, type Project, labelDate } from "./client";
import { Field } from "./ui";
import { RequestApproval } from "./governance";
type Doc = {
  id: string;
  name: string;
  status: string;
  category: string;
  version_number: number;
  size_bytes: number;
  created_at: string;
  root_id: string | null;
  error: string;
  revision: number;
  mime_type: string;
  verified_fields: Record<string, string> | null;
  extracted_data: {
    fields?: Record<
      string,
      { value: string; page: number; box: unknown; confidence: number | null }
    >;
    pages?: unknown[];
    lines?: { text: string; page: number; confidence: number | null }[];
  } | null;
};
const categories: [string, string][] = [
  ["spk", "SPK (Surat Perintah Kerja)"],
  ["pks", "PKS / kontrak"],
  ["bast", "BAST"],
  ["invoice", "Invoice / tagihan"],
  ["mom", "MOM"],
  ["assignment", "Surat tugas / penunjukan"],
  ["report", "Laporan"],
  ["other", "Lainnya"],
];
const status: Record<string, string> = {
  queued: "Menunggu OCR",
  processing: "Sedang diproses",
  needs_review: "Perlu verifikasi",
  verified: "Terverifikasi",
  failed: "Gagal",
};
export function DocumentCenter({
  project,
  user,
}: {
  project: Project;
  user: User;
}) {
  const [docs, setDocs] = useState<Doc[]>([]),
    [selected, setSelected] = useState<Doc | null>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [category, setCategory] = useState("other"),
    [fields, setFields] = useState<Record<string, string>>({}),
    [note, setNote] = useState(""),
    [newField, setNewField] = useState(""),
    [apply, setApply] = useState({ contract: false, milestones: false, milestone_id: "" }),
    [milestones, setMilestones] = useState<{ id: string; name: string; bast_document_id: string | null; invoice_date: string | null }[]>([]),
    [applied, setApplied] = useState("");
  useEffect(() => {
    if (selected?.status === "needs_review")
      api(`/projects/${project.id}/finance`).then((r) => setMilestones(r.milestones)).catch(() => setMilestones([]));
    setApply({ contract: false, milestones: false, milestone_id: "" });
  }, [selected?.id, selected?.status, project.id]);
  useEffect(() => {
    setApply({ contract: false, milestones: false, milestone_id: "" });
  }, [category]);
  const hasTerms = Object.keys(fields).some((k) => /^termin_\d+$/.test(k));
  const contractDocument = ["spk", "pks"].includes(category);
  const canManageContract = user.role === "admin" || project.manager_id === user.id;
  const versionRoot = useRef<string | null>(null),
    file = useRef<HTMLInputElement>(null);
  async function load() {
    const result = await api(
      `/projects/${project.id}/documents?q=${encodeURIComponent(query)}`,
    );
    setDocs(result.documents);
  }
  useEffect(() => {
    let active = true;
    const reload = () =>
      load().catch((e) => {
        if (active) setError(e.message);
      });
    void reload();
    const timer = setInterval(reload, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [project.id, query]);
  async function open(id: string) {
    try {
      const d: Doc = await api(`/documents/${id}`);
      setSelected(d);
      setCategory(d.category);
      setFields(
        d.verified_fields ||
          Object.fromEntries(
            Object.entries(d.extracted_data?.fields || {}).map(([k, v]) => [
              k,
              v.value,
            ]),
          ),
      );
      setNote("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload(f: File) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/projects/${project.id}/documents${versionRoot.current ? `?root_id=${versionRoot.current}` : ""}`,
        {
          method: "POST",
          headers: {
            "Content-Type": f.type,
            "X-File-Name": encodeURIComponent(f.name),
          },
          body: f,
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Upload gagal.");
      await load();
      await open(data.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      versionRoot.current = null;
    }
  }
  const mutate = async (path: string, method = "POST", body?: unknown) => {
    setBusy(true);
    try {
      await api(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      await load();
      if (selected) await open(selected.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="panel pmo-toolbar">
        <Field
          label="Cari nama atau isi dokumen"
          value={query}
          onChange={setQuery}
        />
        {user.role !== "viewer" && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              versionRoot.current = null;
              file.current?.click();
            }}
          >
            Upload dokumen
          </button>
        )}
        <input
          ref={file}
          hidden
          style={{ display: "none" }}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          aria-label="File dokumen"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) {
              if (f.size > 20 * 1024 * 1024) setError("Ukuran maksimal 20 MB.");
              else void upload(f);
            }
          }}
        />
      </div>
      <p className="pmo-hint">
        PDF, PNG, JPEG · Maksimal 20 MB / 50 halaman. OCR menghasilkan kandidat;
        verifikasi manusia diperlukan sebelum data disahkan.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <section className="panel pmo-section">
        <h2>Dokumen proyek</h2>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>NAMA</th>
                <th>JENIS</th>
                <th>VERSI</th>
                <th>STATUS</th>
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <button className="text-button" onClick={() => open(d.id)}>
                      {d.name}
                    </button>
                    <p>
                      {labelDate(d.created_at)} ·{" "}
                      {(Number(d.size_bytes) / 1024).toFixed(1)} KB
                    </p>
                  </td>
                  <td>{d.category}</td>
                  <td>{d.version_number}</td>
                  <td>{status[d.status]}</td>
                  <td>
                    <a
                      className="text-button"
                      href={`/api/documents/${d.id}/file`}
                    >
                      Unduh asli
                    </a>
                    {user.role !== "viewer" && (
                      <button
                        className="text-button"
                        onClick={() => {
                          versionRoot.current = d.id;
                          file.current?.click();
                        }}
                      >
                        Versi baru
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!docs.length && (
          <p className="pmo-empty">Belum ada dokumen yang sesuai.</p>
        )}
      </section>
      {selected && (
        <section className="panel pmo-section">
          <div className="pmo-toolbar">
            <div>
              <h2>
                {selected.name} · v{selected.version_number}
              </h2>
              <p>{status[selected.status]}</p>
            </div>
            <button className="secondary" onClick={() => open(selected.id)}>
              Muat ulang hasil
            </button>
          </div>
          {selected.error && <p className="error">{selected.error}</p>}
          {applied && <p className="pmo-hint" role="status">{applied}</p>}
          {selected.status === "verified" && (
            <div className="pmo-toolbar">
              <span>Persetujuan dokumen{selected.category === "bast" ? " (BAST)" : ""}:</span>
              <RequestApproval
                projectId={project.id}
                kind="document"
                resourceId={selected.id}
                body={{ document_id: selected.id }}
                user={user}
              />
            </div>
          )}
          {selected.status === "failed" && user.role !== "viewer" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => mutate(`/documents/${selected.id}/retry`)}
            >
              Coba OCR ulang
            </button>
          )}
          {["queued", "processing"].includes(selected.status) && (
            <p>
              Dokumen sedang dalam antrean pemrosesan. Daftar diperbarui
              otomatis; pilih Muat ulang hasil setelah status berubah.
            </p>
          )}
          {selected.extracted_data && (
            <>
              <Field
                label="Jenis dokumen"
                value={category}
                onChange={setCategory}
                disabled={
                  selected.status !== "needs_review" || user.role === "viewer"
                }
                options={categories}
              />
              <div className="pmo-document-grid">
                <div>
                  <h3>Field hasil ekstraksi</h3>
                  {Object.entries(fields)
                    .filter(([k]) => !k.startsWith("_"))
                    .map(([key, value]) => (
                      <div key={key}>
                        <Field
                          label={key}
                          value={value}
                          onChange={(v) => setFields({ ...fields, [key]: v })}
                          disabled={
                            selected.status !== "needs_review" ||
                            user.role === "viewer"
                          }
                        />
                        {selected.extracted_data?.fields?.[key] && (
                          <small className="pmo-hint">
                            Sumber halaman{" "}
                            {selected.extracted_data.fields[key].page} ·
                            confidence{" "}
                            {selected.extracted_data.fields[key].confidence ===
                            null
                              ? "tidak tersedia"
                              : Number(
                                  selected.extracted_data.fields[key]
                                    .confidence,
                                ).toFixed(3)}
                          </small>
                        )}
                      </div>
                    ))}
                  {selected.status === "needs_review" &&
                    user.role !== "viewer" && (
                      <>
                        <div className="pmo-toolbar">
                          <Field
                            label="Nama field tambahan"
                            value={newField}
                            onChange={setNewField}
                          />
                          <button
                            className="secondary"
                            disabled={!newField.trim()}
                            onClick={() => {
                              setFields({ ...fields, [newField.trim()]: "" });
                              setNewField("");
                            }}
                          >
                            Tambah field
                          </button>
                        </div>
                        <Field
                          label="Catatan verifikasi"
                          value={note}
                          type="textarea"
                          required
                          onChange={setNote}
                        />
                        <fieldset className="pmo-apply">
                          <legend>Terapkan ke data proyek setelah disahkan (opsional)</legend>
                          {contractDocument && canManageContract && (
                            <label className="pmo-check">
                              <input type="checkbox" checked={apply.contract} onChange={(e) => setApply({ ...apply, contract: e.target.checked })} />
                              Isi nomor & nilai kontrak proyek dari field contract_number / contract_value
                            </label>
                          )}
                          {hasTerms && contractDocument && (
                            <label className="pmo-check">
                              <input type="checkbox" checked={apply.milestones} onChange={(e) => setApply({ ...apply, milestones: e.target.checked })} />
                              Buat termin penagihan dari field termin_N
                            </label>
                          )}
                          {["bast", "invoice"].includes(category) && (
                            <Field
                              label={category === "bast" ? "Tautkan sebagai BAST termin" : "Catat sebagai invoice termin"}
                              value={apply.milestone_id}
                              onChange={(v) => setApply({ ...apply, milestone_id: v })}
                              options={[["", "— Tidak ditautkan —"], ...milestones.map((m) => [m.id, `${m.name}${category === "bast" && m.bast_document_id ? " (sudah ada BAST)" : ""}${category === "invoice" && m.invoice_date ? " (sudah ditagih)" : ""}`] as [string, string])]}
                            />
                          )}
                          {!["spk", "pks", "bast", "invoice"].includes(category) && <p className="pmo-hint">Tidak ada data keuangan yang dapat diterapkan untuk jenis dokumen ini.</p>}
                        </fieldset>
                        <button
                          className="primary"
                          disabled={busy || !note.trim()}
                          onClick={async () => {
                            if (
                              !confirm(
                                "Sahkan hasil setelah membandingkan dengan dokumen asli?",
                              )
                            )
                              return;
                            setBusy(true);
                            setError("");
                            setApplied("");
                            try {
                              const r = await api(`/documents/${selected.id}/verify`, {
                                method: "PUT",
                                body: JSON.stringify({
                                  revision: selected.revision,
                                  category,
                                  fields,
                                  notes: note,
                                  apply: {
                                    contract: contractDocument && canManageContract && apply.contract,
                                    milestones: contractDocument && hasTerms && apply.milestones,
                                    milestone_id: ["bast", "invoice"].includes(category) && apply.milestone_id ? apply.milestone_id : null,
                                  },
                                }),
                              });
                              if (r.applied?.length) setApplied(`Diterapkan ke proyek: ${r.applied.join(", ")}.`);
                              await load();
                              await open(selected.id);
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          Sahkan verifikasi
                        </button>
                      </>
                    )}
                </div>
                <div>
                  <h3>Bukti teks per halaman</h3>
                  <p className="pmo-hint">
                    Bandingkan dengan file asli melalui tombol Unduh asli.
                    Koordinat tersedia dalam hasil JSON.
                  </p>
                  <div style={{ maxHeight: 500, overflow: "auto" }}>
                    {selected.extracted_data.lines?.map((l, i) => (
                      <p
                        key={i}
                        style={{
                          padding: 8,
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <small>Halaman {l.page}</small>
                        <br />
                        {l.text}
                      </p>
                    ))}
                  </div>
                  <a
                    href={`/api/documents/${selected.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Lihat JSON dan koordinat
                  </a>
                </div>
              </div>
            </>
          )}
          {user.role !== "viewer" && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  confirm(
                    "Hapus dokumen dari daftar aktif? File tetap disimpan dalam retensi/backup.",
                  )
                ) {
                  setBusy(true);
                  api(`/documents/${selected.id}`, { method: "DELETE" })
                    .then(() => {
                      setSelected(null);
                      return load();
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }
              }}
            >
              Hapus dari daftar aktif
            </button>
          )}
        </section>
      )}
    </>
  );
}
