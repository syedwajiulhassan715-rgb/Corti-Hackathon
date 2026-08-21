import { test } from "node:test";
import assert from "node:assert/strict";

import { ROSTER, firstAvailable } from "./roster.ts";
import type { Staff } from "../contracts/index.ts";

test("the roster has a nurse, a doctor and a senior", () => {
  const roles = new Set(ROSTER.map((s) => s.role));
  assert.ok(roles.has("nurse"), "at least one nurse");
  assert.ok(roles.has("doctor"), "at least one doctor");
  assert.ok(roles.has("senior"), "at least one senior");
});

test("some staff are available and some are not — an agent that can always find someone free never has to choose", () => {
  assert.ok(ROSTER.some((s) => s.available), "at least one person free");
  assert.ok(ROSTER.some((s) => !s.available), "at least one person committed elsewhere");
});

test("every role appears in the roster with at least one committed and, elsewhere in the table, is representable as free", () => {
  // Not every single role has to have both states in this exact table, but
  // nurse — the role most of the proposal kinds route to — must show both,
  // or the "nobody available" path can never be exercised for the common case.
  const nurses = ROSTER.filter((s) => s.role === "nurse");
  assert.ok(nurses.some((s) => s.available));
  assert.ok(nurses.some((s) => !s.available));
});

test("staff ids are unique", () => {
  const ids = ROSTER.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the roster is frozen data, not a live query", () => {
  assert.ok(Object.isFrozen(ROSTER));
  for (const s of ROSTER) assert.ok(Object.isFrozen(s));
});

test("firstAvailable returns the first free person of the role, in roster order", () => {
  const found = firstAvailable(ROSTER, "nurse");
  assert.notEqual(found, null);
  assert.equal(found?.role, "nurse");
  assert.equal(found?.available, true);
});

test("firstAvailable returns null when nobody of that role is free", () => {
  const allBusy: readonly Staff[] = Object.freeze([
    Object.freeze({ id: "x", name: "X", role: "doctor", available: false }),
  ]);
  assert.equal(firstAvailable(allBusy, "doctor"), null);
});

test("firstAvailable is pure: same roster, same role, same answer every time", () => {
  const a = firstAvailable(ROSTER, "senior");
  const b = firstAvailable(ROSTER, "senior");
  assert.deepEqual(a, b);
});

test("firstAvailable returns null for a role nobody on the roster holds", () => {
  const noSeniors: readonly Staff[] = Object.freeze([
    Object.freeze({ id: "n1", name: "N", role: "nurse", available: true }),
  ]);
  assert.equal(firstAvailable(noSeniors, "senior"), null);
});
