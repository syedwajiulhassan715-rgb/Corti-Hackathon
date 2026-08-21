// Narrow, fixture-backed MCP boundary for the demo. These are operational
// facts, never clinical conclusions. A production connector can replace this
// adapter without changing proposals or the UI.

import type { Millis, PatientId } from "../contracts/events.ts";
import type { Staff } from "../contracts/actions.ts";

export interface CoordinationPlan {
  readonly status: "ready" | "degraded";
  readonly source: "fixture-mcp";
  readonly patientId: PatientId;
  readonly nurse: Staff | null;
  readonly clinician: Staff | null;
  readonly nextSlot: { readonly at: Millis; readonly label: string } | null;
  readonly checks: readonly string[];
  readonly degradedReason: string | null;
}

export function prepareCoordination(
  patientId: PatientId,
  roster: readonly Staff[],
  now: Millis,
): CoordinationPlan {
  if (patientId.trim() === "") throw new Error("patientId is required");
  if (!Number.isInteger(now) || now < 0) throw new Error("now must be a non-negative integer");
  const nurse = roster.find((staff) => staff.role === "nurse" && staff.available) ?? null;
  const clinician = roster.find((staff) => (staff.role === "doctor" || staff.role === "senior") && staff.available) ?? null;
  const nextSlot = clinician === null ? null : Object.freeze({
    at: now + 30 * 60_000,
    label: new Date(now + 30 * 60_000).toISOString().slice(11, 16),
  });
  const missing = [nurse === null ? "no nurse available" : null, clinician === null ? "no clinician slot available" : null].filter(Boolean);
  return Object.freeze({
    status: missing.length === 0 ? "ready" : "degraded",
    source: "fixture-mcp",
    patientId,
    nurse,
    clinician,
    nextSlot,
    checks: Object.freeze(["staff availability", "staff workload", "next clinician slot"]),
    degradedReason: missing.length === 0 ? null : missing.join("; "),
  });
}
