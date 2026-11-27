"use client";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import {
  actualAt,
  planAt,
  type Operations,
  type Risk,
} from "../../../backend/src/pmo-models";
import { api, type Project, today, iso, money } from "./client";
import { Field } from "./ui";
export function ProjectAssistant({ project }: { project: Project }) {
  const [query, setQuery] = useState("Ringkasan proyek"),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false);
  async function ask(question = query) {
    setBusy(true);
    setQuery(question);
    try {
      const [o, r] = await Promise.all([
        api(`/projects/${project.id}/modules/operations`),
        api(`/projects/${project.id}/modules/risks`),
      ]);
      const ops = o.data as Operations,
        risks = r.data.risks as Risk[],
        tasks = ops.phases.flatMap((p) => p.tasks),
        q = question.toLowerCase();
      const week = Math.max(
        0,
        Math.min(
          259,
          Math.floor(
            (new Date(today()).getTime() -
              new Date(iso(project.start_date)).getTime()) /
              604800000,
          ),
        ),
      );
      if (/buat|hapus|ubah|simpan/.test(q))
        setAnswer(
          "Gunakan form modul terkait untuk mengubah data. Asisten ini hanya membaca data tersimpan.",
        );
      else if (/risiko|risk/.test(q))
        setAnswer(
          risks
            .filter((x) => x.status !== "closed")
            .map(
              (x) =>
                `${x.risk} · ${x.severity}/${x.probability}\nRespons: ${x.response}\nPIC: ${x.pic || "belum diisi"}`,
            )
            .join("\n\n") || "Belum ada risiko aktif yang tersimpan.",
        );
      else if (/kendala|issue/.test(q))
        setAnswer(
          ops.issues
            .filter((x) => x.status !== "closed")
            .map(
              (x) =>
                `${x.description}\nTindakan: ${x.action || "belum diisi"} · PIC: ${x.pic || "belum diisi"} · Target: ${x.due || "belum diisi"}`,
            )
            .join("\n\n") || "Belum ada kendala aktif yang tersimpan.",
        );
      else if (/target|minggu|next/.test(q))
        setAnswer(
          tasks
            .filter((t) => planAt(t, week + 1) > actualAt(t, week))
            .map(
              (t) =>
                `${t.name}: aktual ${actualAt(t, week)}%, target W${week + 1} ${planAt(t, week + 1).toFixed(1)}%`,
            )
            .join("\n") ||
            "Belum ada target WBS yang melebihi realisasi saat ini.",
        );
      else if (/pendapatan|revenue/.test(q))
        setAnswer(
          `Prognosa: ${money(project.revenue_forecast)}\nRealisasi: ${money(project.revenue_actual)}`,
        );
      else
        setAnswer(
          `${project.code} · ${project.name}\nPelanggan: ${project.customer}\nPM: ${project.manager_name}\nProgres portofolio: ${project.progress}%\n${tasks.length} subaktivitas WBS · ${risks.filter((x) => x.status !== "closed").length} risiko aktif · ${ops.issues.filter((x) => x.status !== "closed").length} kendala aktif.`,
        );
    } catch (e) {
      setAnswer((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="panel pmo-section pmo-assistant">
      <summary>
        <MessageCircle size={16} /> Asisten PMO · data lokal
      </summary>
      <p>
        Ringkasan berbasis aturan dari data proyek tersimpan. Tidak menggunakan
        model AI atau layanan eksternal.
      </p>
      <div className="pmo-toolbar">
        {[
          "Ringkasan proyek",
          "Risiko",
          "Kendala",
          "Target minggu depan",
          "Pendapatan",
        ].map((q) => (
          <button
            key={q}
            className="secondary"
            disabled={busy}
            onClick={() => ask(q)}
          >
            {q}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <Field label="Pertanyaan asisten" value={query} onChange={setQuery} />
        <button className="primary" disabled={busy}>
          {busy ? "Membaca data…" : "Lihat jawaban"}
        </button>
      </form>
      {answer && (
        <p className="pmo-assistant-answer" role="status">
          {answer}
        </p>
      )}
    </details>
  );
}
