import type { EventId, Millis, PatientId } from "./events.ts";

export type TaskStatus = "open" | "completed" | "overdue";

/** A workflow obligation projected from evidence; never an independently stored row. */
export interface CareTask {
  readonly id: string;
  readonly patientId: PatientId;
  readonly kind: "reassessment" | "observation" | "review" | "plan";
  readonly summary: string;
  readonly createdAt: Millis;
  readonly dueAt: Millis;
  readonly status: TaskStatus;
  readonly completedAt: Millis | null;
  readonly evidenceEventIds: readonly EventId[];
}

export type CareGapKind =
  | "missing-reassessment"
  | "overdue-observation"
  | "unreviewed-result"
  | "unresolved-plan";

/** A gap exists when patient state or documented intent moves faster than workflow. */
export interface CareGap {
  readonly id: string;
  readonly patientId: PatientId;
  readonly kind: CareGapKind;
  readonly summary: string;
  readonly whyNow: string;
  readonly openedAt: Millis;
  readonly dueAt: Millis;
  readonly overdueMs: Millis;
  readonly evidenceEventIds: readonly EventId[];
  readonly taskId: string;
}

export interface PatientCare {
  readonly patientId: PatientId;
  readonly asOf: Millis;
  readonly tasks: readonly CareTask[];
  readonly gaps: readonly CareGap[];
}
