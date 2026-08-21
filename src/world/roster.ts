// World: who is on shift.
//
// FAKED AND LABELLED, per the honesty law (CLAUDE.md). There is no real rota
// behind this — no scheduling system, no shift-swap log, nothing an
// integration would replace tomorrow. It is a fixed table of names, exactly
// like world/feeds.ts is a fixed table of vitals: the shape (Staff.id, name,
// role, available) is what a real rota feed would hand the agent, and
// everything downstream of this file would not know the difference.
//
// DETERMINISTIC, NOT RANDOM (D8-adjacent: no clock here either — a roster is
// data, not a schedule that changes with the wall clock). Calling this twice
// yields the identical array, which matters because agents/proposals.ts must
// be able to prove "same inputs, same proposals" without a clock in the loop.
//
// WHY SOME ARE UNAVAILABLE, ON PURPOSE. An agent that can always find someone
// free never has to choose, and the choosing — naming a real gap, assigning
// the proposal `assignee: null` and saying so — is the point of this module
// existing at all (CLAUDE.md: "Nobody available for the required role -> still
// emit the proposal ... Silently dropping it would hide work from the ward").
// A roster with everyone free would make that path untestable and, on stage,
// undemonstrated.

import type { Staff } from "../contracts/index.ts";

/**
 * The staff on shift for this demo ward. Two nurses free, one nurse already
 * committed elsewhere, one doctor in theatre (unavailable), one senior
 * clinician free. That mix is deliberate: every role exists in both an
 * available and an unavailable state somewhere in this table, or on the
 * ward's next roster if this one changes — see the roster tests for the
 * property this file promises to hold.
 */
export const ROSTER: readonly Staff[] = Object.freeze([
  Object.freeze({ id: "nurse-01", name: "Priya Nazir", role: "nurse", available: true }),
  Object.freeze({ id: "nurse-02", name: "Tom Delgado", role: "nurse", available: false }),
  Object.freeze({ id: "nurse-03", name: "Grace Owusu", role: "nurse", available: true }),
  Object.freeze({ id: "doctor-01", name: "Michael Osei", role: "doctor", available: false }),
  Object.freeze({ id: "senior-01", name: "Fatima Al-Rashid", role: "senior", available: true }),
]);

/**
 * The first available person of the given role, in roster order.
 *
 * Roster order is the tie-break, not a preference ranking — there is no real
 * scheduling logic behind "who gets picked first among several free nurses",
 * and pretending otherwise would be exactly the kind of invented certainty
 * the honesty law forbids. `null` when nobody of that role is free; the
 * caller (agents/proposals.ts) is the one that decides what a `null`
 * assignee means for the proposal, not this function.
 */
export function firstAvailable(roster: readonly Staff[], role: Staff["role"]): Staff | null {
  return roster.find((s) => s.role === role && s.available) ?? null;
}
