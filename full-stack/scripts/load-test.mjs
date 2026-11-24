import { performance } from "node:perf_hooks";
export async function loadTest(
  base,
  cookie,
  { requests = 100, concurrency = 10 } = {},
) {
  const times = [];
  let next = 0,
    failures = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next++ < requests) {
        const start = performance.now();
        try {
          const r = await fetch(`${base}/api/projects`, {
            headers: { Cookie: cookie },
          });
          await r.arrayBuffer();
          if (!r.ok) failures++;
        } catch {
          failures++;
        }
        times.push(performance.now() - start);
      }
    }),
  );
  times.sort((a, b) => a - b);
  return {
    requests: times.length,
    concurrency,
    failures,
    p50_ms: Math.round(times[Math.floor(times.length * 0.5)]),
    p95_ms: Math.round(times[Math.floor(times.length * 0.95)]),
    max_ms: Math.round(times.at(-1)),
  };
}
