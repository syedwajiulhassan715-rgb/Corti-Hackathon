import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareCoordination } from "./coordination.ts";
import { ROSTER } from "../world/roster.ts";

test("coordination prepares available staff and a deterministic slot", () => {
  const plan = prepareCoordination("p1", ROSTER, 1_000_000_000);
  assert.equal(plan.status, "ready");
  assert.equal(plan.nurse?.available, true);
  assert.equal(plan.clinician?.available, true);
  assert.equal(plan.nextSlot?.at, 1_001_800_000);
  assert.equal(plan.source, "fixture-mcp");
});

test("resource scarcity is visible rather than dropping the plan", () => {
  const plan = prepareCoordination("p1", [], 1_000_000_000);
  assert.equal(plan.status, "degraded");
  assert.equal(plan.nurse, null);
  assert.equal(plan.nextSlot, null);
  assert.match(plan.degradedReason ?? "", /no nurse|no clinician/);
});

test("invalid tool arguments are rejected before lookup", () => {
  assert.throws(() => prepareCoordination("", ROSTER, 1_000_000_000), /patientId/);
  assert.throws(() => prepareCoordination("p1", ROSTER, -1), /now/);
});
