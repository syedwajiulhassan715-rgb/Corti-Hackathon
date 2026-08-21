// The Trend Engine. docs/SPEC.md "The core insight": not "is this number
// abnormal?" but "is this patient's own trajectory bending, and does more
// than one signal agree?"
//
// Pure function of a PatientHistory. No clock, no network, no stored state.
// `now` is an explicit argument (D8) — live callers pass Date.now(), replay
// passes the timestamp of the last event read. Never calls Date.now() itself.
//
// WHY BASELINE IS NEVER A POPULATION RANGE (docs/SPEC.md):
// 145/90 is unremarkable for a population and a large move for someone whose
// own four-day baseline is 128/80. So `baseline` here is always the mean of
// THIS patient's own samples over the baseline window at the START of the
// observed period — never a normal range pulled from a chart or a guideline.
//
// WHY DIRECTION-IS-BAD IS DATA (rules/trend.rules.ts):
// SpO2 falling is bad, systolic BP rising is bad, temperature rising is bad.
// Which way is bad is a clinical fact about the observation, not a property
// of the number, so it lives in trend.rules.ts as data. This file only reads
// that table; it never branches on an observation name.
//
// WHY ONE SAMPLE IS NEVER A TREND: the whole product rests on refusing to
// conclude from a single reading. With fewer than two samples, direction is
// "unknown", ratePerHour is null, persistenceMs is 0 and concerning is false,
// unconditionally, no matter what the lone value looks like.
//
// WHY SILENCE IS A SIGNAL: a patient nobody has observed in the expected
// interval is a first-class trend, not a missing card. `overdue` is computed
// for every tracked observation, even ones the ward has stopped sampling,
// because the absence is exactly what a nurse skimming a busy shift would
// miss.

import type {
  Direction,
  EventId,
  Millis,
  PatientHistory,
  PatientTrends,
  SeriesPoint,
  TrendSignal,
} from "../contracts/index.ts";
import { TREND_RULES, trendRuleFor, type TrendRule } from "./rules/trend.rules.ts";

/** -1, 0 or 1 for a signed number, treating anything within a tolerance as flat. */
function sign(n: number): -1 | 0 | 1 {
  if (n > 0) return 1;
  if (n < 0) return -1;
  return 0;
}

/**
 * Mean of this patient's own samples inside the baseline window measured from
 * the start of the observed period (the earliest sample). Never a population
 * figure — see the file header. Null only when there is nothing to average,
 * which cannot happen once `points` is non-empty because the first point is
 * always inside its own window.
 */
function computeBaseline(points: readonly SeriesPoint[], rule: TrendRule): {
  baseline: number | null;
  baselinePoints: readonly SeriesPoint[];
} {
  if (points.length === 0) return { baseline: null, baselinePoints: [] };
  const start = points[0].ts;
  const windowEnd = start + rule.baselineWindowMs;
  const baselinePoints = points.filter((p) => p.ts <= windowEnd);
  const sum = baselinePoints.reduce((acc, p) => acc + p.value, 0);
  return { baseline: sum / baselinePoints.length, baselinePoints };
}

/**
 * How long, in ms, the run of same-signed point-to-point movement at the end
 * of the series has held. Walks backward from the latest sample while each
 * step's sign matches (or is flat against) the overall direction; stops at
 * the first reversal. 0 with fewer than two points, by construction of the
 * caller.
 */
function computePersistenceMs(points: readonly SeriesPoint[], overallSign: -1 | 0 | 1): Millis {
  if (points.length < 2) return 0;
  let runStart = points.length - 1;
  for (let i = points.length - 1; i > 0; i -= 1) {
    const stepSign = sign(points[i].value - points[i - 1].value);
    if (stepSign === overallSign || stepSign === 0) {
      runStart = i - 1;
    } else {
      break;
    }
  }
  return points[points.length - 1].ts - points[runStart].ts;
}

function dedupeIds(ids: readonly (EventId | undefined)[]): readonly EventId[] {
  const seen = new Set<EventId>();
  const out: EventId[] = [];
  for (const id of ids) {
    if (id === undefined) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return Object.freeze(out);
}

function computeSignal(patientId: string, rule: TrendRule, points: readonly SeriesPoint[], now: Millis): TrendSignal {
  const sampleCount = points.length;
  const last = sampleCount > 0 ? points[sampleCount - 1] : null;
  const current = last ? last.value : null;

  const { baseline, baselinePoints } = computeBaseline(points, rule);

  // Missing data yields nulls, never zeros: delta is null unless both sides exist.
  const delta = current !== null && baseline !== null ? current - baseline : null;

  // ONE SAMPLE IS NEVER A TREND. Below this, everything derived is forced,
  // regardless of what the single value looks like.
  let direction: Direction = "unknown";
  let ratePerHour: number | null = null;
  let persistenceMs: Millis = 0;
  let concerning = false;

  if (sampleCount >= 2 && delta !== null) {
    const badSign: -1 | 1 = rule.badDirection === "rising" ? 1 : -1;
    const overallSign = sign(delta);

    if (Math.abs(delta) < rule.concerningDeltaAtLeast) {
      direction = "stable";
    } else if (overallSign === badSign) {
      direction = "worsening";
    } else {
      direction = "improving";
    }
    concerning = direction === "worsening";

    const elapsedMs = points[sampleCount - 1].ts - points[0].ts;
    ratePerHour = elapsedMs > 0 ? (delta / elapsedMs) * 3_600_000 : null;

    persistenceMs = computePersistenceMs(points, overallSign);
  }

  const sinceLastSampleMs = last ? now - last.ts : null;
  // Overdue is a BAND, not a threshold. Below expectedIntervalMs the
  // observation is current; above maxOverdueMs the patient is not being
  // monitored for it at all, which is a different fact and not this signal's
  // to report. See the maxOverdueMs comment in trend.rules.ts for what
  // happened when this was an unbounded ">".
  const overdue =
    sinceLastSampleMs !== null &&
    sinceLastSampleMs > rule.expectedIntervalMs &&
    sinceLastSampleMs <= rule.maxOverdueMs;

  const evidenceEventIds = dedupeIds([...baselinePoints.map((p) => p.eventId), last?.eventId]);

  return Object.freeze({
    patientId,
    observation: rule.observation,
    baseline,
    current,
    delta,
    direction,
    ratePerHour,
    persistenceMs,
    sampleCount,
    concerning,
    sinceLastSampleMs,
    overdue,
    evidenceEventIds,
  } satisfies TrendSignal);
}

/**
 * Every trend ECHO tracks for one patient, as at `now`, plus what they agree
 * about. One signal per observation named in rules/trend.rules.ts — an
 * observation absent from that table is not evaluated, per the rules file's
 * own note: guessing a direction or an interval for something nobody has
 * reviewed is worse than saying nothing.
 */
export function patientTrend(history: PatientHistory, now: Millis): PatientTrends {
  const signals = TREND_RULES.map((rule) => {
    const points = history.series[rule.observation] ?? [];
    return computeSignal(history.patientId, rule, points, now);
  });

  const concerningSignals = signals.filter((s) => s.concerning);
  const agreementCount = concerningSignals.length;
  const persistenceMs = concerningSignals.reduce((max, s) => Math.max(max, s.persistenceMs), 0);

  const supportingFactIds = Object.freeze(
    history.facts.filter((f) => f.direction === "worsening").map((f) => f.id),
  );

  return Object.freeze({
    patientId: history.patientId,
    asOf: now,
    signals: Object.freeze(signals),
    agreementCount,
    persistenceMs,
    supportingFactIds,
  } satisfies PatientTrends);
}

// Exported for tests only — not part of the module's contract surface.
export const _internal = Object.freeze({ trendRuleFor });
