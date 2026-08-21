# Contracts
Locked in 30 minutes, then frozen. Only Event is stored. Everything else is a projection.

Event               id, ts, patientId, room, source, speaker, quote, code, observation, value,
                    correlationId?, causedByEventIds?
  source            speech | vital | lab | movement | order | result | action
  speaker           clinician | patient | nurse | family | unknown
  quote empty for non-speech. code null if uncoded, and always null for feed sources
  (vital, lab, movement, order, result). Only speech is coded.
  correlationId scopes a live/demo encounter. causedByEventIds names direct
  evidence parents for derived priority, notification and action events.

PatientState        room, level, reason_text, evidence[], changed_at, previous_level
  previous_level is consumed by web/, which animates the change. Not optional.
CoordinationState   room, level, reason_text, blocked_task_ids[], evidence[], changed_at
  blocked_task_ids[] is what makes the Coordination explanation line concrete.
  level             green | yellow | red

Task                id, room, what, why_quote, evidence[], owner, urgency, stage, due,
                    delayed
  stage             ordered | taken | resulted | reviewed | acted | closed
  The stage ladder is the entire basis of Coordination State.
  No offers[] field. Offers are their own events; a task's offer chain is projected
  from them. Duplicating the chain on Task invites drift.
  urgency and due come from engines/rules/tasks.rules.ts, the doctor's task table.

Request             id, room, resource, reason_quote, evidence[],
                    score{urgency, wait, dependency, fit, total}, status
Proposal            id, request_id, slot_id, rationale, displaced_request_id, status
  displaced_request_id is NICE. Only populated if preemption ships. Null otherwise.
Slot                id, resource, start, duration, status
Nurse               id, availability, room, skills[], open_tasks, interruptibility
Offer               id, task_id, nurse_id, offered_at, expires_at, outcome
  outcome           accepted | declined | expired | superseded

## Invariants
Replay to T reproduces state at T exactly.
Every state, task and request cites at least one event id.
Yellow or red requires at least one speech-source event in evidence.
Every transition emits an event. No silent mutation.
