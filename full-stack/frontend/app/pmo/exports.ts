import {
  operationsSchema,
  planAt,
  type Operations,
} from "../../../backend/src/pmo-models";
import { type Project, iso, weekCount } from "./client";
import { SDD_LOGO } from "./logo";
export type Paper = {
  title: string;
  subtitle: string;
  status?: string;
  sections: {
    heading: string;
    text?: string;
    columns?: string[];
    rows?: string[][];
  }[];
  photos?: string[];
};
const escape = (value: string) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function printPaper(paper: Paper) {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) throw new Error("Izinkan pop-up untuk cetak/PDF.");
  w.opener = null;
  const html = paper.sections
    .map(
      (s) =>
        `<section><h2>${escape(s.heading)}</h2>${s.text ? `<p>${escape(s.text).replaceAll("\n", "<br>")}</p>` : ""}${s.rows ? `<table><thead><tr>${s.columns!.map((c) => `<th>${escape(c)}</th>`).join("")}</tr></thead><tbody>${s.rows.map((row) => `<tr>${row.map((c) => `<td>${escape(c).replaceAll("\n", "<br>")}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}</section>`,
    )
    .join("");
  w.document.write(
    `<!doctype html><html lang="id"><head><title>${escape(paper.title)}</title><style>@page{size:A4;margin:16mm}body{font:11pt/1.5 Arial,sans-serif;color:#1C2940;max-width:1000px;margin:30px auto}header{border-bottom:3px solid #2031A7;padding-bottom:15px}img.logo{width:135px}h1{font-size:20pt;color:#000A50}h2{font-size:12pt;color:#132583;background:#F2F5FF;padding:8px}p,td{white-space:normal;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse}th,td{border:1px solid #C5D0E2;padding:7px;text-align:left;vertical-align:top}th{background:#E8EEFF}tr{break-inside:avoid}footer{margin-top:24px;font-size:9pt;color:#526079}.photos img{width:45%;margin:2%}@media print{body{margin:0}button{display:none}}</style></head><body><header><img class="logo" src="${SDD_LOGO}" alt="SDD"><h1>${escape(paper.title)}</h1><p>${escape(paper.subtitle)}</p><strong>${escape(paper.status || "")}</strong></header>${html}<div class="photos">${(paper.photos || []).map((src) => `<img src="${src}" alt="Dokumentasi">`).join("")}</div><footer>PT Swadharma Duta Data · PMO</footer></body></html>`,
  );
  w.document.close();
  Promise.all(
    Array.from(w.document.images).map((img) => img.decode().catch(() => {})),
  ).then(() => {
    w.focus();
    w.print();
  });
}
export async function wordPaper(paper: Paper) {
  const D = await import("docx");
  const children: (
    InstanceType<typeof D.Paragraph> | InstanceType<typeof D.Table>
  )[] = [];
  const image = (src: string, width: number, height: number) =>
    new D.Paragraph({
      children: [
        new D.ImageRun({
          type: "png",
          data: Uint8Array.from(atob(src.split(",")[1]), (c) =>
            c.charCodeAt(0),
          ),
          transformation: { width, height },
        }),
      ],
    });
  children.push(
    image(SDD_LOGO, 145, 64),
    new D.Paragraph({ text: paper.title, heading: D.HeadingLevel.TITLE }),
    new D.Paragraph(paper.subtitle),
    new D.Paragraph(paper.status || ""),
  );
  for (const s of paper.sections) {
    children.push(
      new D.Paragraph({ text: s.heading, heading: D.HeadingLevel.HEADING_2 }),
    );
    if (s.text)
      for (const line of s.text.split("\n"))
        children.push(new D.Paragraph(line));
    if (s.rows)
      children.push(
        new D.Table({
          width: { size: 100, type: D.WidthType.PERCENTAGE },
          rows: [s.columns!, ...s.rows].map(
            (row, i) =>
              new D.TableRow({
                tableHeader: i === 0,
                children: row.map(
                  (text) =>
                    new D.TableCell({
                      shading: i === 0 ? { fill: "E8EEFF" } : undefined,
                      children: text.split("\n").map((v) => new D.Paragraph(v)),
                    }),
                ),
              }),
          ),
        }),
      );
  }
  for (const photo of paper.photos || []) children.push(image(photo, 380, 250));
  download(
    await D.Packer.toBlob(new D.Document({ sections: [{ children }] })),
    `${paper.title.replace(/[^a-z0-9 -]/gi, "_")}.docx`,
  );
}
type SheetRows = (string | number | null)[][];
async function writeWorkbook(
  sheets: Record<string, SheetRows>,
  fileName: string,
) {
  const { default: writeExcel } = await import("write-excel-file/browser");
  const data = Object.entries(sheets).map(([sheet, rows]) => ({
    sheet,
    data: rows.map((r, i) =>
      r.map((value) =>
        i === 0
          ? {
              value: value ?? "",
              fontWeight: "bold" as const,
              textColor: "#132583",
              backgroundColor: "#E8EEFF",
            }
          : value,
      ),
    ),
    columns: Array.from(
      { length: Math.max(1, ...rows.map((r) => r.length)) },
      () => ({ width: 24 }),
    ),
    stickyRowsCount: 1,
  }));
  download(await writeExcel(data).toBlob(), fileName);
}
export async function paperExcel(paper: Paper) {
  const sheets: Record<string, SheetRows> = {
    Document: [
      ["Document", "Value"],
      ["Title", paper.title],
      ["Subtitle", paper.subtitle],
      ["Status", paper.status || ""],
    ],
  };
  paper.sections.forEach((s, i) => {
    sheets[
      (String(i + 1) + " " + s.heading)
        .replace(/[\\/?*\[\]:]/g, " ")
        .slice(0, 31)
    ] = s.rows
      ? [s.columns!, ...s.rows]
      : [
          ["Section", "Content"],
          [s.heading, s.text || ""],
        ];
  });
  await writeWorkbook(
    sheets,
    paper.title.replace(/[^a-z0-9 -]/gi, "_") + ".xlsx",
  );
}
export async function exportProjects(projects: Project[]) {
  await writeWorkbook(
    {
      Projects: [
        [
          "Kode",
          "Proyek",
          "Pelanggan",
          "PM",
          "Pilar",
          "Sub Pilar",
          "Mulai",
          "Selesai",
          "Progres",
          "Status",
          "Prognosa",
          "Realisasi",
        ],
        ...projects.map((p) => [
          p.code,
          p.name,
          p.customer,
          p.manager_name,
          p.pillar || "",
          p.sub_pillar || "",
          iso(p.start_date),
          iso(p.end_date),
          p.progress,
          p.status,
          Number(p.revenue_forecast) || 0,
          Number(p.revenue_actual) || 0,
        ]),
      ],
    },
    "Portofolio_Proyek.xlsx",
  );
}
export async function operationsExcel(
  project: Project,
  operations: Operations,
  template = false,
) {
  const weeks = weekCount(project);
  const w: SheetRows = [["ID", "Level", "No", "Activity Name", "Weight (%)"]];
  const tl: SheetRows = [
    [
      "ID",
      "Level",
      "No",
      "Activity Name",
      "Weight (%)",
      "Start Week",
      "Duration",
      "Pattern",
      "Dependencies",
      "Lag",
      ...Array.from({ length: weeks }, (_, k) => `W${k}`),
    ],
  ];
  const a: SheetRows = [
    [
      "ID",
      "Level",
      "No",
      "Activity Name",
      "Weight (%)",
      ...Array.from({ length: weeks }, (_, k) => `W${k}`),
    ],
  ];
  if (!template)
    operations.phases.forEach((p, i) => {
      w.push([
        p.id,
        "Activity",
        String(i + 1),
        p.name,
        p.tasks.reduce((s, t) => s + t.weight, 0),
      ]);
      p.tasks.forEach((t, j) => {
        const no = `${i + 1}-${j + 1}`;
        w.push([t.id, "Sub Activity", no, t.name, t.weight]);
        tl.push([
          t.id,
          "Sub Activity",
          no,
          t.name,
          t.weight,
          t.start,
          t.duration,
          t.pattern,
          (t.dependencies||[]).join(';'),
          t.lag||0,
          ...Array.from({ length: weeks }, (_, k) => planAt(t, k)),
        ]);
        a.push([
          t.id,
          "Sub Activity",
          no,
          t.name,
          t.weight,
          ...Array.from({ length: weeks }, (_, k) => t.actual[k] ?? null),
        ]);
      });
    });
  const issues: SheetRows = [
    [
      "ID",
      "Task ID",
      "Category",
      "Description",
      "Impact",
      "Action",
      "PIC",
      "Due Date",
      "Status",
      "Week",
    ],
  ];
  if (!template)
    operations.issues.forEach((i) =>
      issues.push([
        i.id,
        i.task_id,
        i.category,
        i.description,
        i.impact,
        i.action,
        i.pic,
        i.due,
        i.status,
        i.week,
      ]),
    );
  const reports: SheetRows = [["Week", "Notes", "Done", "Todo", "Next"]];
  if (!template)
    Object.entries(operations.reports).forEach(([k, r]) =>
      reports.push([Number(k), r.notes, r.done, r.todo, r.next]),
    );
  await writeWorkbook(
    {
      Project: [
        ["Field", "Value"],
        ["Code", project.code],
        ["Project Name", project.name],
        ["Start Date", iso(project.start_date)],
        ["End Date", iso(project.end_date)],
      ],
      WBS: w,
      Timeline: tl,
      Actual: a,
      Issues: issues,
      Reports: reports,
      Guide: [
        ["Panduan"],
        [
          "Tambahkan Activity dan Sub Activity di WBS; bobot total subaktivitas harus 100%. ID boleh kosong untuk baris baru.",
        ],
        [
          "Start Week dimulai W0. Pattern even/custom. Kolom W berisi rencana kumulatif.",
        ],
        [
          "Actual 0–100 tidak boleh menurun; sel kosong meneruskan realisasi minggu sebelumnya.",
        ],
        [
          "Code proyek harus sama dengan proyek aktif. Seluruh impor divalidasi sebelum disimpan.",
        ],
        [
          "Template kosong: isi WBS, Timeline, dan Actual. Jangan mengubah nama kolom.",
        ],
      ],
    },
    `${template ? "Template" : "Operations"}_${project.code}.xlsx`,
  );
}
export async function importOperations(
  file: File,
  project: Project,
): Promise<Operations> {
  if (file.size > 5 * 1024 * 1024)
    throw new Error("Maksimal ukuran workbook 5 MB.");
  const { default: readExcel } = await import("read-excel-file/browser");
  const sheets = await readExcel(file);
  function rows(name: string) {
    const sheet = sheets.find((s) => s.sheet === name);
    if (!sheet) return [];
    if (sheet.data.length > 2000)
      throw new Error(`${name}: maksimal 2.000 baris.`);
    const headerIndex = sheet.data.findIndex(
      (row) =>
        row.some((v) => String(v || "") === "Level") ||
        row.some((v) =>
          ["Field", "Description", "Issue ID", "Week", "ID"].includes(
            String(v || ""),
          ),
        ),
    );
    if (headerIndex < 0) {
      if (["WBS", "Timeline", "Actual"].includes(name))
        throw new Error(`${name}: header workbook tidak dikenali.`);
      return [];
    }
    const headers = sheet.data[headerIndex].map((v) =>
      String(v || "")
        .split("\n")[0]
        .trim()
        .replace("ID (system)", "ID")
        .replace("Duration (weeks)", "Duration")
        .replace("Issue ID", "ID")
        .replace("Activity (No)", "Task ID")
        .replace("Target Date", "Due Date")
        .replace("Target", "Due Date"),
    );
    const body = sheet.data.slice(headerIndex + 1);
    return body.map((row) => {
      const item: Record<string, unknown> = {};
      headers.forEach((h, i) => {
        const v = row[i];
        item[String(h || "")] =
          v instanceof Date ? v.toISOString().slice(0, 10) : (v ?? "");
      });
      return item;
    });
  }
  const projectRows = rows("Project"),
    code = projectRows.find((r) => r.Field === "Code")?.Value;
  if (code && code !== project.code)
    throw new Error("Workbook berasal dari kode proyek berbeda.");
  if (!sheets.some((s) => s.sheet === "WBS"))
    throw new Error("Sheet WBS wajib tersedia.");
  const result: Operations = { phases: [], issues: [], reports: {} },
    map = new Map<string, string>();
  const key = (raw: unknown) => {
    const s = String(raw || "");
    if (
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s)
    )
      return s;
    if (!s) return crypto.randomUUID();
    if (!map.has(s)) map.set(s, crypto.randomUUID());
    return map.get(s)!;
  };
  const n = (v: unknown) => {
    if (v === "" || v === null || v === undefined) return 0;
    const num = Number(String(v).replace(",", ".").replace(/^W/i, ""));
    if (!Number.isFinite(num))
      throw new Error(`Angka tidak valid: ${String(v)}`);
    return num;
  };
  const tasks = new Map<
    string,
    Operations["phases"][number]["tasks"][number]
  >();
  for (const row of rows("WBS")) {
    const level = String(row.Level).toLowerCase();
    if (!row["Activity Name"]) continue;
    if (level === "activity")
      result.phases.push({
        id: key(row.ID),
        name: String(row["Activity Name"]),
        tasks: [],
      });
    else if (level.replaceAll(" ", "") === "subactivity") {
      const phase = result.phases.at(-1);
      if (!phase)
        throw new Error("Sub Activity harus berada di bawah Activity.");
      const task = {
        id: key(row.ID),
        name: String(row["Activity Name"]),
        weight: n(row["Weight (%)"]),
        start: 0,
        duration: 1,
        pattern: "even" as const,
        plan: [],
        actual: {},
      };
      phase.tasks.push(task);
      tasks.set(String(row.ID || row.No), task);
      if (row.No) tasks.set(String(row.No), task);
    } else if (String(row["Activity Name"]).toLowerCase() !== "total")
      throw new Error("Level WBS harus Activity atau Sub Activity.");
  }
  for (const row of rows("Timeline")) {
    const t = tasks.get(String(row.ID || row.No));
    if (!t) continue;
    t.start = n(row["Start Week"]);
    t.duration = n(row.Duration) || 1;
    t.dependencies=String(row.Dependencies||'').split(';').map(s=>s.trim()).filter(Boolean).map(key);
    t.lag=n(row.Lag);
    t.pattern =
      String(row.Pattern).toLowerCase() === "custom" ? "custom" : "even";
    if (t.pattern === "custom")
      t.plan = Array.from({ length: t.duration }, (_, i) =>
        n(row[`W${t.start + i}`]),
      );
  }
  for (const row of rows("Actual")) {
    const t = tasks.get(String(row.ID || row.No));
    if (t)
      for (const k of Object.keys(row).filter((k) => /^W\d+$/.test(k)))
        if (row[k] !== "") t.actual[k.slice(1)] = n(row[k]);
  }
  result.issues = rows("Issues")
    .filter((r) => r.Description)
    .map((r) => ({
      id: key(r.ID),
      task_id: r["Task ID"]
        ? tasks.get(String(r["Task ID"]))?.id || key(r["Task ID"])
        : "",
      category:
        (
          {
            Technical: "quality",
            Resources: "resource",
            Infrastructure: "resource",
            Vendor: "resource",
            "User / Business": "scope",
          } as Record<string, string>
        )[String(r.Category)] || String(r.Category || "other").toLowerCase(),
      description: String(r.Description),
      impact: String(r.Impact || "medium").toLowerCase(),
      action: String(r.Action || ""),
      pic: String(r.PIC || ""),
      due: String(r["Due Date"] || ""),
      status: String(r.Status || "open")
        .toLowerCase()
        .replaceAll(" ", "_"),
      week: n(r.Week),
    })) as Operations["issues"];
  for (const row of rows("Reports"))
    if (row.Week !== "")
      result.reports[String(n(row.Week))] = {
        notes: String(row.Notes || ""),
        done: String(row.Done || ""),
        todo: String(row.Todo || ""),
        next: String(row.Next || ""),
      };
  if (!result.phases.some((p) => p.tasks.length))
    throw new Error(
      "Workbook harus memiliki Activity dan Sub Activity. Impor kosong tidak diterapkan.",
    );
  const parsed = operationsSchema.safeParse(result);
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((i) => i.message).join(" "));
  return parsed.data;
}
