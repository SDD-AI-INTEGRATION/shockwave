"use client";
import { useRef, useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import type {
  Assignment,
  Risk,
  Mom,
  Action,
} from "../../../backend/src/pmo-models";
import { type Project, today, labelDate } from "./client";
import { Field, Dialog, PaperView } from "./ui";
import type { Paper } from "./exports";
const levels: [string, string][] = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
];
const uid = () => crypto.randomUUID();
const number = (type: string, n: number) =>
  `${String(n + 1).padStart(3, "0")}/${type}/PMO-SDD/${today().slice(0, 7).replace("-", "/")}`;
export function AssignmentsView({
  project,
  data,
  save,
  readonly,
  onError,
  markDirty,
}: {
  project: Project;
  data: { letters: Assignment[] };
  save: (v: { letters: Assignment[] }) => Promise<void>;
  readonly: boolean;
  onError: (s: string) => void;
  markDirty: () => void;
}) {
  const blank = (): Assignment => ({
    id: uid(),
    number: number("PM", data.letters.length),
    date: today(),
    place: "Jakarta",
    signer: "",
    signer_position: "Manager",
    signer_unit: "PMO",
    pm: project.manager_name,
    pm_position: "Project Manager",
    pm_unit: "",
    classification: "Medium",
  });
  const [letter, setLetter] = useState<Assignment>(data.letters[0] || blank());
  const change = (key: keyof Assignment, value: string) => {
    setLetter({ ...letter, [key]: value });
    markDirty();
  };
  const paper: Paper = {
    title: "Surat Penunjukan & Penetapan Project Manager",
    subtitle: `Nomor ${letter.number} · ${project.code}`,
    sections: [
      {
        heading: "Yang bertandatangan di bawah ini",
        text: `Nama: ${letter.signer}\nJabatan: ${letter.signer_position}\nUnit: ${letter.signer_unit}`,
      },
      {
        heading: "Menunjuk dan menetapkan",
        text: `Nama: ${letter.pm}\nJabatan: ${letter.pm_position}\nUnit: ${letter.pm_unit}`,
      },
      {
        heading: "Sebagai Project Manager untuk",
        text: `Nama proyek: ${project.name}\nNomor proyek: ${project.code}\nPelanggan: ${project.customer}\nKlasifikasi: ${letter.classification}`,
      },
      {
        heading: "Penetapan",
        text: `Demikian surat penunjukan ini dibuat untuk dipergunakan sebagaimana mestinya.\n\n${letter.place}, ${labelDate(letter.date)}\n\n\n${letter.signer}\n${letter.signer_position}`,
      },
    ],
  };
  return (
    <>
      <div className="panel pmo-toolbar">
        <Field
          label="Surat tersimpan"
          value={data.letters.some((l) => l.id === letter.id) ? letter.id : ""}
          onChange={(v) => {
            const l = data.letters.find((l) => l.id === v);
            if (
              l &&
              confirm(
                "Buka surat tersimpan? Isian yang belum disimpan akan diganti.",
              )
            )
              setLetter(l);
          }}
          options={[
            ["", "Surat baru"],
            ...data.letters.map((l) => [l.id, l.number] as [string, string]),
          ]}
        />
        {!readonly && (
          <button
            className="secondary"
            onClick={() => {
              if (confirm("Buat surat baru?")) setLetter(blank());
            }}
          >
            <Plus size={15} /> Surat baru
          </button>
        )}
      </div>
      <div className="pmo-document-grid">
        <section className="panel pmo-section">
          <h2>Form penunjukan PM</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save({
                  letters: data.letters
                    .filter((l) => l.id !== letter.id)
                    .concat(letter),
                });
              } catch (error) {
                onError((error as Error).message);
              }
            }}
          >
            <div className="pmo-form-grid">
              {(
                [
                  ["number", "Nomor surat"],
                  ["date", "Tanggal"],
                  ["place", "Tempat"],
                  ["signer", "Penandatangan"],
                  ["signer_position", "Jabatan penandatangan"],
                  ["signer_unit", "Unit penandatangan"],
                  ["pm", "Nama PM"],
                  ["pm_position", "Jabatan PM"],
                  ["pm_unit", "Unit PM"],
                ] as const
              ).map(([key, label]) => (
                <Field
                  key={key}
                  label={label}
                  value={letter[key]}
                  type={key === "date" ? "date" : "text"}
                  required
                  disabled={readonly}
                  onChange={(v) => change(key, v)}
                />
              ))}
              <Field
                label="Klasifikasi proyek"
                value={letter.classification}
                disabled={readonly}
                options={["Small", "Medium", "Big"].map((v) => [v, v])}
                onChange={(v) => change("classification", v)}
              />
            </div>
            {!readonly && (
              <div className="pmo-actions">
                <button className="primary">Simpan surat</button>
                {data.letters.some((l) => l.id === letter.id) && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      if (confirm("Hapus surat tersimpan?"))
                        try {
                          await save({
                            letters: data.letters.filter(
                              (l) => l.id !== letter.id,
                            ),
                          });
                          setLetter(blank());
                        } catch (error) {
                          onError((error as Error).message);
                        }
                    }}
                  >
                    Hapus surat
                  </button>
                )}
              </div>
            )}
          </form>
        </section>
        <PaperView paper={paper} onError={onError} />
      </div>
    </>
  );
}
export function RisksView({
  project,
  data,
  setData,
  save,
  readonly,
  onError,
}: {
  project: Project;
  data: { prepared: string; date: string; risks: Risk[] };
  setData: (v: typeof data) => void;
  save: () => Promise<void>;
  readonly: boolean;
  onError: (s: string) => void;
}) {
  const [edit, setEdit] = useState<Risk | null>(null);
  const paper: Paper = {
    title: "Risk Assessment — Risk Register",
    subtitle: project.name,
    sections: [
      {
        heading: "Identitas",
        text: `Project: ${project.code}\nPrepared by: ${data.prepared}\nDate: ${labelDate(data.date)}`,
      },
      {
        heading: "Risk Assessment",
        columns: [
          "Identifikasi",
          "Dampak",
          "Severity",
          "Probability",
          "Response Plan",
          "PIC",
          "Status",
        ],
        rows: data.risks.map((r) => [
          r.risk,
          r.impact.join(", "),
          r.severity,
          r.probability,
          r.response,
          r.pic,
          r.status,
        ]),
      },
    ],
  };
  return (
    <>
      <div className="panel pmo-toolbar">
        <Field
          label="Prepared by"
          value={data.prepared}
          disabled={readonly}
          onChange={(v) => setData({ ...data, prepared: v })}
        />
        <Field
          label="Tanggal register"
          type="date"
          value={data.date}
          disabled={readonly}
          onChange={(v) => setData({ ...data, date: v })}
        />
        {!readonly && (
          <button
            className="primary"
            onClick={() => save().catch((e) => onError(e.message))}
          >
            Simpan register
          </button>
        )}
      </div>
      <div className="pmo-metrics">
        {["high", "medium", "low"].map((l) => (
          <div className="panel" key={l}>
            <span>Severity {l}</span>
            <strong>
              {
                data.risks.filter(
                  (r) => r.severity === l && r.status !== "closed",
                ).length
              }
            </strong>
          </div>
        ))}
      </div>
      <section className="panel pmo-section">
        <div className="pmo-toolbar">
          <h2>Daftar risiko</h2>
          {!readonly && (
            <button
              className="secondary"
              onClick={() =>
                setEdit({
                  id: uid(),
                  risk: "",
                  impact: ["time"],
                  severity: "medium",
                  probability: "medium",
                  response: "",
                  pic: "",
                  status: "open",
                })
              }
            >
              <Plus size={15} /> Risiko
            </button>
          )}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>RISIKO</th>
                <th>SEVERITY / PROBABILITY</th>
                <th>RESPONS</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.risks.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.risk}</strong>
                    <p>{r.impact.join(", ")}</p>
                  </td>
                  <td>
                    {r.severity} / {r.probability}
                  </td>
                  <td>
                    {r.response}
                    <p>{r.pic}</p>
                  </td>
                  <td>{r.status}</td>
                  <td>
                    {!readonly && (
                      <>
                        <button onClick={() => setEdit(r)}>Edit</button>
                        <button
                          aria-label="Hapus risiko"
                          onClick={() => {
                            if (
                              confirm(
                                "Hapus risiko ini? Simpan register untuk menerapkan perubahan.",
                              )
                            )
                              setData({
                                ...data,
                                risks: data.risks.filter((x) => x.id !== r.id),
                              });
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
        {!data.risks.length && (
          <p className="pmo-empty">
            Belum ada risiko. Tambahkan identifikasi dan rencana respons untuk
            proyek ini.
          </p>
        )}
      </section>
      <PaperView paper={paper} onError={onError} />
      {edit && (
        <Dialog title="Risiko proyek" onClose={() => setEdit(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setData({
                ...data,
                risks: data.risks.filter((r) => r.id !== edit.id).concat(edit),
              });
              setEdit(null);
            }}
          >
            <Field
              label="Identifikasi risiko"
              value={edit.risk}
              required
              onChange={(v) => setEdit({ ...edit, risk: v })}
            />
            <fieldset className="pmo-checkboxes">
              <legend>Dampak risiko</legend>
              {["scope", "time", "cost", "quality"].map((v) => (
                <label key={v}>
                  <input
                    type="checkbox"
                    checked={edit.impact.includes(v as Risk["impact"][number])}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        impact: e.target.checked
                          ? [...edit.impact, v as Risk["impact"][number]]
                          : edit.impact.filter((i) => i !== v),
                      })
                    }
                  />
                  {v}
                </label>
              ))}
            </fieldset>
            <div className="pmo-form-grid">
              <Field
                label="Severity"
                value={edit.severity}
                options={levels}
                onChange={(v) =>
                  setEdit({ ...edit, severity: v as Risk["severity"] })
                }
              />
              <Field
                label="Probability"
                value={edit.probability}
                options={levels}
                onChange={(v) =>
                  setEdit({ ...edit, probability: v as Risk["probability"] })
                }
              />
            </div>
            <Field
              label="Risk response plan"
              type="textarea"
              value={edit.response}
              required
              onChange={(v) => setEdit({ ...edit, response: v })}
            />
            <Field
              label="PIC risiko"
              value={edit.pic}
              onChange={(v) => setEdit({ ...edit, pic: v })}
            />
            <Field
              label="Status risiko"
              value={edit.status}
              options={["open", "mitigated", "closed"].map((v) => [v, v])}
              onChange={(v) =>
                setEdit({ ...edit, status: v as Risk["status"] })
              }
            />
            <button className="primary">Terapkan risiko</button>
            <p className="pmo-hint">
              Klik Simpan register untuk menyimpan ke server.
            </p>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function ActionsEditor({
  actions,
  onChange,
  readonly = false,
}: {
  actions: Action[];
  onChange: (a: Action[]) => void;
  readonly?: boolean;
}) {
  const change = (i: number, key: keyof Action, value: string) =>
    onChange(actions.map((a, j) => (i === j ? { ...a, [key]: value } : a)));
  return (
    <div className="pmo-actions-editor">
      <div className="pmo-toolbar">
        <h3>Tindak lanjut</h3>
        {!readonly && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              onChange(
                actions.concat({
                  id: uid(),
                  text: "",
                  pic: "",
                  due: today(),
                  status: "not_started",
                  side: "internal",
                }),
              )
            }
          >
            <Plus size={14} /> Tindak lanjut
          </button>
        )}
      </div>
      {actions.map((a, i) => (
        <div className="pmo-action-card" key={a.id}>
          <Field
            label={`Tindak lanjut ${i + 1}`}
            value={a.text}
            disabled={readonly}
            required
            onChange={(v) => change(i, "text", v)}
          />
          <div className="pmo-form-grid">
            <Field
              label={`PIC ${i + 1}`}
              value={a.pic}
              disabled={readonly}
              required
              onChange={(v) => change(i, "pic", v)}
            />
            <Field
              label={`Target ${i + 1}`}
              type="date"
              value={a.due}
              disabled={readonly}
              required
              onChange={(v) => change(i, "due", v)}
            />
            <Field
              label={`Status tindakan ${i + 1}`}
              value={a.status}
              disabled={readonly}
              options={["not_started", "in_progress", "pending", "done"].map(
                (v) => [v, v],
              )}
              onChange={(v) => change(i, "status", v)}
            />
            <Field
              label={`Pihak ${i + 1}`}
              value={a.side}
              disabled={readonly}
              options={[
                ["internal", "Internal"],
                ["external", "Eksternal"],
              ]}
              onChange={(v) => change(i, "side", v)}
            />
          </div>
          {!readonly && (
            <button
              type="button"
              className="text-button"
              onClick={() => onChange(actions.filter((x) => x.id !== a.id))}
            >
              Hapus tindakan
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
function Signature({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (s: string) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    drawing = useRef(false);
  useEffect(() => {
    const c = ref.current!,
      ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (value) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, c.width, c.height);
      image.src = value;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * 600) / r.width,
      ((e.clientY - r.top) * 150) / r.height,
    ];
  };
  return (
    <div className="pmo-signature">
      <span>Tanda tangan notulis (opsional)</span>
      <canvas
        ref={ref}
        width={600}
        height={150}
        aria-label="Area gambar tanda tangan"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          if (disabled) return;
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d")!,
            [x, y] = point(e);
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#1C2940";
          ctx.beginPath();
          ctx.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!,
            [x, y] = point(e);
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          if (drawing.current) {
            drawing.current = false;
            onChange(e.currentTarget.toDataURL("image/png"));
          }
        }}
      />
      {!disabled && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            const c = ref.current!;
            c.getContext("2d")!.clearRect(0, 0, 600, 150);
            onChange("");
          }}
        >
          Bersihkan tanda tangan
        </button>
      )}
      <small>
        Gambar ini merupakan bagian dokumen, bukan verifikasi tanda tangan
        digital.
      </small>
    </div>
  );
}
function businessDeadline() {
  const d = new Date(today() + "T12:00:00");
  let n = 2;
  while (n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n--;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function MomView({
  project,
  data,
  save,
  readonly,
  onError,
  markDirty,
}: {
  project: Project;
  data: { documents: Mom[] };
  save: (v: { documents: Mom[] }) => Promise<void>;
  readonly: boolean;
  onError: (s: string) => void;
  markDirty: () => void;
}) {
  const blank = (): Mom => ({
    id: uid(),
    number: number("MOM", data.documents.length),
    date: today(),
    purpose: "",
    start: "09:00",
    end: "10:00",
    location: "",
    online: "",
    internal: "",
    external: "",
    previous: "",
    results: "",
    notes: "",
    deadline: businessDeadline(),
    actions: [],
    notulis: "",
    approver: "",
    photos: [],
    signature: "",
  });
  const [mom, setMom] = useState<Mom>(data.documents[0] || blank());
  const change = (key: keyof Mom, value: unknown) => {
    setMom({ ...mom, [key]: value });
    markDirty();
  };
  const paper: Paper = {
    title: "Notulen Rapat / Minutes of Meeting",
    subtitle: `${mom.number} · ${project.name}`,
    sections: [
      {
        heading: "Informasi rapat",
        text: `Tujuan: ${mom.purpose}\nTanggal: ${labelDate(mom.date)}\nWaktu: ${mom.start}–${mom.end}\nLokasi: ${mom.location}\nOnline: ${mom.online}`,
      },
      {
        heading: "Peserta",
        text: `Internal:\n${mom.internal}\nEksternal:\n${mom.external}`,
      },
      { heading: "Hasil rapat sebelumnya", text: mom.previous },
      { heading: "Hasil rapat saat ini", text: mom.results },
      {
        heading: "Tindak lanjut",
        columns: ["Pihak", "Tindakan", "PIC", "Target", "Status"],
        rows: mom.actions.map((a) => [a.side, a.text, a.pic, a.due, a.status]),
      },
      {
        heading: "Catatan",
        text: `${mom.notes}\nBatas tanggapan: ${labelDate(mom.deadline)}`,
      },
      {
        heading: "Pengesahan",
        text: `Notulis: ${mom.notulis}\nDiketahui: ${mom.approver}`,
      },
    ],
    photos: [...mom.photos, ...(mom.signature ? [mom.signature] : [])],
  };
  async function photos(files: FileList | null) {
    if (!files) return;
    try {
      const pictures = [];
      for (const file of Array.from(files).slice(0, 3 - mom.photos.length)) {
        if (
          !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
          file.size > 5 * 1024 * 1024
        )
          throw new Error("Foto harus PNG/JPG/WebP maksimal 5 MB.");
        const image = await createImageBitmap(file),
          canvas = document.createElement("canvas"),
          ratio = Math.min(1, 600 / Math.max(image.width, image.height));
        canvas.width = Math.round(image.width * ratio);
        canvas.height = Math.round(image.height * ratio);
        canvas
          .getContext("2d")!
          .drawImage(image, 0, 0, canvas.width, canvas.height);
        image.close();
        const src = canvas.toDataURL("image/png");
        if (src.length > 300000)
          throw new Error("Foto terlalu detail; gunakan gambar lebih kecil.");
        pictures.push(src);
      }
      change("photos", [...mom.photos, ...pictures]);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <>
      <div className="panel pmo-toolbar">
        <Field
          label="Notulen tersimpan"
          value={data.documents.some((d) => d.id === mom.id) ? mom.id : ""}
          onChange={(v) => {
            const m = data.documents.find((d) => d.id === v);
            if (
              m &&
              confirm(
                "Buka notulen tersimpan? Isian yang belum disimpan akan diganti.",
              )
            )
              setMom(m);
          }}
          options={[
            ["", "Notulen baru"],
            ...data.documents.map((d) => [d.id, d.number] as [string, string]),
          ]}
        />
        {!readonly && (
          <button
            className="secondary"
            onClick={() => {
              if (confirm("Buat notulen baru?")) setMom(blank());
            }}
          >
            <Plus size={15} /> Notulen baru
          </button>
        )}
      </div>
      <div className="pmo-document-grid">
        <section className="panel pmo-section">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await save({
                  documents: data.documents
                    .filter((d) => d.id !== mom.id)
                    .concat(mom),
                });
              } catch (error) {
                onError((error as Error).message);
              }
            }}
          >
            <div className="pmo-form-grid">
              {(
                [
                  ["number", "Nomor notulen", "text"],
                  ["date", "Tanggal rapat", "date"],
                  ["purpose", "Tujuan rapat", "text"],
                  ["start", "Mulai", "time"],
                  ["end", "Selesai", "time"],
                  ["location", "Lokasi", "text"],
                  ["online", "Media online", "text"],
                  ["deadline", "Batas tanggapan", "date"],
                  ["notulis", "Nama notulis", "text"],
                  ["approver", "Diketahui oleh", "text"],
                ] as const
              ).map(([key, label, type]) => (
                <Field
                  key={key}
                  label={label}
                  value={mom[key]}
                  type={type}
                  disabled={readonly}
                  required={[
                    "number",
                    "date",
                    "purpose",
                    "start",
                    "end",
                    "notulis",
                    "approver",
                  ].includes(key)}
                  onChange={(v) => change(key, v)}
                />
              ))}
            </div>
            {(
              [
                ["internal", "Peserta internal"],
                ["external", "Peserta eksternal"],
                ["previous", "Hasil rapat sebelumnya"],
                ["results", "Hasil rapat saat ini"],
                ["notes", "Catatan / penutup"],
              ] as const
            ).map(([key, label]) => (
              <Field
                key={key}
                label={label}
                type="textarea"
                disabled={readonly}
                value={mom[key]}
                onChange={(v) => change(key, v)}
              />
            ))}
            <ActionsEditor
              actions={mom.actions}
              readonly={readonly}
              onChange={(v) => change("actions", v)}
            />
            <div className="pmo-photos">
              {mom.photos.map((src, i) => (
                <div key={i}>
                  <img src={src} alt={`Foto rapat ${i + 1}`} />
                  {!readonly && (
                    <button
                      type="button"
                      onClick={() =>
                        change(
                          "photos",
                          mom.photos.filter((_, j) => i !== j),
                        )
                      }
                    >
                      Hapus foto
                    </button>
                  )}
                </div>
              ))}
            </div>
            {!readonly && mom.photos.length < 3 && (
              <label className="pmo-field">
                Foto dokumentasi (maksimal 3)
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  multiple
                  onChange={(e) => photos(e.target.files)}
                />
              </label>
            )}
            <Signature
              key={mom.id}
              value={mom.signature}
              disabled={readonly}
              onChange={(v) => change("signature", v)}
            />
            {!readonly && (
              <div className="pmo-actions">
                <button className="primary">Simpan notulen</button>
                {data.documents.some((d) => d.id === mom.id) && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={async () => {
                      if (confirm("Hapus notulen tersimpan?"))
                        try {
                          await save({
                            documents: data.documents.filter(
                              (d) => d.id !== mom.id,
                            ),
                          });
                          setMom(blank());
                        } catch (error) {
                          onError((error as Error).message);
                        }
                    }}
                  >
                    Hapus notulen
                  </button>
                )}
              </div>
            )}
          </form>
        </section>
        <PaperView paper={paper} onError={onError} />
      </div>
    </>
  );
}
