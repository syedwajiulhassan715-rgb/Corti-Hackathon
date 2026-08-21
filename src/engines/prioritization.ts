// S6 Priority Engine. Folds PatientTrends + PatientHistory into a ranked
// PatientPriority per patient, across the whole ward.
//
// Pure function of its inputs. No network, no stored state (CLAUDE.md).
// Takes `now` as an explicit argument (D8) and never calls Date.now() — only
// main.ts and server/index.ts are allowed to touch the clock.
//
// THE DELAYED TRIGGER MODEL, restated for this file:
//
//   A patient climbs GREEN -> WATCH -> PERSISTING_CONCERN -> HIGH -> CRITICAL
//   by accumulating persistence and multi-signal agreement, never by crossing
//   one line once. WATCH is free — noticing costs nothing. Every rung above
//   WATCH is gated by rules/priority.rules.ts: GATES, WATCH_RULE and
//   EMERGENCY_CONDITIONS. This file is the fold; that file is what to look
//   for and how much is enough. See the comments there for WHY each gate is
//   shaped the way it is — this file does not re-derive that reasoning, it
//   only applies it.
//
// THIS ENGINE DOES NOT READ RAW EVENTS. It reads PatientTrends and
// PatientHistory — the projections other workstreams build from the log —
// and cites the evidenceEventIds those projections already carry. That is
// the architecture law working as intended: three engines fold the same log
// independently and meet only at typed projections, never at each other's
// internals.

import type {
  ClinicalFact,
  CareGap,
  Millis,
  PatientHistory,
  PatientId,
  PatientPriority,
  PatientTrends,
  PriorityComponent,
  PriorityLevel,
  TrendSignal,
} from "../contracts/index.ts";
import {
  EMERGENCY_CONDITIONS,
  GATES,
  NEAR_MISS,
  WATCH_RULE,
  WEIGHTS,
  emergencyDistanceRatio,
  emergencyFired,
  severity,
  type EmergencyCondition,
  type Gate,
} from "./rules/priority.rules.ts";

const HOUR = 60 * 60_000;

/** One patient's inputs to the ward-wide rank. Workstreams A and B produce the two projections; this engine only consumes their declared types. */
export interface PatientPriorityInput {
  readonly patientId: PatientId;
  readonly trends: PatientTrends;
  readonly history: PatientHistory;
  /** The level this patient carried before this fold. Null when there is no prior computation (e.g. first run). */
  readonly previousLevel: PriorityLevel | null;
  /** Workflow gaps projected from the same event slice. */
  readonly careGaps?: readonly CareGap[];
}

/**
 * Ranks the whole ward. `rank` cannot be assigned per patient in isolation —
 * it needs everyone's score at once — which is why this takes the full set
 * and returns the full set, rather than being called once per patient.
 */
export function prioritize(
  inputs: readonly PatientPriorityInput[],
  now: Millis,
): readonly PatientPriority[] {
  const unranked = inputs.map((input) => computeOne(input, now));

  // Deterministic, total order (CLAUDE.md: "ranking is deterministic and
  // total; ties must break on a stable, documented key"). Primary key is the
  // ladder rung — a WATCH patient never outranks a HIGH patient just because
  // WATCH's receipt happened to add up to a bigger number. Within a rung,
  // higher score first. Any remaining tie breaks on patientId, ascending,
  // purely for stability across replays — it carries no clinical meaning.
  const sorted = [...unranked].sort((a, b) => {
    const bySeverity = severity(b.level) - severity(a.level);
    if (bySeverity !== 0) return bySeverity;
    const byScore = b.score - a.score;
    if (byScore !== 0) return byScore;
    return a.patientId < b.patientId ? -1 : a.patientId > b.patientId ? 1 : 0;
  });

  return Object.freeze(
    sorted.map((p, index) =>
      Object.freeze({ ...p, rank: index + 1 } satisfies PatientPriority),
    ),
  );
}

// ---------------------------------------------------------------- per patient

type Unranked = Omit<PatientPriority, "rank">;

function computeOne(input: PatientPriorityInput, now: Millis): Unranked {
  const { trends, history, previousLevel } = input;

  const concerning = trends.signals.filter((s) => s.concerning);
  const overdue = trends.signals.filter((s) => s.overdue);
  const supportingFacts = factsFor(trends, history);
  const speechFacts = supportingFacts.filter((f) => f.quote !== undefined && f.quote !== "");
  const speechGrounded = speechFacts.length > 0;

  const emergency = firstEmergency(trends.signals);

  const components: PriorityComponent[] = [];
  const withheld: string[] = [];

  // --- trend: one line per concerning signal, the raw material everything
  // else corroborates or persists on top of.
  for (const s of concerning) {
    components.push({
      name: "trend",
      explanation: trendExplanation(s),
      points: WEIGHTS.trendPerConcerningSignal,
      evidenceEventIds: s.evidenceEventIds,
    });
  }

  // --- agreement: reward corroboration, never a single signal.
  if (concerning.length >= 2) {
    const names = concerning.map((s) => s.observation).join(", ");
    components.push({
      name: "agreement",
      explanation: `${concerning.length} distinct signals agree in the same direction at once: ${names}. Numbers in agreement, over time, may conclude — a single reading never does.`,
      points: WEIGHTS.agreementPerExtraSignal * (concerning.length - 1),
      evidenceEventIds: concerning.flatMap((s) => s.evidenceEventIds),
    });
  }

  // --- persistence: how long the longest-held concerning direction has lasted.
  const anchor = anchorSignal(concerning);
  if (anchor !== undefined && trends.persistenceMs > 0) {
    const hours = trends.persistenceMs / HOUR;
    components.push({
      name: "persistence",
      explanation: `${anchor.observation} has held its worsening direction for ${formatDuration(trends.persistenceMs)}, resting on ${anchor.sampleCount} sample${anchor.sampleCount === 1 ? "" : "s"}.`,
      points: Math.min(WEIGHTS.persistencePerHour * hours, WEIGHTS.persistenceCapPoints),
      evidenceEventIds: anchor.evidenceEventIds,
    });
  }

  // --- silence: a missing observation is a trend, not the absence of one.
  for (const s of overdue) {
    components.push({
      name: "silence",
      explanation: `No new ${s.observation} reading in ${s.sinceLastSampleMs === null ? "an unknown time" : formatDuration(s.sinceLastSampleMs)} — overdue for this observation. Silence is a signal, not the absence of one.`,
      points: WEIGHTS.silencePerOverdueSignal,
      evidenceEventIds: s.evidenceEventIds,
    });
  }

  // --- unresolved-tasks: a planned thing nobody discussed becomes a flag,
  // never a guess. A "plan" fact with no matching "actions" fact of the same
  // name is exactly that flag.
  for (const task of unresolvedTasks(history)) {
    components.push({
      name: "unresolved-tasks",
      explanation: `Planned but not documented as done: "${task.name}"${task.quote ? ` ("${task.quote}")` : ""}.`,
      points: WEIGHTS.unresolvedTaskEach,
      evidenceEventIds: task.evidenceEventIds,
    });
  }

  // First-class care gaps supersede the older plan-fact heuristic when they
  // describe the same evidence. Each gap is visible as its own receipt line.
  const existingTaskEvidence = new Set(
    components.filter((c) => c.name === "unresolved-tasks").flatMap((c) => c.evidenceEventIds),
  );
  for (const gap of input.careGaps ?? []) {
    if (gap.kind === "unresolved-plan" && gap.evidenceEventIds.some((id) => existingTaskEvidence.has(id))) continue;
    components.push({
      name: "care-gap",
      explanation: `${gap.summary}: ${gap.whyNow}`,
      points: WEIGHTS.careGapEach,
      evidenceEventIds: gap.evidenceEventIds,
    });
  }

  // --- time-waiting: how long since this chart itself was last touched.
  const waitingMs = Math.max(0, now - history.asOf);
  if (waitingMs > HOUR) {
    const lastEvent = history.timeline.at(-1);
    components.push({
      name: "time-waiting",
      explanation: `This chart has not been updated in ${formatDuration(waitingMs)}.`,
      points: Math.min(WEIGHTS.timeWaitingPerHour * (waitingMs / HOUR), WEIGHTS.timeWaitingCapPoints),
      evidenceEventIds: lastEvent === undefined ? [] : [lastEvent],
    });
  }

  // --- speech: a grounded utterance in the evidence, the other half of the
  // OR that lets a judgement leave WATCH.
  if (speechGrounded) {
    for (const f of speechFacts) {
      components.push({
        name: "speech",
        explanation: `${f.speaker ?? "someone"} said: "${f.quote}".`,
        points: WEIGHTS.speechGrounded,
        evidenceEventIds: f.evidenceEventIds,
      });
    }
  }

  // --- emergency: a defined threshold crossed on its own. Skips the ladder.
  if (emergency !== undefined) {
    components.push({
      name: "trend",
      explanation: `${emergency.signal.observation} = ${emergency.signal.current} — ${emergency.condition.explanation}`,
      points: WEIGHTS.emergencyJump,
      evidenceEventIds: emergency.signal.evidenceEventIds,
    });
  }

  // --- the ladder itself ---------------------------------------------------
  const level =
    emergency !== undefined
      ? "CRITICAL"
      : climb(concerning.length, trends.agreementCount, trends.persistenceMs, anchor?.sampleCount ?? 0, speechGrounded, withheld);

  // Near-miss on an emergency threshold, even when nothing fired. This is the
  // "why not" panel's other half: a value can be close without crossing.
  if (emergency === undefined) {
    for (const near of nearEmergencyMisses(trends.signals)) withheld.push(near);
  }

  const score = components.reduce((sum, c) => sum + c.points, 0);
  const evidenceEventIds = dedupe(components.flatMap((c) => c.evidenceEventIds));
  const reasons = components
    .filter((c) => c.points > 0)
    .sort((a, b) => b.points - a.points)
    .map((c) => c.explanation);

  return {
    patientId: input.patientId,
    level,
    score,
    components: Object.freeze(components.map((c) => Object.freeze(c))),
    reasons: Object.freeze(reasons),
    withheld: Object.freeze(withheld),
    evidenceEventIds: Object.freeze(evidenceEventIds),
    previousLevel,
    lastUpdatedAt: now,
  };
}

// -------------------------------------------------------------- the climb

/**
 * Walks GATES in ladder order, stopping at the first rung this patient does
 * not clear. Stopping (rather than skipping to test a later, easier-looking
 * rung) is what makes the ladder a ladder: HIGH is never reachable without
 * having first cleared PERSISTING_CONCERN in the same evaluation.
 */
function climb(
  concerningCount: number,
  agreementCount: number,
  persistenceMs: Millis,
  anchorSampleCount: number,
  speechGrounded: boolean,
  withheld: string[],
): PriorityLevel {
  let level: PriorityLevel = "GREEN";
  if (concerningCount >= WATCH_RULE.minConcerningSignals) level = "WATCH";
  else return level;

  for (const gate of GATES) {
    const numericPass =
      persistenceMs >= gate.minPersistenceMs &&
      agreementCount >= gate.minAgreementCount &&
      anchorSampleCount >= gate.minSampleCount;
    const speechPass = gate.speechSufficient && speechGrounded;

    if (numericPass || speechPass) {
      level = gate.level;
      continue;
    }

    withheld.push(nearMissText(gate, persistenceMs, agreementCount, anchorSampleCount, speechGrounded));
    break;
  }

  return level;
}

/**
 * Only speak up when the miss was close — a rule failing by a mile is not
 * news. "Close" is read off NEAR_MISS in rules/priority.rules.ts, not
 * decided here: a dimension counts as OK when it is either already met, or
 * short but within the ratio's reach of its floor. Both dimensions have to
 * be OK for this to read as a genuine near miss — one dimension already
 * satisfied and the other close (e.g. two signals agree, persistence is
 * three-quarters of the way there) counts; one dimension close and the other
 * nowhere near (a single reading, thirty seconds old, on one signal) does
 * not, and gets the generic "held below" message instead. This is what keeps
 * the "why not" panel selective instead of firing on every WATCH patient by
 * construction, since the bare minimum to reach WATCH is always exactly one
 * signal short of most agreement floors.
 */
function nearMissText(
  gate: Gate,
  persistenceMs: Millis,
  agreementCount: number,
  anchorSampleCount: number,
  speechGrounded: boolean,
): string {
  const persistenceMet = persistenceMs >= gate.minPersistenceMs;
  const agreementMet = agreementCount >= gate.minAgreementCount;
  const sampleMet = anchorSampleCount >= gate.minSampleCount;

  const persistenceOK = persistenceMet || persistenceMs >= gate.minPersistenceMs * NEAR_MISS.persistenceRatio;
  const agreementOK = agreementMet || agreementCount >= gate.minAgreementCount - NEAR_MISS.agreementGap;
  const closeEnoughToReport = persistenceOK && agreementOK;

  if (!closeEnoughToReport) {
    return (
      `Held below ${gate.level.replace(/_/g, " ")}: neither persistence (${formatDuration(persistenceMs)} ` +
      `of the ${formatDuration(gate.minPersistenceMs)} needed) nor agreement (${agreementCount} of ${gate.minAgreementCount} ` +
      `signals) is close, and ${speechGrounded ? "speech alone does not carry this rung" : "no speech event grounds it"}.`
    );
  }

  const parts: string[] = [];
  if (!persistenceMet) parts.push(`it has held for only ${formatDuration(persistenceMs)} of the ${formatDuration(gate.minPersistenceMs)} needed`);
  if (!agreementMet) parts.push(`only ${agreementCount} of ${gate.minAgreementCount} signals agree`);
  if (!sampleMet) parts.push(`only ${anchorSampleCount} of ${gate.minSampleCount} samples support it`);

  return (
    `Close to ${gate.level.replace(/_/g, " ")} but withheld: ${parts.join(" and ")}. ` +
    `${gate.speechSufficient && !speechGrounded ? "A speech event would also be enough on its own, but none is in evidence." : "Escalation above WATCH still needs either a speech event or persisted multi-signal agreement."}`
  );
}

function firstEmergency(
  signals: readonly TrendSignal[],
): { readonly signal: TrendSignal; readonly condition: EmergencyCondition } | undefined {
  for (const s of signals) {
    if (s.current === null) continue;
    for (const condition of EMERGENCY_CONDITIONS) {
      if (condition.observation === s.observation && emergencyFired(condition, s.current)) {
        return { signal: s, condition };
      }
    }
  }
  return undefined;
}

function nearEmergencyMisses(signals: readonly TrendSignal[]): readonly string[] {
  const out: string[] = [];
  for (const s of signals) {
    if (s.current === null) continue;
    for (const condition of EMERGENCY_CONDITIONS) {
      if (condition.observation !== s.observation) continue;
      if (emergencyFired(condition, s.current)) continue; // already handled as the real thing
      const ratio = emergencyDistanceRatio(condition, s.current);
      if (ratio <= NEAR_MISS.emergencyRatio) {
        out.push(
          `${s.observation} = ${s.current} is close to the defined emergency threshold of ${condition.threshold} but has not crossed it — corroborates, does not conclude on its own.`,
        );
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ helpers

function anchorSignal(concerning: readonly TrendSignal[]): TrendSignal | undefined {
  if (concerning.length === 0) return undefined;
  // Longest persistence first; observation name as the stable tiebreaker so
  // two equally-persistent signals never flip which one anchors the receipt
  // between runs on identical input.
  return [...concerning].sort((a, b) => {
    if (b.persistenceMs !== a.persistenceMs) return b.persistenceMs - a.persistenceMs;
    return a.observation < b.observation ? -1 : a.observation > b.observation ? 1 : 0;
  })[0];
}

function factsFor(trends: PatientTrends, history: PatientHistory): readonly ClinicalFact[] {
  if (trends.supportingFactIds.length === 0) return [];
  const ids = new Set(trends.supportingFactIds);
  return history.facts.filter((f) => ids.has(f.id));
}

/**
 * A "plan" fact with no "actions" fact of the same name is a planned thing
 * nobody has since documented as done — CLAUDE.md's flag, not a guess about
 * whether it happened.
 */
function unresolvedTasks(history: PatientHistory): readonly ClinicalFact[] {
  const done = new Set(
    history.facts.filter((f) => f.group === "actions").map((f) => f.name.toLowerCase()),
  );
  return history.facts.filter((f) => f.group === "plan" && !done.has(f.name.toLowerCase()));
}

function trendExplanation(s: TrendSignal): string {
  const deltaText =
    s.delta === null
      ? "no comparable baseline"
      : `${s.delta > 0 ? "+" : ""}${round1(s.delta)} from a baseline of ${s.baseline ?? "unknown"}`;
  const rateText = s.ratePerHour === null ? "" : `, ${round1(Math.abs(s.ratePerHour))}/hr`;
  return `${s.observation} is ${s.direction} at ${s.current ?? "unknown"} (${deltaText}${rateText}).`;
}

/**
 * Duration in the largest unit that still reads like something a nurse would
 * say out loud.
 *
 * Hours stop being informative fast. Real longitudinal data makes these
 * numbers big — a respiratory drift across a patient's charted history came
 * out as "held its worsening direction for 800 hours", which is arithmetically
 * correct and reads as a bug. Nobody on a ward says 800 hours; they say five
 * weeks. The number is the same, the sentence is the deliverable.
 */
function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;

  const hours = ms / HOUR;
  if (hours < 48) return `${round1(hours)} hour${hours === 1 ? "" : "s"}`;

  const days = hours / 24;
  if (days < 14) return `${round1(days)} day${round1(days) === 1 ? "" : "s"}`;

  const weeks = days / 7;
  return `${round1(weeks)} week${round1(weeks) === 1 ? "" : "s"}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function dedupe(ids: readonly string[]): readonly string[] {
  return Array.from(new Set(ids));
}
