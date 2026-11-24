"use client";
import { useEffect, useState } from "react";
import { Download, Save } from "lucide-react";
import {
  type Operations,
  type ModuleKind,
  type Risk,
  type Assignment,
  type Mom,
  operationsSchema,
} from "../../../backend/src/pmo-models";
import { api, type Project, type User, money } from "./client";
import { CorporateMeetings } from "./meetings";
import { OperationsView } from "./operations";
import { AssignmentsView, MomView, RisksView } from "./documents";
import { Field } from "./ui";
import { exportProjects } from "./exports";
import { ProjectAssistant } from "./assistant";
import {DocumentCenter} from './document-center';
import { ChangeRequestsView, ClosureView, FinanceView } from "./project-views";
const projectPages: Record<string, string> = {
  "Change Request": "Perubahan scope, timeline, biaya, dan PIC beserta riwayat baseline.",
  "Keuangan & Termin": "Nilai kontrak, termin penagihan, BAST, invoice, dan pembayaran.",
  "Penutupan Proyek": "Checklist penutupan, serah terima, dan lessons learned.",
};
export const pmoPages = [
  "Corporate Meeting",
  "PM Assignment",
  "Risk Register",
  "WBS",
  "Timeline WBS",
  "Laporan",
  "MOM",
  "Dokumen & OCR",
  ...Object.keys(projectPages),
];
type RiskData = { prepared: string; date: string; risks: Risk[] };
type ModuleData =
  Operations | RiskData | { letters: Assignment[] } | { documents: Mom[] };
export function PmoSuite({
  page,
  projects,
  user,
  onUpdated,
  onDirty,
}: {
  page: string;
  projects: Project[];
  user: User;
  onUpdated: () => Promise<void>;
  onDirty: (v: boolean) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id || ""),
    [dirty, setDirty] = useState(false);
  const mark = (value: boolean) => {
    setDirty(value);
    onDirty(value);
  };
  const project = projects.find((p) => p.id === projectId) || projects[0];
  if (page === "Corporate Meeting")
    return (
      <CorporateMeetings projects={projects} user={user} onDirty={onDirty} />
    );
  const kind: ModuleKind = ["WBS", "Timeline WBS", "Laporan"].includes(page)
    ? "operations"
    : page === "Risk Register"
      ? "risks"
      : page === "PM Assignment"
        ? "assignments"
        : "mom";
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow blue">
            PMO / {kind === "operations" || projectPages[page] ? "OPERATIONS" : "GOVERNANCE"}
          </div>
          <h1>{page}</h1>
          <p>
            {projectPages[page] ||
              (kind === "operations"
                ? "WBS, jadwal, dan realisasi menggunakan satu sumber data proyek."
                : "Dokumen dan catatan tersimpan sesuai akses proyek Anda.")}
          </p>
        </div>
        <Field
          label="Proyek aktif"
          value={project?.id || ""}
          options={projects.map((p) => [p.id, `${p.code} · ${p.name}`])}
          onChange={(v) => {
            if (
              !dirty ||
              confirm(
                "Ganti proyek dan tinggalkan perubahan yang belum disimpan?",
              )
            ) {
              setProjectId(v);
              mark(false);
            }
          }}
        />
      </div>
      {!project ? (
        <div className="panel pmo-empty">
          Buat proyek terlebih dahulu melalui menu Proyek.
        </div>
      ) : (
        <>
          {page === "Keuangan & Termin" ? (
            <FinanceView key={project.id} project={project} user={user} />
          ) : page === "Change Request" ? (
            <ChangeRequestsView key={project.id} project={project} user={user} />
          ) : page === "Penutupan Proyek" ? (
            <ClosureView key={project.id} project={project} user={user} onUpdated={onUpdated} />
          ) : page==='Dokumen & OCR'?<DocumentCenter key={project.id} project={project} user={user}/>:<><ProjectAssistant key={project.id} project={project} />
          <ProjectModule
            key={`${project.id}:${kind}`}
            project={project}
            kind={kind}
            page={page}
            user={user}
            onUpdated={onUpdated}
            onDirty={mark}
          />
          </>}
        </>
      )}
    </>
  );
}
function ProjectModule({
  project,
  kind,
  page,
  user,
  onUpdated,
  onDirty,
}: {
  project: Project;
  kind: ModuleKind;
  page: string;
  user: User;
  onUpdated: () => Promise<void>;
  onDirty: (v: boolean) => void;
}) {
  // Each module has its own validated schema at the API boundary.
  const [data, setSaved] = useState<ModuleData | null>(null),
    [version, setVersion] = useState(0),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [saving, setSaving] = useState(false);
  const mark = (v: boolean) => {
    setDirty(v);
    onDirty(v);
  };
  useEffect(() => {
    let active = true;
    api(`/projects/${project.id}/modules/${kind}`)
      .then((result) => {
        if (active) {
          setSaved(result.data);
          setVersion(result.version);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      onDirty(false);
    };
  }, [project.id, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    onDirty(dirty);
  }, [page, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const setData = (value: ModuleData) => {
    setSaved(value);
    mark(true);
    setMessage("");
  };
  async function save(value: ModuleData = data!) {
    setSaving(true);
    setError("");
    try {
      if (kind === "operations") {
        const parsed = operationsSchema.safeParse(value);
        if (!parsed.success)
          throw new Error(parsed.error.issues.map((i) => i.message).join(" "));
      }
      const result = await api(`/projects/${project.id}/modules/${kind}`, {
        method: "PUT",
        body: JSON.stringify({ version, data: value }),
      });
      setSaved(result.data);
      setVersion(result.version);
      mark(false);
      setMessage("Perubahan tersimpan di server.");
      await onUpdated();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setSaving(false);
    }
  }
  if (!data)
    return (
      <div className="panel pmo-empty">{error || "Memuat data proyek…"}</div>
    );
  const readonly = user.role === "viewer";
  return (
    <>
      <div className="pmo-save-status" role="status">
        <span>
          {dirty
            ? "● Perubahan belum disimpan"
            : message || `Versi ${version} · Data tersimpan di server`}
        </span>
        {readonly && <span>Akses hanya baca</span>}
      </div>
      {error && kind !== "operations" && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {kind === "operations" ? (
        <OperationsView
          project={project}
          data={data as Operations}
          setData={setData}
          save={save}
          readonly={readonly}
          tab={page}
          user={user}
          error={error}
          setError={setError}
          saving={saving}
        />
      ) : kind === "risks" ? (
        <RisksView
          project={project}
          data={data as RiskData}
          setData={setData}
          save={() => save()}
          readonly={readonly}
          onError={setError}
        />
      ) : kind === "assignments" ? (
        <AssignmentsView
          project={project}
          data={data as { letters: Assignment[] }}
          save={save}
          readonly={readonly}
          onError={setError}
          markDirty={() => mark(true)}
        />
      ) : (
        <MomView
          project={project}
          data={data as { documents: Mom[] }}
          save={save}
          readonly={readonly}
          onError={setError}
          markDirty={() => mark(true)}
        />
      )}
    </>
  );
}
export function PortfolioTools({
  projects,
  filtered,
  user,
  pillar,
  onPillar,
  revenueOnly,
  onRevenueOnly,
  onUpdated,
}: {
  projects: Project[];
  filtered: Project[];
  user: User;
  pillar: string;
  onPillar: (v: string) => void;
  revenueOnly: boolean;
  onRevenueOnly: (v: boolean) => void;
  onUpdated: () => Promise<void>;
}) {
  const [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const p = projects.find((p) => p.id === selected),
    forecast = projects.reduce(
      (s, p) => s + Number(p.revenue_forecast || 0),
      0,
    ),
    actual = projects.reduce((s, p) => s + Number(p.revenue_actual || 0), 0);
  return (
    <div className="pmo-portfolio">
      <div className="pmo-metrics">
        <div className="panel">
          <span>Prognosa pendapatan</span>
          <strong>{money(forecast)}</strong>
        </div>
        <div className="panel">
          <span>Realisasi pendapatan</span>
          <strong>{money(actual)}</strong>
          <small>
            {forecast ? ((actual / forecast) * 100).toFixed(1) : 0}% dari
            prognosa
          </small>
        </div>
      </div>
      <div className="panel pmo-toolbar">
        <Field
          label="Filter pilar"
          value={pillar}
          onChange={onPillar}
          options={[
            ["", "Semua pilar"],
            ...Array.from(
              new Set(projects.map((p) => p.pillar).filter(Boolean)),
            ).map((v) => [v!, v!] as [string, string]),
          ]}
        />
        <label className="pmo-check">
          <input
            type="checkbox"
            checked={revenueOnly}
            onChange={(e) => onRevenueOnly(e.target.checked)}
          />{" "}
          Memiliki realisasi pendapatan
        </label>
        <button
          className="secondary"
          onClick={() =>
            exportProjects(filtered).catch((e) => setError(e.message))
          }
        >
          <Download size={15} /> Ekspor Excel
        </button>
      </div>
      {user.role !== "viewer" && (
        <details className="panel pmo-section">
          <summary>Kelola pilar dan pendapatan proyek</summary>
          <p>Data dimasukkan oleh PMO. Integrasi SIMPRO belum dikonfigurasi.</p>
          <Field
            label="Proyek untuk metadata"
            value={selected}
            onChange={setSelected}
            options={[
              ["", "Pilih proyek"],
              ...projects.map((p) => [p.id, p.name] as [string, string]),
            ]}
          />
          {p && (
            <MetadataEditor
              key={p.id + String(p.revenue_actual) + p.pillar}
              project={p}
              busy={busy}
              onSave={async (data) => {
                setBusy(true);
                try {
                  await api(`/projects/${p.id}/metadata`, {
                    method: "PATCH",
                    body: JSON.stringify(data),
                  });
                  setError("");
                  await onUpdated();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </details>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
function MetadataEditor({
  project: p,
  onSave,
  busy,
}: {
  project: Project;
  onSave: (data: unknown) => Promise<void>;
  busy: boolean;
}) {
  const [data, setData] = useState({
    pillar: p.pillar || "",
    sub_pillar: p.sub_pillar || "",
    revenue_forecast: Number(p.revenue_forecast) || 0,
    revenue_actual: Number(p.revenue_actual) || 0,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(data);
      }}
    >
      <div className="pmo-form-grid">
        <Field
          label="Pilar"
          value={data.pillar}
          maxLength={100}
          onChange={(v) => setData({ ...data, pillar: v })}
        />
        <Field
          label="Sub pilar"
          value={data.sub_pillar}
          maxLength={100}
          onChange={(v) => setData({ ...data, sub_pillar: v })}
        />
        <Field
          label="Prognosa (Rp)"
          type="number"
          value={data.revenue_forecast}
          onChange={(v) => setData({ ...data, revenue_forecast: Number(v) })}
        />
        <Field
          label="Realisasi (Rp)"
          type="number"
          value={data.revenue_actual}
          onChange={(v) => setData({ ...data, revenue_actual: Number(v) })}
        />
      </div>
      <button className="primary" disabled={busy}>
        <Save size={15} /> Simpan metadata
      </button>
    </form>
  );
}
