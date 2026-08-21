// What the agent may propose, and what a human approving it records.
//
// THE BOUNDARY THIS FILE DEFENDS (CLAUDE.md: "The agent never decides clinical
// truth. It decides workflow only.")
//
// A Proposal can say "ask a nurse to reassess this patient". A Proposal can
// NEVER say "this patient is deteriorating" — the deterministic engine already
// decided that, from the doctor's rule tables, and the agent is downstream of
// it. That is why a Proposal has no severity, no level, and no score of its
// own: it carries the patientId and the evidence, and every clinical claim in
// it is quoted from state the engine produced.
//
// NOTHING HAPPENS WITHOUT A HUMAN. A Proposal is inert. It changes no state,
// dispatches nobody and books nothing. The only thing that ever enters the log
// is the Event a human's approval produces, which is why `approve` returns an
// EventInput and not a mutation.

import type { EventId, EventInput, Millis, PatientId } from "./events.ts";
import type { PriorityLevel } from "./clinical.ts";
import type { CoordinationPlan } from "../mcp/coordination.ts";

/**
 * The workflow actions the agent is allowed to suggest.
 *
 * A closed union, deliberately. An open string would let a future prompt
 * invent an action nobody reviewed, and "the agent proposed something we did
 * not design" is exactly the failure this boundary exists to prevent.
 */
export type ProposalKind =
  /** Ask a named person to go and reassess the patient. */
  | "reassess"
  /** Assign the open work on this patient to a named person. */
  | "assign"
  /** Raise to a senior clinician, with a packet. */
  | "escalate"
  /** Produce a handoff summary for the next shift. */
  | "handoff"
  /** Take an observation nobody has taken — the silence signal's action. */
  | "observe";

export type ProposalStatus = "pending" | "approved" | "rejected";

/** Someone who can be asked to do something. */
export interface Staff {
  readonly id: string;
  readonly name: string;
  readonly role: "nurse" | "doctor" | "senior";
  /** False when they are already committed to something. */
  readonly available: boolean;
}

export interface Proposal {
  readonly id: string;
  readonly patientId: PatientId;
  readonly kind: ProposalKind;
  /** Imperative, one line, what a human is being asked to approve. */
  readonly summary: string;
  /**
   * Why, in the agent's words, but assembled only from deterministic state.
   *
   * Corti generation may write this sentence. It may never introduce a fact
   * that is not already in `evidenceEventIds` or in the engine output quoted
   * below — generation explains, it does not conclude.
   */
  readonly rationale: string;
  /** The engine's verdict at the time of proposing. Quoted, never recomputed. */
  readonly level: PriorityLevel;
  readonly rank: number;
  /** Who is being asked. Null for actions that name nobody. */
  readonly assignee: Staff | null;
  /** Non-empty. A proposal that cannot cite evidence is not shown. */
  readonly evidenceEventIds: readonly EventId[];
  readonly proposedAt: Millis;
  readonly status: ProposalStatus;
  /** True when the text came from Corti rather than the deterministic fallback. */
  readonly generated: boolean;
  /** Operational checks prepared through the narrow MCP adapter. */
  readonly coordination: CoordinationPlan;
}

/** What a human did about a proposal. */
export interface Decision {
  readonly proposalId: string;
  readonly approved: boolean;
  /** Who decided. The log records a person, never "the system". */
  readonly decidedBy: string;
  readonly decidedAt: Millis;
  /** Optional free text, recorded verbatim when present. */
  readonly note?: string;
}

/**
 * The event an approval writes into the log.
 *
 * `source: "action"` already exists in the Event contract and has never had a
 * producer; this is it. Once appended, the action is part of the patient's
 * history and replays like everything else — which is what "the action becomes
 * part of the history" in SPEC.md actually means mechanically.
 */
export type ActionEvent = EventInput & { readonly source: "action" };
