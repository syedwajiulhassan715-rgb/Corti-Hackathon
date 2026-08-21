// The contract surface. Import types from here, not from the module that
// happens to use them.

export type {
  Event,
  EventId,
  EventInput,
  Millis,
  PatientId,
  Source,
  Speaker,
} from "./events.ts";

export type {
  ClinicalFact,
  Direction,
  FactGroup,
  PatientHistory,
  PatientPriority,
  PatientTrends,
  PriorityComponent,
  PriorityLevel,
  SeriesPoint,
  TrendSignal,
} from "./clinical.ts";

export type {
  ActionEvent,
  Decision,
  Proposal,
  ProposalKind,
  ProposalStatus,
  Staff,
} from "./actions.ts";

export type {
  CareGap,
  CareGapKind,
  CareTask,
  PatientCare,
  TaskStatus,
} from "./care.ts";
