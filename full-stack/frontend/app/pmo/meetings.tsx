"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Trash2, LockKeyhole } from "lucide-react";
import { type Review, reviewText } from "../../../backend/src/pmo-models";
import { api, type Project, type User, today, iso, labelDate } from "./client";
import { Field, Dialog, PaperView } from "./ui";
import { ActionsEditor } from "./documents";
import type { Paper } from "./exports";
type Meeting = {
  id: string;
  title: string;
  date: string;
  moderator: string;
  notulis: string;
  participants: string;
  notes: string;
  status: "draft" | "final";
  version: number;
  total: number;
  reviewed: number;
  previous_id: string | null;
};
type Detail = Meeting & {
  projects: {
    project_id: string;
    snapshot: Project;
    previous_notes: string;
    review: Review;
  }[];
};
const emptyReview: Review = {
  review: "pending",
  health: "unrated",
  summary: "",
  items: [],
  actions: [],
};
function nextMonday(date: string) {
  const d = new Date(iso(date) + "T12:00:00");
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function CorporateMeetings({
  projects,
  user,
  onDirty,
}: {
  projects: Project[];
  user: User;
  onDirty: (v: boolean) => void;
}) {
  const [list, setList] = useState<Meeting[]>([]),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [loading, setLoading] = useState(true);
  async function load() {
    try {
      setList((await api("/meetings")).meetings);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  if (selected)
    return (
      <MeetingWorkspace
        id={selected}
        user={user}
        onDirty={onDirty}
        onBack={() => {
          setSelected("");
          onDirty(false);
          void load();
        }}
      />
    );
  const filtered = list.filter((m) =>
    [m.title, m.date, m.moderator, m.notulis, m.status, m.participants]
      .join(" ")
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow blue">CORPORATE</div>
          <h1>Corporate Meeting</h1>
          <p>
            Review portofolio, catat keputusan, dan lanjutkan tindakan minggu
            sebelumnya.
          </p>
        </div>
        {user.role !== "viewer" && (
          <button
            className="primary"
            disabled={!projects.length}
            onClick={() => setCreating(true)}
          >
            <Plus size={17} /> Buat rapat
          </button>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={load}>Coba lagi</button>
        </div>
      )}
      <section className="panel pmo-section">
        <div className="pmo-toolbar">
          <h2>Daftar rapat</h2>
          <Field label="Cari rapat" value={query} onChange={setQuery} />
        </div>
        {loading ? (
          <p className="pmo-empty">Memuat rapat…</p>
        ) : !list.length ? (
          <p className="pmo-empty">
            Belum ada rapat. Tambahkan proyek terlebih dahulu, lalu buat rapat
            untuk mereview portofolio.
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>TANGGAL / NOTULIS</th>
                  <th>RAPAT</th>
                  <th>MODERATOR</th>
                  <th>REVIEW</th>
                  <th>STATUS</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {labelDate(m.date)}
                      <p>{m.notulis || "Notulis belum diisi"}</p>
                    </td>
                    <td>
                      <strong>{m.title}</strong>
                      <p>{m.total} proyek</p>
                    </td>
                    <td>{m.moderator || "—"}</td>
                    <td>
                      {m.reviewed}/{m.total}
                    </td>
                    <td>
                      <span
                        className={`status ${m.status === "final" ? "completed" : "planning"}`}
                      >
                        {m.status === "final" ? "Final / terkunci" : "Draf"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(m.id)}
                      >
                        {m.status === "final"
                          ? "Lihat rapat"
                          : "Lanjutkan rapat"}
                      </button>
                      {m.status === "draft" && user.role !== "viewer" && (
                        <button
                          aria-label={`Hapus rapat ${m.title}`}
                          className="icon-button"
                          onClick={async () => {
                            if (confirm("Hapus draf rapat ini?"))
                              try {
                                await api(`/meetings/${m.id}`, {
                                  method: "DELETE",
                                  body: JSON.stringify({ version: m.version }),
                                });
                                await load();
                              } catch (e) {
                                setError((e as Error).message);
                              }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {creating && (
        <CreateMeeting
          projects={projects}
          previous={list.filter((m) => m.status === "final")}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setSelected(id);
          }}
        />
      )}
    </>
  );
}
function CreateMeeting({
  projects,
  previous,
  onClose,
  onCreated,
}: {
  projects: Project[];
  previous: Meeting[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [data, setData] = useState({
      title: "Rapat Korporat",
      date: nextMonday(previous[0]?.date || today()),
      moderator: "",
      notulis: "",
      participants: "",
      notes: "",
      previous_id: previous[0]?.id || "",
      project_ids: projects.map((p) => p.id),
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Dialog title="Buat Corporate Meeting" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const m = await api("/meetings", {
              method: "POST",
              body: JSON.stringify({
                ...data,
                previous_id: data.previous_id || null,
              }),
            });
            onCreated(m.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <MeetingFields
          data={data}
          setData={(v) => setData({ ...data, ...v })}
        />
        <Field
          label="Referensi rapat final"
          value={data.previous_id}
          options={[
            ["", "Tanpa referensi"],
            ...previous.map(
              (m) => [m.id, `${iso(m.date)} · ${m.title}`] as [string, string],
            ),
          ]}
          onChange={(v) => {
            const p = previous.find((m) => m.id === v);
            setData({
              ...data,
              previous_id: v,
              date: p ? nextMonday(p.date) : data.date,
            });
          }}
        />
        <fieldset className="pmo-checkboxes pmo-project-pick">
          <legend>Proyek yang direview</legend>
          {projects.map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={data.project_ids.includes(p.id)}
                onChange={(e) =>
                  setData({
                    ...data,
                    project_ids: e.target.checked
                      ? [...data.project_ids, p.id]
                      : data.project_ids.filter((id) => id !== p.id),
                  })
                }
              />
              <span>
                {p.name}
                <small>{p.code}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="pmo-hint">
          Referensi dan tindakan belum selesai disalin dari rapat final. Semua
          proyek pada rapat baru tetap perlu direview.
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="primary" disabled={busy || !data.project_ids.length}>
          {busy ? "Membuat…" : "Buat rapat"}
        </button>
      </form>
    </Dialog>
  );
}
type Info = Pick<
  Meeting,
  "title" | "date" | "moderator" | "notulis" | "participants" | "notes"
>;
function MeetingFields({
  data,
  setData,
}: {
  data: Info;
  setData: (v: Info) => void;
}) {
  return (
    <>
      <div className="pmo-form-grid">
        {(
          [
            ["title", "Judul rapat"],
            ["date", "Tanggal rapat"],
            ["moderator", "Moderator"],
            ["notulis", "Notulis"],
          ] as const
        ).map(([key, label]) => (
          <Field
            key={key}
            label={label}
            value={key === "date" ? iso(data[key]) : data[key]}
            required={key === "title" || key === "date"}
            type={key === "date" ? "date" : "text"}
            onChange={(v) => setData({ ...data, [key]: v })}
          />
        ))}
      </div>
      <Field
        label="Peserta rapat"
        type="textarea"
        value={data.participants}
        onChange={(v) => setData({ ...data, participants: v })}
      />
      <Field
        label="Catatan umum"
        type="textarea"
        value={data.notes}
        onChange={(v) => setData({ ...data, notes: v })}
      />
    </>
  );
}
function MeetingWorkspace({
  id,
  user,
  onBack,
  onDirty,
}: {
  id: string;
  user: User;
  onBack: () => void;
  onDirty: (v: boolean) => void;
}) {
  const [meeting, setMeeting] = useState<Detail | null>(null),
    [selected, setSelected] = useState(""),
    [review, setReview] = useState<Review>(emptyReview),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [info, setInfo] = useState<Info | null>(null),
    [preview, setPreview] = useState("");
  async function load(projectId?: string) {
    const m: Detail = await api(`/meetings/${id}`);
    setMeeting(m);
    const p =
      m.projects.find((p) => p.project_id === (projectId || selected)) ||
      m.projects[0];
    setSelected(p?.project_id || "");
    setReview(p?.review || emptyReview);
    setDirty(false);
    onDirty(false);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
    return () => onDirty(false);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (r: Review) => {
    setReview(r);
    setDirty(true);
    onDirty(true);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!meeting)
    return (
      <div className="panel pmo-empty">
        {error || "Memuat ruang rapat…"}
        <button onClick={onBack}>Kembali</button>
      </div>
    );
  const locked = user.role === "viewer" || meeting.status === "final",
    project = meeting.projects.find((p) => p.project_id === selected),
    done = meeting.projects.filter((p) => p.review.review !== "pending").length;
  const paper: Paper = {
    title:
      preview === "memo"
        ? "Memo Ringkasan Rapat Korporat"
        : "Summary & Memo — Corporate Meeting",
    subtitle: `${meeting.title} · ${labelDate(meeting.date)} · Moderator: ${meeting.moderator} · Notulis: ${meeting.notulis}`,
    status:
      meeting.status === "final" ? "FINAL / TERKUNCI" : "DRAF / BELUM FINAL",
    sections:
      preview === "memo"
        ? [
            {
              heading: "Peserta & catatan",
              text: `${meeting.participants}\n${meeting.notes}`,
            },
            ...meeting.projects.map((p) => ({
              heading: p.snapshot.name,
              text: reviewText(p.review) || "Tanpa perubahan.",
            })),
          ]
        : [
            {
              heading: "Peserta & catatan",
              text: `${meeting.participants}\n${meeting.notes}`,
            },
            {
              heading: "Review proyek",
              columns: ["Proyek", "Referensi rapat lalu", "Pembaruan saat ini"],
              rows: meeting.projects.map((p) => [
                `${p.snapshot.code}\n${p.snapshot.name}\n${p.snapshot.customer}\nPM: ${p.snapshot.manager_name}`,
                p.previous_notes || "—",
                p.review.review === "unchanged"
                  ? "Dikonfirmasi tanpa perubahan."
                  : reviewText(p.review) || "Belum direview.",
              ]),
            },
          ],
  };
  return (
    <>
      <button
        className="text-button pmo-back"
        onClick={() => {
          if (
            !dirty ||
            confirm("Tinggalkan perubahan review yang belum disimpan?")
          )
            onBack();
        }}
      >
        <ArrowLeft size={15} /> Daftar rapat
      </button>
      <div className="page-heading">
        <div>
          <div className="eyebrow blue">CORPORATE MEETING</div>
          <h1>{meeting.title}</h1>
          <p>
            {labelDate(meeting.date)} · {done}/{meeting.projects.length} proyek
            direview ·{" "}
            {meeting.status === "final"
              ? "Final / terkunci"
              : dirty
                ? "Ada perubahan belum disimpan"
                : "Draf"}
          </p>
        </div>
        <div className="pmo-actions">
          <button
            className="secondary"
            onClick={() => {
              if (
                dirty &&
                !confirm(
                  "Buka informasi rapat dan tinggalkan review yang belum disimpan?",
                )
              )
                return;
              void load();
              setInfo({ ...meeting, date: iso(meeting.date) });
            }}
          >
            Informasi rapat
          </button>
          <button
            className="secondary"
            onClick={() => {
              if (dirty) {
                setError(
                  "Simpan review terlebih dahulu agar dokumen memuat perubahan terbaru.",
                );
                return;
              }
              setPreview(preview ? "" : "summary");
            }}
          >
            Pratinjau dokumen
          </button>
          {!locked && (
            <button
              className="primary"
              disabled={busy || dirty || done !== meeting.projects.length}
              onClick={() => {
                if (confirm("Finalisasi dan kunci seluruh hasil rapat?"))
                  run(async () => {
                    await api(`/meetings/${id}/finalize`, {
                      method: "POST",
                      body: JSON.stringify({ version: meeting.version }),
                    });
                    await load();
                  });
              }}
            >
              <LockKeyhole size={15} /> Finalisasi
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {preview ? (
        <>
          <div className="pmo-toolbar">
            <button className="secondary" onClick={() => setPreview("summary")}>
              Ringkasan tabel
            </button>
            <button className="secondary" onClick={() => setPreview("memo")}>
              Memo
            </button>
          </div>
          <PaperView paper={paper} onError={setError} />
        </>
      ) : (
        <div className="pmo-meeting-grid">
          <aside className="panel pmo-section">
            <Field
              label="Cari proyek rapat"
              value={query}
              onChange={setQuery}
            />
            <Field
              label="Filter review"
              value={filter}
              onChange={setFilter}
              options={[
                ["all", "Semua"],
                ["pending", "Belum direview"],
                ["updated", "Diperbarui"],
                ["unchanged", "Tanpa perubahan"],
              ]}
            />
            {meeting.projects
              .filter(
                (p) =>
                  (filter === "all" || p.review.review === filter) &&
                  `${p.snapshot.name} ${p.snapshot.code}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((p) => (
                <button
                  className={`pmo-meeting-project ${selected === p.project_id ? "active" : ""}`}
                  key={p.project_id}
                  onClick={() => {
                    if (
                      dirty &&
                      !confirm(
                        "Ganti proyek dan tinggalkan review yang belum disimpan?",
                      )
                    )
                      return;
                    setSelected(p.project_id);
                    setReview(p.review);
                    setDirty(false);
                    onDirty(false);
                  }}
                >
                  <strong>{p.snapshot.name}</strong>
                  <span>
                    {p.snapshot.code} · {p.review.review}
                  </span>
                </button>
              ))}
          </aside>
          <section className="panel pmo-section">
            <h2>{project?.snapshot.name}</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(`/meetings/${id}/reviews/${selected}`, {
                    method: "PUT",
                    body: JSON.stringify({ version: meeting.version, review }),
                  });
                  await load();
                });
              }}
            >
              <div className="pmo-form-grid">
                <Field
                  label="Status review"
                  value={review.review}
                  disabled={locked}
                  options={[
                    ["pending", "Belum direview"],
                    ["updated", "Diperbarui"],
                    ["unchanged", "Konfirmasi tanpa perubahan"],
                  ]}
                  onChange={(v) =>
                    change({ ...review, review: v as Review["review"] })
                  }
                />
                <Field
                  label="Kondisi proyek"
                  value={review.health}
                  disabled={locked}
                  options={[
                    ["unrated", "Belum dinilai"],
                    ["on_track", "Sesuai rencana"],
                    ["attention", "Perlu perhatian"],
                    ["critical", "Kritis"],
                  ]}
                  onChange={(v) =>
                    change({ ...review, health: v as Review["health"] })
                  }
                />
              </div>
              <Field
                label="Ringkasan pembaruan"
                type="textarea"
                value={review.summary}
                disabled={locked}
                onChange={(v) => change({ ...review, summary: v })}
              />
              <div className="pmo-toolbar">
                <h3>Pembaruan terperinci</h3>
                {!locked && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      change({
                        ...review,
                        items: [
                          ...review.items,
                          { type: "progress", text: "" },
                        ],
                      })
                    }
                  >
                    <Plus size={14} /> Pembaruan
                  </button>
                )}
              </div>
              {review.items.map((item, i) => (
                <div className="pmo-action-card" key={i}>
                  <Field
                    label={`Kategori pembaruan ${i + 1}`}
                    value={item.type}
                    disabled={locked}
                    options={[
                      ["progress", "Progres"],
                      ["resource", "Sumber daya"],
                      ["revenue", "Pendapatan"],
                      ["issue", "Kendala"],
                    ]}
                    onChange={(v) =>
                      change({
                        ...review,
                        items: review.items.map((x, j) =>
                          i === j ? { ...x, type: v as typeof x.type } : x,
                        ),
                      })
                    }
                  />
                  <Field
                    label={`Pembaruan ${i + 1}`}
                    value={item.text}
                    disabled={locked}
                    required
                    onChange={(v) =>
                      change({
                        ...review,
                        items: review.items.map((x, j) =>
                          i === j ? { ...x, text: v } : x,
                        ),
                      })
                    }
                  />
                  {!locked && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        change({
                          ...review,
                          items: review.items.filter((_, j) => i !== j),
                        })
                      }
                    >
                      Hapus pembaruan
                    </button>
                  )}
                </div>
              ))}
              <ActionsEditor
                readonly={locked}
                actions={review.actions}
                onChange={(a) => change({ ...review, actions: a })}
              />
              {!locked && (
                <button className="primary" disabled={busy}>
                  {busy ? "Menyimpan…" : "Simpan review proyek"}
                </button>
              )}
            </form>
          </section>
          <aside className="panel pmo-section pmo-history">
            <div className="eyebrow blue">REFERENSI HISTORIS</div>
            <h3>Rapat sebelumnya</h3>
            <p>
              {project?.previous_notes ||
                "Belum ada referensi untuk proyek ini."}
            </p>
            <small>
              Tindakan belum selesai dibawa ke rapat baru. Review tetap harus
              dikonfirmasi setiap periode.
            </small>
          </aside>
        </div>
      )}
      {info && (
        <Dialog title="Informasi rapat" onClose={() => setInfo(null)}>
          {locked ? (
            <div className="pmo-history">
              <p>
                {meeting.moderator} · {meeting.notulis}
              </p>
              <p>{meeting.participants}</p>
              <p>{meeting.notes}</p>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                run(async () => {
                  await api(`/meetings/${id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ version: meeting.version, info }),
                  });
                  setInfo(null);
                  await load();
                });
              }}
            >
              <MeetingFields data={info} setData={setInfo} />
              <button className="primary" disabled={busy}>
                Simpan informasi
              </button>
            </form>
          )}
        </Dialog>
      )}
    </>
  );
}
