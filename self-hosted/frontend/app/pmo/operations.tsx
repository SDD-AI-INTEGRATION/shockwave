"use client";
import { useState } from "react";
import { Plus, Trash2, Download, Upload, Save, Flag } from "lucide-react";
import {
  actualAt,
  planAt,
  metrics,
  type Operations,
  type Issue,
} from "../../../backend/src/pmo-models";
import { type Project, type User, weekCount, iso, labelDate, today } from "./client";
import { RequestApproval } from "./governance";
import { importOperations, operationsExcel, type Paper } from "./exports";
import { Dialog, Field, PaperView } from "./ui";
import { schedule } from "../../../backend/src/scheduling";
const patterns: [string, string][] = [
  ["even", "Rata"],
  ["custom", "Kustom"],
];
const levels: [string, string][] = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
];
const uid = () => crypto.randomUUID();
export function templateOperations(type: string, weeks: number): Operations {
  const groups =
    type === "service"
      ? [
          ["Transisi layanan", 10],
          ["Operasional layanan", 60],
          ["Evaluasi SLA", 20],
          ["Serah terima", 10],
        ]
      : type === "infrastructure"
        ? [
            ["Survei & desain", 10],
            ["Pengadaan", 30],
            ["Instalasi & konfigurasi", 40],
            ["Pengujian & serah terima", 20],
          ]
        : [
            ["Inisiasi", 5],
            ["Analisis & desain", 15],
            ["Pengembangan", 50],
            ["Pengujian", 20],
            ["Deployment & serah terima", 10],
          ];
  return {
    phases: groups.map(([name, weight], i) => {
      const start = Math.min(
          weeks - 1,
          Math.floor((i * weeks) / groups.length),
        ),
        end = Math.max(
          start + 1,
          Math.floor(((i + 1) * weeks) / groups.length),
        );
      return {
        id: uid(),
        name: String(name),
        tasks: [
          {
            id: uid(),
            name: String(name),
            weight: Number(weight),
            start,
            duration: end - start,
            pattern: "even",
            plan: [],
            actual: {},
          },
        ],
      };
    }),
    issues: [],
    reports: {},
  };
}
export function OperationsView({
  project,
  data,
  setData,
  save,
  readonly,
  tab,
  error,
  setError,
  saving,
  user,
}: {
  user?: User;
  project: Project;
  data: Operations;
  setData: (v: Operations) => void;
  save: (data?: Operations) => Promise<void>;
  readonly: boolean;
  tab: string;
  error: string;
  setError: (s: string) => void;
  saving: boolean;
}) {
  const [week, setWeek] = useState(() => Math.max(0, Math.min(weekCount(project) - 1, Math.floor((Date.parse(today()) - Date.parse(iso(project.start_date))) / 604800000)))),
    [template, setTemplate] = useState("application"),
    [issue, setIssue] = useState<Issue | null>(null),
    [preview, setPreview] = useState(false);
  const weeks = weekCount(project),
    tasks = data.phases.flatMap((p) => p.tasks),
    m = metrics(data, week);
  let graph: ReturnType<typeof schedule> | null = null,
    graphError = "";
  try {
    graph = schedule(tasks);
  } catch (e) {
    graphError = (e as Error).message;
  }
  const mutate = (fn: (v: Operations) => void) => {
    const next = structuredClone(data);
    fn(next);
    const ids = new Set(next.phases.flatMap((p) => p.tasks.map((t) => t.id)));
    next.phases.forEach((p) =>
      p.tasks.forEach((t) => {
        if (t.dependencies)
          t.dependencies = t.dependencies.filter((id) => ids.has(id));
      }),
    );
    setData(next);
  };
  const run = async (fn: () => unknown) => {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const phase = (i: number, key: string, value: unknown) =>
    mutate((v) => Object.assign(v.phases[i], { [key]: value }));
  const task = (i: number, j: number, key: string, value: unknown) =>
    mutate((v) => Object.assign(v.phases[i].tasks[j], { [key]: value }));
  const report = data.reports[week] || {
    notes: "",
    done: "",
    todo: "",
    next: "",
  };
  const paper: Paper = {
    title: "Laporan Mingguan Proyek",
    subtitle: `${project.code} · ${project.name} · W${week}`,
    sections: [
      {
        heading: "Ringkasan",
        text: `Rencana ${m.plan}% · Realisasi ${m.actual}% · Deviasi ${m.deviation}%`,
      },
      {
        heading: "Aktivitas WBS",
        columns: ["Aktivitas", "Bobot", "Rencana", "Realisasi", "Deviasi"],
        rows: tasks.map((t) => [
          t.name,
          `${t.weight}%`,
          `${planAt(t, week).toFixed(1)}%`,
          `${actualAt(t, week)}%`,
          `${(actualAt(t, week) - planAt(t, week)).toFixed(1)}%`,
        ]),
      },
      { heading: "Selesai / berjalan", text: report.done },
      { heading: "Belum dikerjakan", text: report.todo },
      { heading: "Target minggu depan", text: report.next },
      {
        heading: "Kendala",
        columns: ["Kendala", "Dampak", "Tindakan", "PIC", "Target", "Status"],
        rows: data.issues
          .filter((i) => i.week <= week)
          .map((i) => [
            i.description,
            i.impact,
            i.action,
            i.pic,
            i.due,
            i.status,
          ]),
      },
      { heading: "Catatan", text: report.notes },
    ],
  };
  return (
    <div className="pmo-operations">
      <div className="panel pmo-toolbar operations-toolbar">
        <div>
          <strong>
            {tab === "WBS"
              ? "Struktur & bobot pekerjaan"
              : tab === "Timeline WBS"
                ? "Jadwal mingguan"
                : "Realisasi & laporan mingguan"}
          </strong>
          <p>
            {labelDate(iso(project.start_date))} –{" "}
            {labelDate(iso(project.end_date))} · {weeks} minggu
          </p>
        </div>
        <div className="pmo-actions">
          <button
            className="secondary"
            onClick={() => run(() => operationsExcel(project, data, true))}
          >
            <Download size={15} /> Template Excel
          </button>
          <button
            className="secondary"
            onClick={() => run(() => operationsExcel(project, data))}
          >
            <Download size={15} /> Ekspor
          </button>
          {!readonly && (
            <label className="secondary pmo-file">
              <Upload size={15} /> Impor
              <input
                type="file"
                accept=".xlsx"
                aria-label="Impor Operations"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (
                    f &&
                    confirm(
                      "Ganti WBS, jadwal, realisasi, dan laporan dengan isi workbook?",
                    )
                  )
                    run(async () => {
                      const next = await importOperations(f, project);
                      setData(next);
                    });
                }}
              />
            </label>
          )}
        </div>
      </div>
      {!readonly && (
        <div className="pmo-toolbar pmo-template">
          <Field
            label="Jenis template"
            value={template}
            onChange={setTemplate}
            options={[
              ["application", "Application"],
              ["service", "Manage Service"],
              ["infrastructure", "Infrastructure"],
            ]}
          />
          <button
            className="secondary"
            onClick={() => {
              if (
                confirm(
                  "Ganti operasi dengan template kosong realisasi? Perubahan baru berlaku setelah disimpan.",
                )
              ) {
                setData(templateOperations(template, weeks));
                setError("");
              }
            }}
          >
            Terapkan template
          </button>
          <button
            className="secondary"
            disabled={!!data.baseline || saving}
            onClick={() => {
              if (confirm("Simpan jadwal sekarang sebagai baseline tetap?"))
                run(() =>
                  save({ ...data, baseline: structuredClone(data.phases) }),
                );
            }}
          >
            <Flag size={15} />
            {data.baseline ? "Baseline tersimpan" : "Simpan baseline"}
          </button>
          {data.baseline && user && (
            <RequestApproval
              projectId={project.id}
              kind="baseline"
              resourceId="baseline"
              body={{}}
              user={user}
              label="Ajukan baseline"
            />
          )}
          <button
            className="primary"
            disabled={saving}
            onClick={() => run(() => save())}
          >
            <Save size={15} />
            {saving ? "Menyimpan…" : "Simpan operasi"}
          </button>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="pmo-metrics">
        {[
          ["Bobot WBS", m.weight],
          ["Rencana", m.plan],
          ["Realisasi", m.actual],
          ["Deviasi", m.deviation],
        ].map(([l, v]) => (
          <div className="panel" key={l}>
            <span>{l}</span>
            <strong className={Number(v) < 0 ? "negative" : ""}>{v}%</strong>
          </div>
        ))}
      </div>
      {tab !== "WBS" && (
        <div className="pmo-toolbar">
          <Field
            label="Minggu laporan"
            value={week}
            onChange={(v) => setWeek(Number(v))}
            options={Array.from({ length: weeks }, (_, i) => [
              String(i),
              `W${i}`,
            ])}
          />
          {tab === "Laporan" && user && (
            <RequestApproval
              key={`report-${week}`}
              projectId={project.id}
              kind="weekly_report"
              resourceId={`week:${week}`}
              body={{ week }}
              user={user}
              label={`Ajukan laporan W${week}`}
              disabled={!tasks.length}
            />
          )}
          {tab === "Laporan" && (
            <button className="secondary" onClick={() => setPreview(!preview)}>
              Pratinjau laporan / ekspor Word & PDF
            </button>
          )}
        </div>
      )}
      {tab === "WBS" && (
        <section className="panel pmo-section">
          <div className="pmo-toolbar">
            <h2>Activity & Sub Activity</h2>
            {!readonly && (
              <button
                className="secondary"
                onClick={() =>
                  mutate((v) =>
                    v.phases.push({
                      id: uid(),
                      name: "Aktivitas baru",
                      tasks: [],
                    }),
                  )
                }
              >
                <Plus size={15} /> Aktivitas
              </button>
            )}
          </div>
          {!data.phases.length && (
            <p className="pmo-empty">
              Mulai dari template atau tambahkan aktivitas sendiri. Tidak ada
              realisasi contoh yang dimasukkan otomatis.
            </p>
          )}
          {data.phases.map((p, i) => (
            <div className="pmo-phase" key={p.id}>
              <div className="pmo-toolbar">
                <Field
                  label={`Nama aktivitas ${i + 1}`}
                  value={p.name}
                  disabled={readonly}
                  onChange={(v) => phase(i, "name", v)}
                />
                <strong>{p.tasks.reduce((s, t) => s + t.weight, 0)}%</strong>
                {!readonly && (
                  <>
                    <button
                      className="secondary"
                      onClick={() =>
                        mutate((v) =>
                          v.phases[i].tasks.push({
                            id: uid(),
                            name: "Subaktivitas baru",
                            weight: 0,
                            start: 0,
                            duration: 1,
                            pattern: "even",
                            plan: [],
                            actual: {},
                          }),
                        )
                      }
                    >
                      <Plus size={14} /> Subaktivitas
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Hapus aktivitas ${i + 1}`}
                      onClick={() => {
                        if (
                          confirm(
                            "Hapus aktivitas dan seluruh subaktivitasnya?",
                          )
                        )
                          mutate((v) => {
                            const ids = v.phases[i].tasks.map((t) => t.id);
                            v.phases.splice(i, 1);
                            v.issues.forEach((x) => {
                              if (ids.includes(x.task_id)) x.task_id = "";
                            });
                          });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>SUBAKTIVITAS</th>
                      <th>BOBOT (%)</th>
                      <th>URUTAN</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {p.tasks.map((t, j) => (
                      <tr key={t.id}>
                        <td>
                          <input
                            aria-label={`Nama subaktivitas ${i + 1}-${j + 1}`}
                            disabled={readonly}
                            value={t.name}
                            onChange={(e) => task(i, j, "name", e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Bobot ${i + 1}-${j + 1}`}
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            disabled={readonly}
                            value={t.weight}
                            onChange={(e) =>
                              task(i, j, "weight", Number(e.target.value))
                            }
                          />
                        </td>
                        <td>
                          {!readonly && (
                            <>
                              <button
                                disabled={j === 0}
                                onClick={() =>
                                  mutate((v) => {
                                    const a = v.phases[i].tasks;
                                    [a[j - 1], a[j]] = [a[j], a[j - 1]];
                                  })
                                }
                              >
                                ↑
                              </button>
                              <button
                                disabled={j === p.tasks.length - 1}
                                onClick={() =>
                                  mutate((v) => {
                                    const a = v.phases[i].tasks;
                                    [a[j], a[j + 1]] = [a[j + 1], a[j]];
                                  })
                                }
                              >
                                ↓
                              </button>
                            </>
                          )}
                        </td>
                        <td>
                          {!readonly && (
                            <button
                              className="icon-button"
                              aria-label={`Hapus subaktivitas ${i + 1}-${j + 1}`}
                              onClick={() => {
                                if (confirm("Hapus subaktivitas?"))
                                  mutate((v) => {
                                    v.phases[i].tasks.splice(j, 1);
                                    v.issues.forEach((x) => {
                                      if (x.task_id === t.id) x.task_id = "";
                                    });
                                  });
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
            </div>
          ))}
        </section>
      )}
      {tab === "Timeline WBS" && (
        <section className="panel pmo-section">
          <div className="pmo-toolbar">
            <p>
              {graphError ||
                `Perkiraan selesai W${graph?.finish || 0} · Aktivitas kritis: ${
                  tasks
                    .filter((t) => graph?.critical.includes(t.id))
                    .map((t) => t.name)
                    .join(", ") || "Belum ada"
                }`}
            </p>
            {!readonly && (
              <button
                className="secondary"
                onClick={() =>
                  run(() => {
                    const result = schedule(tasks);
                    if (result.finish > weeks)
                      throw new Error(
                        "Dependency memerlukan periode lebih panjang dari proyek.",
                      );
                    mutate((v) =>
                      v.phases.forEach((p) =>
                        p.tasks.forEach(
                          (t) => (t.start = result.earliest[t.id]),
                        ),
                      ),
                    );
                  })
                }
              >
                Susun jadwal dependency
              </button>
            )}
          </div>
          <div className="table-scroll">
            <table className="pmo-gantt">
              <thead>
                <tr>
                  <th>SUBAKTIVITAS</th>
                  <th>MULAI (W)</th>
                  <th>DURASI</th>
                  <th>POLA</th>
                  {Array.from({ length: weeks }, (_, k) => (
                    <th key={k}>W{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.phases.flatMap((p, i) =>
                  p.tasks.map((t, j) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        {graph?.critical.includes(t.id) && (
                          <small>
                            Jalur kritis · slack {graph.slack[t.id]} minggu
                          </small>
                        )}
                        <label className="pmo-field">
                          <span>
                            Dependency (Ctrl+klik untuk memilih beberapa)
                          </span>
                          <select
                            multiple
                            aria-label={`Dependency ${t.name}`}
                            disabled={readonly}
                            value={t.dependencies || []}
                            style={{ height: 80, width: "100%" }}
                            onChange={(e) =>
                              task(
                                i,
                                j,
                                "dependencies",
                                Array.from(
                                  e.target.selectedOptions,
                                  (o) => o.value,
                                ),
                              )
                            }
                          >
                            {tasks
                              .filter((x) => x.id !== t.id)
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <Field
                          label={`Lag ${t.name} (minggu)`}
                          type="number"
                          disabled={readonly}
                          value={t.lag || 0}
                          onChange={(v) => task(i, j, "lag", Number(v))}
                        />
                        {t.pattern === "custom" && (
                          <Field
                            label={`Rencana kustom ${t.name} (pisahkan ;)`}
                            value={t.plan.join(";")}
                            disabled={readonly}
                            onChange={(v) =>
                              task(
                                i,
                                j,
                                "plan",
                                v
                                  .split(";")
                                  .map((x) =>
                                    Number(x.trim().replace(",", ".")),
                                  ),
                              )
                            }
                          />
                        )}
                      </td>
                      <td>
                        <input
                          aria-label={`Mulai ${t.name}`}
                          type="number"
                          min={0}
                          max={weeks - 1}
                          value={t.start}
                          disabled={readonly}
                          onChange={(e) =>
                            task(i, j, "start", Number(e.target.value))
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Durasi ${t.name}`}
                          type="number"
                          min={1}
                          max={weeks}
                          value={t.duration}
                          disabled={readonly}
                          onChange={(e) =>
                            task(i, j, "duration", Number(e.target.value))
                          }
                        />
                      </td>
                      <td>
                        <select
                          aria-label={`Pola ${t.name}`}
                          value={t.pattern}
                          disabled={readonly}
                          onChange={(e) =>
                            task(i, j, "pattern", e.target.value)
                          }
                        >
                          {patterns.map(([v, l]) => (
                            <option value={v} key={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </td>
                      {Array.from({ length: weeks }, (_, k) => (
                        <td
                          key={k}
                          className={
                            k >= t.start && k < t.start + t.duration
                              ? "gantt-active"
                              : ""
                          }
                        >
                          <span>{Math.round(planAt(t, k))}%</span>
                          {data.baseline && (
                            <small>
                              {Math.round(
                                planAt(
                                  data.baseline
                                    .flatMap((p) => p.tasks)
                                    .find((x) => x.id === t.id) || t,
                                  k,
                                ),
                              )}
                              % baseline
                            </small>
                          )}
                        </td>
                      ))}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          {!tasks.length && (
            <p className="pmo-empty">
              Tambahkan WBS terlebih dahulu untuk menyusun jadwal.
            </p>
          )}
        </section>
      )}
      {tab === "Laporan" && (
        <>
          <section className="panel pmo-section">
            <h2>Realisasi kumulatif · W{week}</h2>
            <p>
              Isian kosong meneruskan minggu sebelumnya. Realisasi tidak boleh
              menurun.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>SUBAKTIVITAS</th>
                    <th>RENCANA</th>
                    <th>REALISASI (%)</th>
                    <th>DEVIASI</th>
                  </tr>
                </thead>
                <tbody>
                  {data.phases.flatMap((p, i) =>
                    p.tasks.map((t, j) => (
                      <tr key={t.id}>
                        <td>{t.name}</td>
                        <td>{planAt(t, week).toFixed(1)}%</td>
                        <td>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.01"
                            aria-label={`Realisasi ${t.name}`}
                            placeholder={String(actualAt(t, week))}
                            value={t.actual[week] ?? ""}
                            disabled={readonly}
                            onChange={(e) =>
                              mutate((v) => {
                                const a = v.phases[i].tasks[j].actual;
                                if (e.target.value === "") delete a[week];
                                else a[week] = Number(e.target.value);
                              })
                            }
                          />
                        </td>
                        <td
                          className={
                            actualAt(t, week) < planAt(t, week)
                              ? "negative"
                              : ""
                          }
                        >
                          {(actualAt(t, week) - planAt(t, week)).toFixed(1)}%
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <div className="pmo-form-grid">
              {(
                [
                  ["done", "Selesai / berjalan di luar WBS"],
                  ["todo", "Belum dikerjakan"],
                  ["next", "Target minggu depan"],
                  ["notes", "Catatan laporan"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  type="textarea"
                  disabled={readonly}
                  value={report[key]}
                  onChange={(value) =>
                    mutate(
                      (v) => (v.reports[week] = { ...report, [key]: value }),
                    )
                  }
                />
              ))}
            </div>
          </section>
          <section className="panel pmo-section">
            <div className="pmo-toolbar">
              <h2>Kendala & tindak lanjut</h2>
              {!readonly && (
                <button
                  className="secondary"
                  onClick={() =>
                    setIssue({
                      id: uid(),
                      task_id: "",
                      category: "other",
                      description: "",
                      impact: "medium",
                      action: "",
                      pic: "",
                      due: "",
                      status: "open",
                      week,
                    })
                  }
                >
                  <Plus size={15} /> Kendala
                </button>
              )}
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>KENDALA</th>
                    <th>PIC / TARGET</th>
                    <th>DAMPAK</th>
                    <th>STATUS</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.issues
                    .filter((x) => x.week <= week)
                    .map((x) => (
                      <tr key={x.id}>
                        <td>
                          <strong>{x.description}</strong>
                          <p>{x.action}</p>
                        </td>
                        <td>
                          {x.pic || "—"}
                          <p>{x.due || "—"}</p>
                        </td>
                        <td>{x.impact}</td>
                        <td>{x.status}</td>
                        <td>
                          {!readonly && (
                            <>
                              <button onClick={() => setIssue(x)}>Edit</button>
                              <button
                                aria-label="Hapus kendala"
                                onClick={() => {
                                  if (confirm("Hapus kendala?"))
                                    mutate(
                                      (v) =>
                                        (v.issues = v.issues.filter(
                                          (i) => i.id !== x.id,
                                        )),
                                    );
                                }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
          {preview && <PaperView paper={paper} onError={setError} />}
        </>
      )}
      {issue && (
        <Dialog title="Kendala proyek" onClose={() => setIssue(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mutate((v) => {
                v.issues = v.issues
                  .filter((x) => x.id !== issue.id)
                  .concat(issue);
              });
              setIssue(null);
            }}
          >
            <Field
              label="Uraian kendala"
              value={issue.description}
              required
              onChange={(v) => setIssue({ ...issue, description: v })}
            />
            <Field
              label="Subaktivitas terkait"
              value={issue.task_id}
              onChange={(v) => setIssue({ ...issue, task_id: v })}
              options={[
                ["", "Tidak terkait WBS"],
                ...tasks.map((t) => [t.id, t.name] as [string, string]),
              ]}
            />
            <div className="pmo-form-grid">
              <Field
                label="Kategori"
                value={issue.category}
                options={[
                  "scope",
                  "time",
                  "cost",
                  "quality",
                  "resource",
                  "other",
                ].map((k) => [k, k])}
                onChange={(v) =>
                  setIssue({ ...issue, category: v as Issue["category"] })
                }
              />
              <Field
                label="Dampak"
                value={issue.impact}
                options={levels}
                onChange={(v) =>
                  setIssue({ ...issue, impact: v as Issue["impact"] })
                }
              />
              <Field
                label="PIC"
                value={issue.pic}
                onChange={(v) => setIssue({ ...issue, pic: v })}
              />
              <Field
                label="Target"
                type="date"
                value={issue.due}
                onChange={(v) => setIssue({ ...issue, due: v })}
              />
            </div>
            <Field
              label="Tindakan"
              type="textarea"
              value={issue.action}
              onChange={(v) => setIssue({ ...issue, action: v })}
            />
            <Field
              label="Status kendala"
              value={issue.status}
              options={["open", "in_progress", "closed"].map((k) => [k, k])}
              onChange={(v) =>
                setIssue({ ...issue, status: v as Issue["status"] })
              }
            />
            <button className="primary">Terapkan kendala</button>
            <p className="pmo-hint">
              Klik Simpan operasi untuk menyimpan seluruh perubahan ke server.
            </p>
          </form>
        </Dialog>
      )}
    </div>
  );
}
