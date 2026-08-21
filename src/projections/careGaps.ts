// Deterministic workflow memory. Tasks and gaps are projections of events;
// completing work requires an action event and therefore replays exactly.

import type {
  CareGap,
  CareTask,
  Event,
  Millis,
  PatientCare,
  PatientHistory,
  PatientTrends,
} from "../contracts/index.ts";

const HOUR = 3_600_000;
const PLAN_DUE_MS = 4 * HOUR;
const RESULT_REVIEW_DUE_MS = 2 * HOUR;
const REASSESSMENT_DUE_MS = 2 * HOUR;

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function completedBy(events: readonly Event[], createdAt: Millis, terms: readonly string[]): Event | undefined {
  return events.find((event) => {
    if (event.ts < createdAt || event.source !== "action" || event.value !== "completed") return false;
    const text = `${event.observation} ${event.quote}`.toLowerCase();
    return terms.some((term) => text.includes(term));
  });
}

function task(
  patientId: string,
  kind: CareTask["kind"],
  summary: string,
  createdAt: Millis,
  dueAt: Millis,
  evidenceEventIds: readonly string[],
  completion: Event | undefined,
  now: Millis,
): CareTask {
  return Object.freeze({
    id: `task_${patientId}_${kind}_${slug(summary)}`,
    patientId,
    kind,
    summary,
    createdAt,
    dueAt,
    status: completion ? "completed" : now > dueAt ? "overdue" : "open",
    completedAt: completion?.ts ?? null,
    evidenceEventIds: Object.freeze(completion ? [...evidenceEventIds, completion.id] : [...evidenceEventIds]),
  });
}

export function projectPatientCare(
  events: readonly Event[],
  history: PatientHistory,
  trends: PatientTrends,
  now: Millis,
): PatientCare {
  const visible = events.filter((e) => e.patientId === history.patientId && e.ts <= now);
  const tasks: CareTask[] = [];

  // A sustained multi-signal change creates a workflow obligation. This is
  // the deterministic bridge between "patient state rose" and "workflow has
  // not responded"; it never depends on an agent-generated recommendation.
  const concerning = trends.signals.filter((signal) => signal.concerning && signal.evidenceEventIds.length > 0);
  if (trends.agreementCount >= 2 && trends.persistenceMs > 0 && concerning.length >= 2) {
    const evidence = [...new Set(concerning.flatMap((signal) => signal.evidenceEventIds))];
    // Persistence tells us when the sustained change began. Using the newest
    // evidence timestamp would restart the deadline on every worsening sample
    // and could hide a care gap forever.
    const createdAt = Math.max(0, now - trends.persistenceMs);
    const completion = completedBy(visible, createdAt, ["reassess", "escalat", "clinical review"]);
    tasks.push(task(
      history.patientId,
      "reassessment",
      "Clinical reassessment after sustained multi-signal deterioration",
      createdAt,
      createdAt + REASSESSMENT_DUE_MS,
      evidence,
      completion,
      now,
    ));
  }

  for (const signal of trends.signals.filter((s) => s.overdue && s.sinceLastSampleMs !== null)) {
    const createdAt = now - signal.sinceLastSampleMs!;
    const dueAt = now - Math.max(0, signal.sinceLastSampleMs! - HOUR);
    const completion = completedBy(visible, createdAt, [signal.observation, "observation"]);
    tasks.push(task(history.patientId, "observation", `Record ${signal.observation}`, createdAt, dueAt, signal.evidenceEventIds, completion, now));
  }

  const completedPlans = new Set(history.facts.filter((f) => f.group === "actions").map((f) => f.name.toLowerCase()));
  for (const fact of history.facts.filter((f) => f.group === "plan" && !completedPlans.has(f.name.toLowerCase()))) {
    const completion = completedBy(visible, fact.observedAt, [fact.name.toLowerCase(), "reassess"]);
    tasks.push(task(history.patientId, "plan", fact.name, fact.observedAt, fact.observedAt + PLAN_DUE_MS, fact.evidenceEventIds, completion, now));
  }

  for (const result of visible.filter((e) => e.source === "result")) {
    const completion = completedBy(visible, result.ts, [result.observation.toLowerCase(), "review"]);
    tasks.push(task(history.patientId, "review", `Review ${result.observation}`, result.ts, result.ts + RESULT_REVIEW_DUE_MS, [result.id], completion, now));
  }

  const gaps: CareGap[] = tasks.filter((t) => t.status === "overdue").map((t) => {
    const kind: CareGap["kind"] = t.kind === "reassessment"
      ? "missing-reassessment"
      : t.kind === "observation"
      ? "overdue-observation"
      : t.kind === "review"
        ? "unreviewed-result"
        : "unresolved-plan";
    const overdueMs = now - t.dueAt;
    return Object.freeze({
      id: `gap_${t.id}`,
      patientId: t.patientId,
      kind,
      summary: t.summary,
      whyNow: `${t.summary} passed its documented deadline ${formatDuration(overdueMs)} ago and no completing action is in the event log.`,
      openedAt: t.createdAt,
      dueAt: t.dueAt,
      overdueMs,
      evidenceEventIds: t.evidenceEventIds,
      taskId: t.id,
    });
  });

  return Object.freeze({ patientId: history.patientId, asOf: now, tasks: Object.freeze(tasks), gaps: Object.freeze(gaps) });
}

function formatDuration(ms: Millis): string {
  const hours = Math.max(0, Math.round((ms / HOUR) * 10) / 10);
  return hours < 1 ? `${Math.round(ms / 60_000)} minutes` : `${hours} hour${hours === 1 ? "" : "s"}`;
}
