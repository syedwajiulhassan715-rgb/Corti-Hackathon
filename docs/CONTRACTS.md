# Contracts
Locked in 30 minutes, then frozen. Only Event is stored. Everything else is a projection.

Event               id, ts, room, source, speaker, quote, code, observation, value
  source            speech | vital | lab | movement | order | result | action
  speaker           clinician | patient | nurse | family | unknown
  quote empty for non-speech. code null if uncoded.

PatientState        room, level, reason_text, evidence[], changed_at, previous_level
CoordinationState   room, level, reason_text, blocked_task_ids[], evidence[], changed_at
  level             green | yellow | red

Task                id, room, what, why_quote, evidence[], owner, urgency, stage, due,
                    delayed, offers[]
  stage             ordered | taken | resulted | reviewed | acted | closed
  The stage ladder is the entire basis of Coordination State.

Request             id, room, resource, reason_quote, evidence[],
                    score{urgency, wait, dependency, fit, total}, status
Proposal            id, request_id, slot_id, rationale, displaced_request_id, status
Slot                id, resource, start, duration, status
Nurse               id, availability, room, skills[], open_tasks, interruptibility
Offer               id, task_id, nurse_id, offered_at, expires_at, outcome
  outcome           accepted | declined | expired | superseded

## Invariants
Replay to T reproduces state at T exactly.
Every state, task and request cites at least one event id.
Yellow or red requires at least one speech-source event in evidence.
Every transition emits an event. No silent mutation.
