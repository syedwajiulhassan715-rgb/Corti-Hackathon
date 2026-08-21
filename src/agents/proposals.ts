// The workflow agent. Turns the ward's deterministic PatientPriority rows
// into proposed next actions, and turns a human's decision on a proposal
// into the event that becomes part of that patient's history.
//
// THE BOUNDARY THIS FILE DEFENDS (CLAUDE.md: "The agent never decides
// clinical truth. It decides workflow only." — and contracts/actions.ts's
// header, which this file is built against).
//
//   - `level` and `rank` on every Proposal below are COPIED off the
//     PatientPriority this module was handed. Nothing here recomputes a
//     score, reorders the ladder, or upgrades/downgrades a level. Search
//     this file for "COPIED" — every place level/rank are set, that comment
//     is next to it.
//   - Every clinical claim in `rationale` traces to `evidenceEventIds` or to
//     the priority's own components. Corti generation (see below) is asked
//     to *phrase* the deterministic state, never to add to it.
//   - A proposal with no evidence is never emitted (checked below, not
//     assumed).
//   - Nobody available for the required role does not mean the work
//     disappears: the proposal is still emitted with `assignee: null`, and
//     the summary says so. Silently dropping it would hide work from the
//     ward, which is the failure mode ECHO exists to fix.
//
// PURITY, WITH ONE DELIBERATE EXCEPTION. `propose` takes `now` as an
// argument like every engine and projection (D8) and never reads the clock.
// It is not, however, a synchronous pure fold the way engines/ and
// projections/ are required to be — CLAUDE.md's purity clause names those
// two directories specifically, and agents/ is deliberately not one of them,
// because Task 3 requires it to *try* a real Corti call for the rationale
// text. What stays true regardless: no module here mutates its inputs, the
// roster and priorities are read-only, and with no cache supplied (or any
// cache miss without credentials) `propose` resolves synchronously-in-effect
// to the same deterministic fallback every time — so "same inputs, same
// proposals" still holds for every offline run, including every test in this
// suite and every offline demo run.

import type { CortiCredentials } from "../corti/transcribe.ts";
import type { DiskCache } from "../corti/cache.ts";
import { generateWhyTopPriority, type DocumentContextItem } from "../corti/documents.ts";
import { loadRecord, roomForPatient } from "../world/patients.ts";
import { prepareCoordination } from "../mcp/coordination.ts";
import type {
  ActionEvent,
  Decision,
  EventId,
  Millis,
  PatientId,
  PatientPriority,
  PriorityComponent,
  PriorityLevel,
  Proposal,
  ProposalKind,
  Staff,
} from "../contracts/index.ts";

// --------------------------------------------------------------- the rules
//
// Data, not logic, so the mapping can be retuned without touching the walk
// below it (CLAUDE.md: "engines/rules/ is data, not logic" — this module
// isn't engines/, but the same discipline is worth keeping here, and this is
// the "as data at the top of the file" the task asks for).

interface RoleAction {
  readonly kind: ProposalKind;
  readonly role: Staff["role"];
}

/**
 * The silence signal's action, and a differentiator: whenever the single
 * biggest scoring component on a patient is "no reading has come in when one
 * was due" rather than a bad reading, the right move is not to reassess a
 * number that doesn't exist yet — it's to go and take it. Applies regardless
 * of ladder level, because an overdue observation is exactly as blind at
 * WATCH as it is at HIGH.
 */
const SILENCE_ACTION: RoleAction = Object.freeze({ kind: "observe", role: "nurse" });

/**
 * HIGH / CRITICAL -> "escalate" or "reassess", per the task brief. CRITICAL
 * already skipped the ladder (an emergency threshold fired on its own, or
 * agreement + persistence cleared every gate) — that gets raised straight to
 * a senior. HIGH is the rung below it: a clinician needs eyes on the
 * patient, not yet a senior packet. PERSISTING_CONCERN is the same ask, one
 * rung earlier, and stays with the nurse who would normally do a round.
 *
 * WATCH has no entry on purpose. WATCH is free — noticing costs nothing
 * (prioritization.ts) — and proposing work for a patient who has not cleared
 * a single gate above WATCH would turn the queue into noise, the exact
 * failure the GREEN rule below also guards against.
 */
const LEVEL_ACTION: Readonly<Partial<Record<PriorityLevel, RoleAction>>> = Object.freeze({
  CRITICAL: Object.freeze({ kind: "escalate", role: "senior" }),
  HIGH: Object.freeze({ kind: "reassess", role: "doctor" }),
  PERSISTING_CONCERN: Object.freeze({ kind: "reassess", role: "nurse" }),
});

/**
 * GREEN with something outstanding (an unresolved task, a chart nobody has
 * touched in a while) still gets a proposal — just not a clinical one. GREEN
 * with nothing outstanding gets none at all: proposing work for a well
 * patient is how a queue becomes noise (CLAUDE.md, verbatim).
 */
const GREEN_OUTSTANDING_ACTION: RoleAction = Object.freeze({ kind: "assign", role: "nurse" });

/** One line per proposal kind, for the deterministic summary. Data, not logic. */
const SUMMARY_VERB: Readonly<Record<ProposalKind, string>> = Object.freeze({
  reassess: "reassess",
  assign: "pick up the open work for",
  escalate: "escalate",
  handoff: "prepare a handoff for",
  observe: "take the overdue observation for",
});

// ------------------------------------------------------------- the routing

interface DecidedAction extends RoleAction {
  /** Non-empty. Enforced by the caller before a Proposal is ever built. */
  readonly evidenceEventIds: readonly EventId[];
  /** The component that triggered this action, for the fallback rationale. Absent for a level-only trigger with no single anchoring component. */
  readonly trigger: PriorityComponent | undefined;
}

/**
 * The highest-scoring component, ties broken on name so two components tied
 * on points never flip which one "is" the top between identical runs — the
 * same determinism discipline prioritization.ts uses for its own anchor
 * signal.
 */
function topComponent(components: readonly PriorityComponent[]): PriorityComponent | undefined {
  const positive = components.filter((c) => c.points > 0);
  if (positive.length === 0) return undefined;
  return [...positive].sort((a, b) => b.points - a.points || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))[0];
}

/**
 * Decide WHO and WHAT WORKFLOW ACTION, never WHETHER the patient is sick.
 * The only clinical input read here is `priority.level` and
 * `priority.components`, and both are read-only — nothing in this function
 * writes back to either.
 *
 * Returns undefined when nothing should be proposed at all (GREEN with
 * nothing outstanding, or WATCH with only a trend component and no silence).
 */
function decideAction(priority: PatientPriority): DecidedAction | undefined {
  const top = topComponent(priority.components);

  if (top !== undefined && top.name === "silence") {
    return { ...SILENCE_ACTION, evidenceEventIds: top.evidenceEventIds, trigger: top };
  }

  if (top !== undefined && top.name === "care-gap") {
    return {
      kind: top.explanation.startsWith("Record ") ? "observe" : "reassess",
      role: "nurse",
      evidenceEventIds: top.evidenceEventIds,
      trigger: top,
    };
  }

  const levelAction = LEVEL_ACTION[priority.level];
  if (levelAction !== undefined) {
    return { ...levelAction, evidenceEventIds: priority.evidenceEventIds, trigger: top };
  }

  if (priority.level === "GREEN" && top !== undefined) {
    return { ...GREEN_OUTSTANDING_ACTION, evidenceEventIds: top.evidenceEventIds, trigger: top };
  }

  return undefined;
}

/**
 * Who may cover for whom, in order of preference.
 *
 * Without a fallback the ward's sickest patient goes unassigned the moment one
 * person is busy, which is exactly what happened on first integration: the only
 * doctor was committed, so the HIGH patient at rank #1 got "nobody available"
 * while three GREEN patients were handed a free nurse. A senior can always
 * cover a doctor's reassessment; the reverse is not assumed.
 */
const COVERS: Readonly<Record<Staff["role"], readonly Staff["role"][]>> = Object.freeze({
  senior: Object.freeze(["senior"] as const),
  doctor: Object.freeze(["doctor", "senior"] as const),
  nurse: Object.freeze(["nurse"] as const),
});

/**
 * The first free person who can cover `role` and has not already been
 * committed in this pass.
 *
 * `committed` is what stops one nurse being offered three jobs at once. The
 * priorities arrive in rank order, so consuming the pool as we go means the
 * most urgent patient gets the pick — an agent that hands the same person to
 * everyone is not proposing a plan, it is listing wishes.
 */
function pickAssignee(
  roster: readonly Staff[],
  role: Staff["role"],
  committed: Set<string>,
): Staff | null {
  for (const candidate of COVERS[role]) {
    const found = roster.find(
      (s) => s.role === candidate && s.available && !committed.has(s.id),
    );
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * Imperative, one line, deterministic regardless of whether Corti generation
 * succeeds — `summary` is not the generated field, `rationale` is
 * (contracts/actions.ts). When nobody is available it says so, rather than
 * quietly assigning null and letting the reader miss it.
 */
/**
 * The name a human would use. Falls back to the id when no chart loads, rather
 * than throwing — a proposal that says "elena_petrova" is worse than one that
 * says "Elena Petrova", but a crash is worse than both.
 */
function displayName(patientId: PatientId): string {
  return loadRecord(patientId)?.name ?? patientId;
}

function buildSummary(kind: ProposalKind, patientId: PatientId, level: PriorityLevel, assignee: Staff | null): string {
  const verb = SUMMARY_VERB[kind];
  if (assignee !== null) {
    return `Ask ${assignee.name} (${assignee.role}) to ${verb} ${displayName(patientId)} (${level}).`;
  }
  const capitalized = verb.charAt(0).toUpperCase() + verb.slice(1);
  return `${capitalized} ${displayName(patientId)} (${level}) — nobody free to cover this right now; needs manual assignment.`;
}

// ---------------------------------------------------------- the rationale

/**
 * Assembled only from the priority's own components/reasons — no field here
 * is invented. This is what a failing or absent Corti call degrades to (test
 * law: "a failing stage degrades to a missing card, never a crash"), and it
 * is also exactly what a cache-warm, no-network run should read like on
 * stage if generation is deliberately skipped.
 */
function fallbackRationale(priority: PatientPriority, trigger: PriorityComponent | undefined): string {
  const lead = trigger !== undefined ? trigger.explanation : priority.reasons[0];
  const rest = priority.reasons.filter((r) => r !== lead).slice(0, 2);
  const sentences = [lead, ...rest].filter((s): s is string => s !== undefined && s.length > 0);
  const body = sentences.length > 0 ? sentences.join(" ") : "No component scored above zero.";
  return `${priority.level} (rank ${priority.rank}, score ${priority.score}): ${body}`;
}

function contextText(priority: PatientPriority): string {
  const parts = [
    `Level: ${priority.level}. Rank: ${priority.rank}. Score: ${priority.score}.`,
    ...priority.reasons.map((r) => `Reason: ${r}`),
    ...priority.withheld.map((w) => `Withheld: ${w}`),
  ];
  return parts.join("\n");
}

export interface ProposeDeps {
  /** Omit to skip generation entirely and always use the deterministic fallback. */
  readonly cache?: DiskCache;
  /** Omit for an offline run: a cache miss then falls back rather than calling out. */
  readonly credentials?: CortiCredentials;
  /** Seam for tests. Defaults to global fetch. */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Try Corti generation first (Task 3); fall back to the deterministic
 * sentence on ANY failure — cache miss without credentials, network error,
 * malformed/empty response, anything. Generation explains; it never invents,
 * so the only thing at risk when it fails is prose quality, never a fact —
 * which is exactly why a failure here degrades instead of propagating.
 */
async function buildRationale(
  priority: PatientPriority,
  trigger: PriorityComponent | undefined,
  deps: ProposeDeps,
): Promise<{ readonly text: string; readonly generated: boolean }> {
  const fallback = fallbackRationale(priority, trigger);
  if (deps.cache === undefined) return { text: fallback, generated: false };

  const context: readonly DocumentContextItem[] = [{ type: "string", data: contextText(priority) }];

  try {
    // No real interaction id exists at this layer — the priority engine
    // never carries one, and inventing a fresh Corti interaction per
    // proposal would spend credits generating an audit trail nobody reads.
    // patientId stands in: generateDocument's cache key is content-derived
    // (interactionId + context + template), so this is stable and safe to
    // replay, and it is never sent anywhere except inside the cache key and
    // the URL path of a call this function may not even make.
    const doc = await generateWhyTopPriority(priority.patientId, context, {
      cache: deps.cache,
      credentials: deps.credentials,
      fetch: deps.fetch,
    });
    const text = doc.sections
      .map((s) => s.text)
      .filter((t) => t.length > 0)
      .join("\n\n");
    if (text.length === 0) return { text: fallback, generated: false };
    return { text, generated: true };
  } catch {
    return { text: fallback, generated: false };
  }
}

// -------------------------------------------------------------- propose()

/**
 * Given the ward's deterministic PatientPriority rows, propose the next
 * workflow action per patient that needs one.
 *
 * Reads `priorities` and `roster` only; writes neither. Returns at most one
 * proposal per patient — the routing table above is a single decision, not a
 * menu, on purpose: a ward that gets two competing proposals for the same
 * patient has to guess which one to trust, which is the ambiguity this
 * module exists to remove.
 */
export async function propose(
  priorities: readonly PatientPriority[],
  roster: readonly Staff[],
  now: Millis,
  deps: ProposeDeps = {},
): Promise<readonly Proposal[]> {
  const proposals: Proposal[] = [];
  // One person, one job, per pass. See pickAssignee.
  const committed = new Set<string>();

  // Rank order, so the scarce people go to the patients who need them most.
  // prioritize() already returns a dense total order; sorting defensively keeps
  // this correct if a caller ever hands us an unsorted slice.
  for (const priority of [...priorities].sort((a, b) => a.rank - b.rank)) {
    const decided = decideAction(priority);
    if (decided === undefined) continue;
    // "A proposal with no evidence is never emitted" — checked, not assumed.
    if (decided.evidenceEventIds.length === 0) continue;

    const assignee = pickAssignee(roster, decided.role, committed);
    if (assignee !== null) committed.add(assignee.id);
    const summary = buildSummary(decided.kind, priority.patientId, priority.level, assignee);
    const { text, generated } = await buildRationale(priority, decided.trigger, deps);

    proposals.push(
      Object.freeze({
        id: `prop_${priority.patientId}_${decided.kind}`,
        patientId: priority.patientId,
        kind: decided.kind,
        summary,
        rationale: text,
        level: priority.level, // COPIED from the engine's verdict, never recomputed.
        rank: priority.rank, // COPIED from the engine's verdict, never recomputed.
        assignee,
        evidenceEventIds: decided.evidenceEventIds,
        proposedAt: now,
        status: "pending",
        generated,
        coordination: prepareCoordination(priority.patientId, roster, now),
      } satisfies Proposal),
    );
  }

  return Object.freeze(proposals);
}

// -------------------------------------------------------------- approval

/**
 * `speaker` on an Event is a closed enum (contracts/events.ts) and cannot
 * hold a free-text name, so the deciding person named in `decision.decidedBy`
 * is folded into `quote` instead — the event still carries who decided, it
 * is just carried as text rather than as the (necessarily generic) role
 * enum. "clinician" is the enum value because the only people who approve or
 * reject an ECHO proposal are clinical staff; it says nothing about which
 * one, which `quote` says instead.
 */
function buildActionEvent(proposal: Proposal, decision: Decision, now: Millis, approved: boolean): ActionEvent {
  if (decision.approved !== approved) {
    throw new Error(
      `decision.approved (${decision.approved}) does not match the ${approved ? "approve" : "reject"} call for proposal ${proposal.id}`,
    );
  }

  const spoken =
    decision.note !== undefined && decision.note.length > 0
      ? decision.note
      : approved
        ? proposal.summary
        : `Rejected: ${proposal.summary}`;

  return {
    ts: now,
    patientId: proposal.patientId,
    room: roomForPatient(proposal.patientId) ?? "unknown",
    source: "action",
    speaker: "clinician",
    quote: `${decision.decidedBy}: ${spoken}`,
    code: null,
    observation: proposal.kind,
    value: approved ? "approved" : "rejected",
  };
}

/**
 * Approval returns an EventInput; it does not mutate the proposal and does
 * not append anything. The caller appends — that is what keeps the event log
 * the only interface between modules (CLAUDE.md).
 */
export function approve(proposal: Proposal, decision: Decision, now: Millis): ActionEvent {
  return buildActionEvent(proposal, decision, now, true);
}

/** A rejected proposal is information, not a no-op — it is recorded exactly like an approval. */
export function reject(proposal: Proposal, decision: Decision, now: Millis): ActionEvent {
  return buildActionEvent(proposal, decision, now, false);
}
