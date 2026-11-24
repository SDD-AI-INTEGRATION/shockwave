import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule } from "../src/scheduling.js";
test("finish-to-start dependencies, lag and critical path are calculated consistently", () => {
  const tasks = [
    { id: "a", start: 0, duration: 2 },
    { id: "b", start: 0, duration: 3, dependencies: ["a"], lag: 1 },
    { id: "c", start: 0, duration: 1 },
    { id: "d", start: 0, duration: 1, dependencies: ["b", "c"] },
  ];
  const result = schedule(tasks);
  assert.equal(result.earliest.b, 3);
  assert.equal(result.earliest.d, 6);
  assert.equal(result.finish, 7);
  assert.deepEqual(result.critical, ["a", "b", "d"]);
  assert.equal(result.slack.c, 5);
});
test("cycles and missing references cannot be scheduled", () => {
  assert.throws(
    () =>
      schedule([
        { id: "a", start: 0, duration: 1, dependencies: ["b"] },
        { id: "b", start: 0, duration: 1, dependencies: ["a"] },
      ]),
    /siklus/,
  );
  assert.throws(
    () =>
      schedule([{ id: "a", start: 0, duration: 1, dependencies: ["missing"] }]),
    /tidak ditemukan/,
  );
});
