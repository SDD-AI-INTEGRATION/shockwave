import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  actualAt,
  planAt,
  metrics,
  operationsSchema,
  reviewSchema,
  momSchema,
  type Task,
  type Operations,
} from "../src/pmo-models.js";
const task = (): Task => ({
  id: randomUUID(),
  name: "Development",
  weight: 100,
  start: 1,
  duration: 2,
  pattern: "even",
  plan: [],
  actual: { 1: 20, 3: 80 },
});
test("weekly planning reaches 100%, carries actuals forward, and computes weighted deviation", () => {
  const t = task(),
    o: Operations = {
      phases: [{ id: randomUUID(), name: "Build", tasks: [t] }],
      issues: [],
      reports: {},
    };
  assert.equal(planAt(t, 0), 0);
  assert.equal(planAt(t, 1), 50);
  assert.equal(planAt(t, 2), 100);
  assert.equal(actualAt(t, 2), 20);
  assert.deepEqual(metrics(o, 2), {
    plan: 100,
    actual: 20,
    deviation: -80,
    weight: 100,
  });
});
test("reject invalid cumulative plans, decreasing actuals, and incomplete WBS weights", () => {
  const t = task(),
    o: Operations = {
      phases: [{ id: randomUUID(), name: "Build", tasks: [t] }],
      issues: [],
      reports: {},
    };
  assert.equal(operationsSchema.safeParse(o).success, true);
  assert.equal(
    operationsSchema.safeParse({
      ...o,
      phases: [{ ...o.phases[0], tasks: [{ ...t, weight: 20 }] }],
    }).success,
    false,
  );
  assert.equal(
    operationsSchema.safeParse({
      ...o,
      phases: [{ ...o.phases[0], tasks: [{ ...t, actual: { 1: 80, 2: 50 } }] }],
    }).success,
    false,
  );
  assert.equal(
    operationsSchema.safeParse({
      ...o,
      phases: [
        {
          ...o.phases[0],
          tasks: [{ ...t, pattern: "custom", plan: [60, 99] }],
        },
      ],
    }).success,
    false,
  );
});
test("updated meeting reviews require information and actions need a PIC and due date", () => {
  const review = {
    review: "updated",
    health: "on_track",
    summary: "",
    items: [],
    actions: [],
  };
  assert.equal(reviewSchema.safeParse(review).success, false);
  assert.equal(
    reviewSchema.safeParse({ ...review, summary: "UAT completed" }).success,
    true,
  );
  assert.equal(
    reviewSchema.safeParse({ ...review, review: "unchanged" }).success,
    true,
  );
  assert.equal(
    reviewSchema.safeParse({
      ...review,
      actions: [
        {
          id: randomUUID(),
          text: "Follow up",
          pic: "",
          due: "",
          status: "not_started",
        },
      ],
    }).success,
    false,
  );
});
test("MOM requires valid meeting times and prevents an end before the start", () => {
  const mom = {
    id: randomUUID(),
    number: "001/MOM",
    date: "2026-11-17",
    purpose: "Review",
    start: "09:00",
    end: "10:00",
    location: "",
    online: "",
    internal: "",
    external: "",
    previous: "",
    results: "",
    notes: "",
    deadline: "",
    actions: [],
    notulis: "Notulis",
    approver: "PMO",
    photos: [],
    signature: "",
  };
  assert.equal(momSchema.safeParse(mom).success, true);
  assert.equal(momSchema.safeParse({ ...mom, start: "99:99" }).success, false);
  assert.equal(momSchema.safeParse({ ...mom, end: "08:00" }).success, false);
});
