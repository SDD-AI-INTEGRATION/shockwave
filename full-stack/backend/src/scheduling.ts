export type GraphTask = {
  id: string;
  name?: string;
  start: number;
  duration: number;
  dependencies?: string[];
  lag?: number;
};
export function schedule(tasks: GraphTask[]) {
  const byId = new Map(tasks.map((t) => [t.id, t])),
    visiting = new Set<string>(),
    done = new Set<string>(),
    order: string[] = [],
    earliest: Record<string, number> = {},
    latest: Record<string, number> = {};
  function visit(id: string) {
    if (visiting.has(id)) throw new Error("Dependency membentuk siklus.");
    if (done.has(id)) return;
    const t = byId.get(id);
    if (!t) throw new Error("Dependency tidak ditemukan.");
    visiting.add(id);
    let start = t.start;
    for (const dependency of t.dependencies || []) {
      visit(dependency);
      const previous = byId.get(dependency)!;
      start = Math.max(
        start,
        earliest[dependency] + previous.duration + (t.lag || 0),
      );
    }
    earliest[id] = start;
    visiting.delete(id);
    done.add(id);
    order.push(id);
  }
  tasks.forEach((t) => visit(t.id));
  const finish = Math.max(0, ...tasks.map((t) => earliest[t.id] + t.duration));
  for (const id of [...order].reverse()) {
    const t = byId.get(id)!;
    latest[id] = Math.min(
      finish - t.duration,
      ...tasks
        .filter((s) => (s.dependencies || []).includes(id))
        .map((s) => latest[s.id] - t.duration - (s.lag || 0)),
    );
  }
  return {
    earliest,
    finish,
    critical: tasks
      .filter((t) => latest[t.id] === earliest[t.id])
      .map((t) => t.id),
    slack: Object.fromEntries(
      tasks.map((t) => [t.id, latest[t.id] - earliest[t.id]]),
    ),
  };
}
