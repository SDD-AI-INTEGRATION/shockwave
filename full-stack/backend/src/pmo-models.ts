import { z } from "zod";
import { schedule } from "./scheduling.ts";
const text = z.string().trim().max(10000);
const name = z.string().trim().min(1).max(250);
const pct = z.number().min(0).max(100);
const week = z.number().int().min(0).max(259);
const optionalDate = z.union([z.iso.date(), z.literal("")]);
const id = z.uuid();
export const actionSchema = z.object({
  id,
  text: name,
  pic: z.string().trim().min(1).max(150),
  due: z.iso.date(),
  status: z.enum(["not_started", "in_progress", "pending", "done"]),
  side: z.enum(["internal", "external"]).default("internal"),
});
export const taskSchema = z
  .object({
    id,
    name,
    weight: pct,
    start: week,
    duration: z.number().int().min(1).max(260),
    pattern: z.enum(["even", "custom"]),
    plan: z.array(pct).max(260),
    actual: z.record(z.string().regex(/^(0|[1-9]\d{0,2})$/), pct),
    dependencies: z.array(id).max(100).optional(),
    lag: z.number().int().min(0).max(52).optional(),
  })
  .superRefine((t, ctx) => {
    const values = Object.entries(t.actual).sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    );
    if (
      values.some(
        ([k, v], i) => Number(k) > 259 || (i > 0 && v < values[i - 1][1]),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Realisasi kumulatif harus meningkat atau tetap (W0–W259).",
      });
    if (
      t.pattern === "custom" &&
      (t.plan.length !== t.duration ||
        t.plan.at(-1) !== 100 ||
        t.plan.some((v, i) => i > 0 && v < t.plan[i - 1]))
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Rencana kustom harus kumulatif, sesuai durasi, dan berakhir 100%.",
      });
  });
export const issueSchema = z.object({
  id,
  task_id: z.union([id, z.literal("")]),
  category: z.enum(["scope", "time", "cost", "quality", "resource", "other"]),
  description: name,
  impact: z.enum(["low", "medium", "high"]),
  action: text,
  pic: z.string().max(150),
  due: optionalDate,
  status: z.enum(["open", "in_progress", "closed"]),
  week,
});
export const operationsSchema = z
  .object({
    phases: z
      .array(z.object({ id, name, tasks: z.array(taskSchema).max(200) }))
      .max(30),
    issues: z.array(issueSchema).max(300),
    reports: z.record(
      z.string().regex(/^(0|[1-9]\d{0,2})$/),
      z.object({ notes: text, done: text, todo: text, next: text }),
    ),
    baseline: z
      .array(z.object({ id, name, tasks: z.array(taskSchema).max(200) }))
      .max(30)
      .optional(),
  })
  .superRefine((o, ctx) => {
    const tasks = o.phases.flatMap((p) => p.tasks),
      ids = [...o.phases.map((p) => p.id), ...tasks.map((t) => t.id)];
    try {
      const graph = schedule(tasks);
      if (tasks.some((t) => graph.earliest[t.id] > t.start))
        ctx.addIssue({
          code: "custom",
          message:
            "Jadwal mendahului dependency. Gunakan Susun jadwal atau sesuaikan minggu mulai.",
        });
    } catch (e) {
      ctx.addIssue({ code: "custom", message: (e as Error).message });
    }
    if (tasks.length > 200)
      ctx.addIssue({ code: "custom", message: "Maksimal 200 subaktivitas." });
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "ID aktivitas harus unik." });
    if (
      tasks.length &&
      Math.abs(tasks.reduce((s, t) => s + t.weight, 0) - 100) > 0.01
    )
      ctx.addIssue({
        code: "custom",
        message: "Total bobot WBS harus 100% sebelum disimpan.",
      });
    if (
      o.issues.some((i) => i.task_id && !tasks.some((t) => t.id === i.task_id))
    )
      ctx.addIssue({
        code: "custom",
        message: "Aktivitas pada kendala tidak ditemukan.",
      });
  });
export const riskSchema = z.object({
  id,
  risk: name,
  impact: z
    .array(z.enum(["scope", "time", "cost", "quality"]))
    .min(1)
    .max(4),
  severity: z.enum(["low", "medium", "high"]),
  probability: z.enum(["low", "medium", "high"]),
  response: name,
  pic: z.string().max(150),
  status: z.enum(["open", "mitigated", "closed"]),
});
export const assignmentSchema = z.object({
  id,
  number: name,
  date: z.iso.date(),
  place: name,
  signer: name,
  signer_position: name,
  signer_unit: name,
  pm: name,
  pm_position: name,
  pm_unit: name,
  classification: z.enum(["Small", "Medium", "Big"]),
});
const image = z
  .string()
  .max(300000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const momSchema = z
  .object({
    id,
    number: name,
    date: z.iso.date(),
    purpose: name,
    start: time,
    end: time,
    location: text,
    online: text,
    internal: text,
    external: text,
    previous: text,
    results: text,
    notes: text,
    deadline: optionalDate,
    actions: z.array(actionSchema).max(100),
    notulis: name,
    approver: name,
    photos: z.array(image).max(3),
    signature: image.or(z.literal("")),
  })
  .refine((v) => v.end >= v.start, {
    message: "Waktu selesai harus setelah waktu mulai.",
  });
const unique = (rows: { id: string }[]) =>
  new Set(rows.map((v) => v.id)).size === rows.length;
export const moduleSchemas = {
  operations: operationsSchema,
  risks: z
    .object({
      prepared: name,
      date: z.iso.date(),
      risks: z.array(riskSchema).max(300),
    })
    .refine((v) => unique(v.risks), { message: "ID risiko harus unik." }),
  assignments: z
    .object({ letters: z.array(assignmentSchema).max(100) })
    .refine(
      (v) =>
        unique(v.letters) &&
        new Set(v.letters.map((l) => l.number)).size === v.letters.length,
      { message: "ID dan nomor surat harus unik." },
    ),
  mom: z
    .object({ documents: z.array(momSchema).max(50) })
    .refine(
      (v) =>
        unique(v.documents) &&
        new Set(v.documents.map((d) => d.number)).size === v.documents.length,
      { message: "ID dan nomor notulen harus unik." },
    ),
};
export type ModuleKind = keyof typeof moduleSchemas;
export type Operations = z.infer<typeof operationsSchema>;
export type Task = z.infer<typeof taskSchema>;
export type Risk = z.infer<typeof riskSchema>;
export type Assignment = z.infer<typeof assignmentSchema>;
export type Mom = z.infer<typeof momSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Issue = z.infer<typeof issueSchema>;
export function emptyModule(kind: ModuleKind) {
  if (kind === "operations") return { phases: [], issues: [], reports: {} };
  if (kind === "risks") return { prepared: "", date: "", risks: [] };
  if (kind === "assignments") return { letters: [] };
  return { documents: [] };
}
export function actualAt(task: Task, week: number) {
  return (
    Object.entries(task.actual)
      .filter(([k]) => Number(k) <= week)
      .sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1] || 0
  );
}
export function planAt(task: Task, week: number) {
  if (week < task.start) return 0;
  if (week >= task.start + task.duration) return 100;
  return task.pattern === "custom"
    ? task.plan[week - task.start]
    : ((week - task.start + 1) / task.duration) * 100;
}
export function metrics(o: Operations, week: number) {
  const tasks = o.phases.flatMap((p) => p.tasks);
  const plan = tasks.reduce(
      (s, t) => s + (t.weight * planAt(t, week)) / 100,
      0,
    ),
    actual = tasks.reduce(
      (s, t) => s + (t.weight * actualAt(t, week)) / 100,
      0,
    );
  return {
    plan: Math.round(plan * 100) / 100,
    actual: Math.round(actual * 100) / 100,
    deviation: Math.round((actual - plan) * 100) / 100,
    weight: Math.round(tasks.reduce((s, t) => s + t.weight, 0) * 100) / 100,
  };
}
export const reviewSchema = z
  .object({
    review: z.enum(["pending", "updated", "unchanged"]),
    health: z.enum(["unrated", "on_track", "attention", "critical"]),
    summary: text,
    items: z
      .array(
        z.object({
          type: z.enum(["progress", "resource", "revenue", "issue"]),
          text: name,
        }),
      )
      .max(50),
    actions: z.array(actionSchema).max(100),
  })
  .refine(
    (v) =>
      v.review !== "updated" ||
      !!(v.summary || v.items.length || v.actions.length),
    {
      message:
        "Review diperbarui harus memiliki ringkasan, pembaruan, atau tindak lanjut.",
    },
  );
export type Review = z.infer<typeof reviewSchema>;
export const meetingInfoSchema = z.object({
  title: name,
  date: z.iso.date(),
  moderator: z.string().trim().max(150),
  notulis: z.string().trim().max(150),
  participants: text,
  notes: text,
});
export const meetingCreateSchema = meetingInfoSchema
  .extend({
    project_ids: z.array(id).min(1).max(100),
    previous_id: id.nullable().default(null),
  })
  .refine((v) => new Set(v.project_ids).size === v.project_ids.length, {
    message: "Proyek tidak boleh duplikat.",
  });
export function reviewText(review: Review) {
  return [
    review.summary,
    ...review.items.map((i) => `${i.type}: ${i.text}`),
    ...review.actions.map((a) => `${a.text} — ${a.pic}; ${a.due}; ${a.status}`),
  ]
    .filter(Boolean)
    .join("\n");
}
