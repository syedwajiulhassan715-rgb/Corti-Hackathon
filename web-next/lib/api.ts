// The one place the UI talks to the domain.
//
// Types are hand-mirrored from src/contracts/*.ts rather than imported: this is
// a separate TypeScript project with its own tsconfig, and reaching across the
// boundary would couple the Next build to the Node build. The shapes are small
// and stable, and lib/api.test-shape.ts pins the ones that matter.
//
// THE SCRUB AND THE SIMULATION CLOCK ARE THE SAME MECHANISM. Every call takes
// `until` and the server folds the log to that moment. There is no play state
// on the server and no socket — advancing the demo is just asking about a later
// millisecond, which is why replay is exact and why the UI can never drift out
// of sync with the log it is describing.

// Empty means same-origin. src/server/index.ts serves both this build and the
// API from one port, so relative URLs are correct and the UI cannot end up
// pointing at a stale port. Override only when running `next dev` separately.
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** Offset zero for the demo, mirroring DEMO_T0 in src/server/index.ts. */
export const DEMO_T0 = 1_787_212_800_000;
/** The ward's observation cadence, mirroring DEMO_STEP_MS. */
export const DEMO_STEP_MS = 4 * 3_600_000;
/** How many advances the scripted demo runs for. */
export const DEMO_STEPS = 4;

export type PriorityLevel =
  | "GREEN"
  | "WATCH"
  | "PERSISTING_CONCERN"
  | "HIGH"
  | "CRITICAL";

export interface PriorityComponent {
  name: string;
  explanation: string;
  points: number;
  evidenceEventIds: string[];
}

export interface QueueRow {
  patientId: string;
  name: string;
  room: string | null;
  level: PriorityLevel;
  rank: number;
  score: number;
  reasons: string[];
  withheld: string[];
  components: PriorityComponent[];
  evidenceEventIds: string[];
  previousLevel: PriorityLevel | null;
  locationStatus: "bed" | "stretcher" | "walking" | string;
  locationEventId: string | null;
}

export interface WardResponse {
  until: number;
  replayed: boolean;
  generated_from_events: number;
  counts: Record<PriorityLevel, number>;
  queue: QueueRow[];
}

export interface EchoEvent {
  id: string;
  ts: number;
  patientId: string;
  room: string;
  source: "speech" | "vital" | "lab" | "movement" | "order" | "result" | "action";
  speaker: string;
  quote: string;
  code: string | null;
  observation: string;
  value: number | string | null;
  correlationId?: string;
  causedByEventIds?: string[];
}

export interface DemoActivity {
  id: string;
  at: number;
  type: string;
  source: string;
  label: string;
  detail?: string;
  eventIds: string[];
  causedByEventIds: string[];
}

export interface DemoTranscriptSegment {
  eventId: string;
  cortiId: string;
  startSeconds: number;
  endSeconds: number;
  speakerId: number;
  text: string;
}

export interface DemoRunSnapshot {
  runId: string;
  patientId: string;
  room: string;
  mode: "live" | "recorded";
  status: "connecting" | "recording" | "processing" | "ready" | "failed" | "ended";
  startedAt: number;
  projectionUntil: number;
  interactionId: string | null;
  monitorStep: number;
  initialLevel: PriorityLevel;
  initialRank: number;
  notificationEventId: string | null;
  error: string | null;
  transcriptSegments: DemoTranscriptSegment[];
  partialTranscript: string | null;
  activities: DemoActivity[];
  patient?: { patientId: string; displayId: string; name: string; room: string; mrn: string };
  events?: EchoEvent[];
  evidenceEvents?: EchoEvent[];
  history?: PatientResponse["history"];
  trends?: PatientResponse["trends"];
  care?: PatientResponse["care"];
  priority?: QueueRow | null;
  queue?: QueueRow[];
  proposals?: Proposal[];
}

export interface SeriesPoint {
  ts: number;
  value: number;
  eventId: string;
}

export interface ClinicalFact {
  id: string;
  patientId: string;
  observedAt: number;
  group: string;
  name: string;
  value?: string | number | boolean;
  direction?: string;
  speaker?: string;
  quote?: string;
  code?: string | null;
  evidenceEventIds: string[];
  source: string;
}

export interface TrendSignal {
  observation: string;
  baseline: number | null;
  current: number | null;
  delta: number | null;
  direction: string;
  ratePerHour: number | null;
  persistenceMs: number;
  sampleCount: number;
  concerning: boolean;
  sinceLastSampleMs: number | null;
  overdue: boolean;
  evidenceEventIds: string[];
}

export interface PatientResponse {
  until: number;
  patient: {
    patientId: string;
    name: string;
    mrn: string;
    summary: string;
    room: string | null;
    simulated: boolean;
  };
  history: {
    conditions: { code: string; label: string; status: string }[];
    medications: { name: string; dose: string; frequency: string }[];
    facts: ClinicalFact[];
    series: Record<string, SeriesPoint[]>;
    timeline: string[];
  };
  trends: {
    signals: TrendSignal[];
    agreementCount: number;
    persistenceMs: number;
    supportingFactIds: string[];
  };
  care: {
    tasks: CareTask[];
    gaps: CareGap[];
  };
  priority: QueueRow | null;
  role: { patientId: string; shape: string; note: string } | null;
  events: EchoEvent[];
}

export interface CareTask {
  id: string;
  kind: "reassessment" | "observation" | "review" | "plan";
  summary: string;
  createdAt: number;
  dueAt: number;
  status: "open" | "completed" | "overdue";
  completedAt: number | null;
  evidenceEventIds: string[];
}

export interface CareGap {
  id: string;
  kind: "missing-reassessment" | "overdue-observation" | "unreviewed-result" | "unresolved-plan";
  summary: string;
  whyNow: string;
  openedAt: number;
  dueAt: number;
  overdueMs: number;
  evidenceEventIds: string[];
  taskId: string;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${path} -> HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export const getWard = (until: number) => get<WardResponse>(`/api/ward?until=${until}`);

export const getPatient = (patientId: string, until: number) =>
  get<PatientResponse>(`/api/patient/${encodeURIComponent(patientId)}?until=${until}`);

export async function resetDemo(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/reset`, { method: "POST" });
  if (!response.ok) throw new Error(`reset -> HTTP ${response.status}`);
}

export async function recordObservation(input: {
  requestId: string;
  patientId: string;
  observedAt: number;
  note?: string;
  vitals: Partial<Record<"systolic_bp" | "diastolic_bp" | "heart_rate" | "spo2" | "respiratory_rate" | "temperature", number>>;
}): Promise<{ ok: true; eventIds: string[]; historyUpdated: true; duplicate: boolean }> {
  const response = await fetch(`${API_BASE}/api/observations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `observations -> HTTP ${response.status}`);
  }
  return (await response.json()) as { ok: true; eventIds: string[]; historyUpdated: true; duplicate: boolean };
}

/** The moment a given demo step describes. Step 0 is the ward before anything. */
export const momentForStep = (step: number) => DEMO_T0 + step * DEMO_STEP_MS;

export const LEVEL_LABEL: Record<PriorityLevel, string> = {
  GREEN: "Stable",
  WATCH: "Watch",
  PERSISTING_CONCERN: "Persisting concern",
  HIGH: "High",
  CRITICAL: "Critical",
};

/**
 * Level -> token name. Colour is never the only carrier: callers must render
 * LEVEL_LABEL too. See the note in tailwind.config.ts.
 */
export const LEVEL_TOKEN: Record<PriorityLevel, string> = {
  GREEN: "green",
  WATCH: "watch",
  PERSISTING_CONCERN: "concern",
  HIGH: "high",
  CRITICAL: "critical",
};

// ------------------------------------------------------------- proposals

export interface Staff {
  id: string;
  name: string;
  role: "nurse" | "doctor" | "senior";
  available: boolean;
}

export interface Proposal {
  id: string;
  patientId: string;
  patientName: string;
  kind: "reassess" | "assign" | "escalate" | "handoff" | "observe";
  summary: string;
  rationale: string;
  level: PriorityLevel;
  rank: number;
  assignee: Staff | null;
  evidenceEventIds: string[];
  proposedAt: number;
  status: "pending" | "approved" | "rejected";
  /** True when Corti wrote the rationale; false when the deterministic
   *  fallback did. Shown in the UI — the honesty law applies to provenance,
   *  not only to fake data. */
  generated: boolean;
  coordination: {
    status: "ready" | "degraded";
    source: "fixture-mcp";
    nurse: Staff | null;
    clinician: Staff | null;
    nextSlot: { at: number; label: string } | null;
    checks: string[];
    degradedReason: string | null;
  };
}

export const getProposals = (until: number) =>
  get<{ until: number; proposals: Proposal[]; roster: Staff[] }>(
    `/api/proposals?until=${until}`,
  );

/** The one call that changes state. Everything else is a fold. */
export async function decide(input: {
  proposalId: string;
  approved: boolean;
  decidedBy?: string;
  note?: string;
  until: number;
}): Promise<{ ok: boolean; eventId: string }> {
  const response = await fetch(`${API_BASE}/api/decide`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`decide -> HTTP ${response.status}`);
  return (await response.json()) as { ok: boolean; eventId: string };
}

// ---------------------------------------------------------- live demo pipeline

async function demoJson(response: Response): Promise<DemoRunSnapshot> {
  const body = (await response.json()) as DemoRunSnapshot & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Demo pipeline -> HTTP ${response.status}`);
  return body;
}

export async function createDemoRun(input: { patientId: string; mode: "live" | "recorded"; audioFormat?: string }): Promise<DemoRunSnapshot> {
  return demoJson(await fetch(`${API_BASE}/api/demo/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }));
}

export const getDemoRun = (runId: string) => get<DemoRunSnapshot>(`/api/demo/runs/${encodeURIComponent(runId)}`);

export async function sendDemoAudio(runId: string, sequence: number, chunk: Blob): Promise<void> {
  const response = await fetch(`${API_BASE}/api/demo/runs/${encodeURIComponent(runId)}/audio`, { method: "POST", headers: { "Content-Type": chunk.type || "application/octet-stream", "X-ECHO-Audio-Sequence": String(sequence) }, body: chunk });
  if (!response.ok) throw new Error(`Audio delivery -> HTTP ${response.status}`);
}

export async function endDemoEncounter(runId: string): Promise<DemoRunSnapshot> {
  return demoJson(await fetch(`${API_BASE}/api/demo/runs/${encodeURIComponent(runId)}/end`, { method: "POST" }));
}

export async function advanceDemoMonitor(runId: string, expectedStep: number): Promise<DemoRunSnapshot> {
  return demoJson(await fetch(`${API_BASE}/api/demo/runs/${encodeURIComponent(runId)}/monitor`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedStep }) }));
}

export async function decideDemoRun(runId: string, input: { proposalId: string; approved: boolean; decidedBy?: string; note?: string }): Promise<{ ok: boolean; eventId: string }> {
  const response = await fetch(`${API_BASE}/api/demo/runs/${encodeURIComponent(runId)}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!response.ok) throw new Error(`Demo decision -> HTTP ${response.status}`);
  return (await response.json()) as { ok: boolean; eventId: string };
}
