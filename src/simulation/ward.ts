// The demo ward: which patients are living which story, and the one function
// that assembles the whole event log.
//
// WHY THIS FILE EXISTS. The engines were built and tested in isolation and
// each one was correct, but the first time the whole ward was folded the
// attention queue below the top patient was meaningless: every provided chart
// is historical, so ten of eleven patients ranked on nothing but who had been
// quiet longest. Fixing the engine (trend.rules maxOverdueMs) removed the
// noise and left the opposite problem — a ward where one patient is HIGH and
// ten sit at zero, which is a board with nothing to read.
//
// A ward view is only convincing if it discriminates in BOTH directions: some
// patients climbing, some deliberately not. That needs the trajectory shapes
// in simulation/trajectory.ts to actually be assigned to somebody, which is
// what this table does.
//
// FAKED, DELIBERATELY AND VISIBLY (honesty law). The charted past is real
// organiser fixture data. Everything this file projects FORWARD of the last
// charted date is simulated, deterministic, and labelled as such wherever it
// surfaces. No dice, no clock — same rule as world/feeds.ts, for the same
// reason: a jury that asks "run that again" must get the same ward.
//
// CASTING IS CLINICAL, NOT ARBITRARY. Each assignment below is a story the
// patient's own chart already supports, so the simulated future is continuous
// with the real past rather than contradicting it.

import { buildTrajectory, elenaPetrovaAcceptanceLadder, type Baseline, type TrajectoryShape } from "./trajectory.ts";
import { conversationEvents, CONVERSATION_OFFSET_MS } from "./conversation.ts";
import { loadChartEvents } from "../world/chart.ts";
import { ALL_PATIENTS, roomForPatient } from "../world/patients.ts";
import type { EventInput, Millis, PatientId } from "../contracts/index.ts";

const HOUR = 3_600_000;

export interface WardRole {
  readonly patientId: PatientId;
  readonly shape: TrajectoryShape;
  /**
   * Stop observing this patient after N forward points.
   *
   * This is how the silence signal gets a demo, and it has to be a TRAILING
   * OFF rather than never observing at all. A patient with no forward points
   * is already past maxOverdueMs when the demo starts, so the engine correctly
   * reads them as "not under monitoring" and says nothing — which is right,
   * and useless on stage. Observing them on cadence and then stopping is the
   * real ward failure: someone was being watched, and then quietly wasn't.
   */
  readonly observeSteps?: number;
  /** Why this patient carries this arc. Read on stage; keep it one sentence. */
  readonly note: string;
}

/**
 * Who is doing what during the demo.
 *
 * Three arcs move and eight hold. That ratio is the point: a board where
 * everything is red is a board nobody reads, and the only way to show the
 * system discriminates is to show it declining to escalate people.
 */
export const WARD_ROLES: readonly WardRole[] = Object.freeze([
  Object.freeze({
    patientId: "elena_petrova",
    shape: "gradual-hypertension" as TrajectoryShape,
    note:
      "The demo's spine. Treated pneumonia, AF on the problem list. Climbs " +
      "WATCH -> PERSISTING_CONCERN -> HIGH on the SPEC acceptance ladder, on " +
      "numbers agreeing over time rather than on any single alarming reading.",
  }),
  Object.freeze({
    patientId: "robert_okafor",
    shape: "gradual-respiratory-deterioration" as TrajectoryShape,
    note:
      "Anterior STEMI, PCI, then post-MI HFrEF across four charted encounters. " +
      "Fluid overload after an infarct is the textbook complication, so a " +
      "drifting respiratory picture is the arc his own chart already predicts.",
  }),
  Object.freeze({
    patientId: "maria_gonzalez",
    shape: "medication-related" as TrajectoryShape,
    note:
      "HFrEF, LVEF 32%, on a titrated heart-failure regimen. Her chart notes a " +
      "stable daily weight; a medication-related drift is the second patient " +
      "climbing, so the queue has to choose between two rising patients.",
  }),
  Object.freeze({
    patientId: "harold_mitchell",
    shape: "stable" as TrajectoryShape,
    observeSteps: 2,
    note:
      "77, multimorbid, comprehensive geriatric assessment, spouse as carer. " +
      "Clinically stable and quietly stops being observed — the patient a busy " +
      "ward loses track of. Nothing is wrong with his numbers; the gap IS the " +
      "finding, and no threshold alarm on the market would ever raise it.",
  }),
  Object.freeze({
    patientId: "aisha_rahman",
    shape: "stable" as TrajectoryShape,
    note:
      "Breast cancer survivorship, no evidence of disease. Stays green on " +
      "purpose — she is the control, and the proof the board discriminates.",
  }),
]);

/** Everyone not cast above simply holds their charted state. */
const DEFAULT_SHAPE: TrajectoryShape = "stable";

/**
 * The last value of every observation in `events`, per patient.
 *
 * The trajectory projects forward FROM the chart rather than from a literal,
 * so a patient's simulated future starts where their real record stopped.
 * An observation the chart never recorded gets no baseline and is therefore
 * never projected — trajectory.ts refuses to invent a starting point, which
 * is the same rule world/chart.ts follows when it skips a value it cannot
 * parse confidently.
 */
function baselineFrom(events: readonly EventInput[], patientId: PatientId): Baseline {
  const latest: Record<string, { ts: Millis; value: number }> = {};
  for (const event of events) {
    if (event.patientId !== patientId) continue;
    if (typeof event.value !== "number") continue;
    const held = latest[event.observation];
    if (held === undefined || event.ts >= held.ts) {
      latest[event.observation] = { ts: event.ts, value: event.value };
    }
  }
  const baseline: Record<string, number> = {};
  for (const [observation, held] of Object.entries(latest)) {
    baseline[observation] = held.value;
  }
  return Object.freeze(baseline);
}

export interface WardLogOptions {
  /**
   * The moment the simulated forward arcs begin. Supplied by the caller — this
   * module reads no clock (D8), so the same startTs always produces the same
   * ward.
   */
  readonly startTs: Millis;
  /** Gap between simulated points. */
  readonly stepMs?: Millis;
}

/**
 * Every event the demo ward is built from, in timestamp order.
 *
 * Charted past first, then the simulated future. Sorting by ts and breaking
 * ties on patientId keeps the output byte-identical across runs, which is what
 * makes replay to T exact.
 */
export function wardEvents(options: WardLogOptions): readonly EventInput[] {
  const stepMs = options.stepMs ?? 4 * HOUR;
  const shapeFor = new Map(WARD_ROLES.map((r) => [r.patientId, r.shape]));
  const observeSteps = new Map(
    WARD_ROLES.filter((r) => r.observeSteps !== undefined).map(
      (r) => [r.patientId, r.observeSteps!] as const,
    ),
  );

  const charted: EventInput[] = [];
  for (const patientId of ALL_PATIENTS) {
    const room = roomForPatient(patientId) ?? "room-00";
    charted.push(...loadChartEvents(patientId, room));
  }

  const projected: EventInput[] = [];
  for (const patientId of ALL_PATIENTS) {
    const room = roomForPatient(patientId) ?? "room-00";
    const shape = shapeFor.get(patientId) ?? DEFAULT_SHAPE;

    // Elena's ladder is a literal, not a formula: the demo is scripted against
    // those exact digits and must not become hostage to chart-parsing drift.
    // See ELENA_PETROVA_ACCEPTANCE_LADDER in trajectory.ts.
    if (patientId === "elena_petrova") {
      projected.push(...elenaPetrovaAcceptanceLadder(room, options.startTs, stepMs));
      // The one real conversation in the ward (simulation/conversation.ts),
      // shifted to start CONVERSATION_OFFSET_MS after T0 so its quotes are
      // already in her history before the ladder's first vital update — see
      // that constant's comment for why the offset is what it is.
      projected.push(...conversationEvents({ startTs: options.startTs + CONVERSATION_OFFSET_MS }));
      continue;
    }

    const arc = buildTrajectory(
      shape,
      patientId,
      baselineFrom(charted, patientId),
      room,
      options.startTs,
      stepMs,
    );

    // A patient cast to stop being observed keeps only the first N ticks.
    // Cutting by timestamp rather than by array position, because one tick
    // emits several events (one per observation) and slicing the array would
    // cut a patient off mid-reading.
    const limit = observeSteps.get(patientId);
    projected.push(
      ...(limit === undefined
        ? arc
        : arc.filter((e) => e.ts <= options.startTs + limit * stepMs)),
    );
  }

  // Operational context enters through the same event log as every other
  // observation. It does not diagnose anything; it changes the ward surface
  // and gives staff a visible transport-context notification.
  const transportRoom = roomForPatient("robert_okafor") ?? "room-09";
  projected.push({
    ts: options.startTs + 3 * (options.stepMs ?? 4 * HOUR),
    patientId: "robert_okafor",
    room: transportRoom,
    source: "movement",
    speaker: "unknown",
    quote: "Simulated transport feed: patient moved onto a stretcher for imaging.",
    code: null,
    observation: "mobility_context",
    value: "stretcher",
  });

  return Object.freeze(
    [...charted, ...projected].sort(
      (a, b) => a.ts - b.ts || a.patientId.localeCompare(b.patientId),
    ),
  );
}
