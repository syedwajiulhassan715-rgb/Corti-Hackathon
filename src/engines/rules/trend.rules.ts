// Trend rules. For each observation the trend engine watches: which direction
// is clinically bad, how big a move counts, how far back the baseline looks,
// and how long is too long to go quiet.
//
// Data, not behaviour. engines/patientTrend.ts matches this file; this file
// says what to look for. Changing a threshold or an expected interval touches
// no code here or in the engine — that is the entire point of keeping it data.
//
// WHY DIRECTION IS DATA, NOT LOGIC (the central house rule for this file):
// "abnormal" is not a property of a number, it is a property of a direction
// for a given observation. SpO2 falling is bad. Systolic BP rising is bad.
// Temperature rising is bad. A single isConcerning() function that inspected
// the observation name and branched would smuggle the same knowledge into
// code where a reviewer would have to trust it instead of read it. Here it is
// one row per observation, so a doctor can check it without reading
// TypeScript.

export type BadDirection = "rising" | "falling";

export interface TrendRule {
  /** Matches Event.observation / SeriesPoint key, e.g. "systolic_bp". */
  readonly observation: string;
  /** Which direction of movement is clinically concerning for this reading. */
  readonly badDirection: BadDirection;
  /**
   * Minimum |delta| (current - baseline, same units as the series) before a
   * move in the bad direction counts as `concerning`. Guards against calling
   * a move "concerning" when it is really just measurement noise: without a
   * floor, a 0.1-point wobble in the bad direction would flip a signal.
   */
  readonly concerningDeltaAtLeast: number;
  /**
   * Expected maximum gap between samples for this observation, in ms. Longer
   * than this since the last sample and `overdue` fires.
   *
   * Set with SLACK above the ward's actual observation cadence, never equal to
   * it. simulation/ward.ts observes every 4h; if this said 4h too, then every
   * patient on the ward would be permanently one tick late and the silence
   * signal would fire for all eleven at once — indistinguishable from firing
   * for nobody. A gap only means something if the normal case clears it. This is the number
   * that makes silence a first-class signal instead of a missing card: the
   * engine does not have to guess what "too long" means, this file says so.
   */
  readonly expectedIntervalMs: number;
  /**
   * The upper edge of `overdue`,
    maxOverdueMs: 24 * HOUR, in ms. Past this, the observation is not
   * late — it is simply not being taken, and the patient is not under active
   * monitoring for it.
   *
   * WITHOUT THIS BOUND THE SILENCE SIGNAL EATS THE WARD, and that is not a
   * theory: the provided charts are historical, so on first integration every
   * one of the eleven patients reported overdue, one of them by 10,484 hours,
   * and the attention queue below the top patient ranked purely on who had
   * been quiet longest. Meaningless ordering presented as clinical priority.
   *
   * The distinction is clinical, not cosmetic. "Nobody has taken this
   * patient's blood pressure this shift" is an actionable gap. "This patient's
   * last recorded blood pressure was fourteen months ago in an outpatient
   * clinic" is not a gap at all — there is no monitoring episode to be late
   * for. Only the first is worth a nurse's attention, so only the first fires.
   */
  readonly maxOverdueMs: number;
  /**
   * How far back the baseline window reaches from the start of the observed
   * period (the earliest sample in the series), in ms. The mean of samples
   * inside this window, taken from the start of the series, is the baseline.
   *
   * Deliberately short — shorter than `expectedIntervalMs` — so the baseline
   * captures the reading(s) taken when observation began and nothing later.
   * A window as wide as the whole series would average the baseline together
   * with the very drift it exists to detect, which would shrink every delta
   * on a short series and defeat the "own earlier value" claim in SPEC.md.
   */
  readonly baselineWindowMs: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * One row per observation the trend engine understands. An observation
 * absent from this table is not tracked for trend purposes — patientTrend
 * simply will not emit a signal for it, which is a safer default than
 * guessing a direction or an interval for something nobody has reviewed.
 */
export const TREND_RULES: readonly TrendRule[] = Object.freeze([
  Object.freeze({
    observation: "systolic_bp",
    badDirection: "rising" as BadDirection,
    concerningDeltaAtLeast: 10,
    expectedIntervalMs: 6 * HOUR,
    maxOverdueMs: 24 * HOUR,
    baselineWindowMs: 30 * MINUTE,
  }),
  Object.freeze({
    observation: "diastolic_bp",
    badDirection: "rising" as BadDirection,
    concerningDeltaAtLeast: 6,
    expectedIntervalMs: 6 * HOUR,
    maxOverdueMs: 24 * HOUR,
    baselineWindowMs: 30 * MINUTE,
  }),
  Object.freeze({
    observation: "heart_rate",
    badDirection: "rising" as BadDirection,
    concerningDeltaAtLeast: 15,
    expectedIntervalMs: 6 * HOUR,
    maxOverdueMs: 24 * HOUR,
    baselineWindowMs: 30 * MINUTE,
  }),
  Object.freeze({
    observation: "spo2",
    badDirection: "falling" as BadDirection,
    concerningDeltaAtLeast: 3,
    expectedIntervalMs: 6 * HOUR,
    maxOverdueMs: 24 * HOUR,
    baselineWindowMs: 30 * MINUTE,
  }),
  Object.freeze({
    observation: "temperature",
    badDirection: "rising" as BadDirection,
    concerningDeltaAtLeast: 0.5,
    expectedIntervalMs: 6 * HOUR,
    maxOverdueMs: 24 * HOUR,
    baselineWindowMs: 30 * MINUTE,
  }),
  Object.freeze({
    observation: "respiratory_rate",
    badDirection: "rising" as BadDirection,
    concerningDeltaAtLeast: 4,
    expectedIntervalMs: 6 * HOUR,
    maxOverdueMs: 24 * HOUR,
    baselineWindowMs: 30 * MINUTE,
  }),
]);

const RULES_BY_OBSERVATION: Readonly<Record<string, TrendRule>> = Object.freeze(
  Object.fromEntries(TREND_RULES.map((r) => [r.observation, r])),
);

/** The rule for one observation, or null when the observation is untracked. */
export function trendRuleFor(observation: string): TrendRule | null {
  return RULES_BY_OBSERVATION[observation] ?? null;
}
