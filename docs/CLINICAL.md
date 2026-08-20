# Clinical rules

**Doctor owns this file. Nobody else edits it. Values here become `engines/rules/`
verbatim.** If code disagrees with this document, the code is wrong.

Source: `Corti clinical rules.docx`, 2026-08-20. Markdown formatting only — headings,
lists and tables restored. No wording was changed, added or removed.

> These are demo rules. Local clinical protocols and approved TOKS response times
> override the model before any real clinical use.

---

## 1. The 10 rooms

The ward contains 10 patient rooms.

- **Three rooms are interactive:**
  - One patient improves.
  - One patient deteriorates.
  - One patient remains clinically stable but is delayed by an incomplete coordination task.
- Seven rooms provide realistic background activity.

Every room displays two independent indicators:

- **Patient State:** GREEN, YELLOW or RED.
- **Coordination State:** GREEN, YELLOW or RED.

Each room must display one short explanation for its colour.
The three interactive rooms change during the demo.
Background rooms remain stable unless deliberately changed by test data.

---

## 2. Patient State rules

Patient State describes the patient's current clinical condition.

### GREEN

**Criteria**

- TOKS/NEWS 0–2.
- No individual parameter scores 3.
- No new clinical concern.
- Stable or improving observations.
- Oxygen requirement is stable or decreasing.

**Response**

- TOKS/NEWS 0: reassessment within 12 hours.
- TOKS/NEWS 1–2: reassessment within 4–6 hours.

### YELLOW

**Criteria**

- TOKS/NEWS 3–4.
- Increase of at least 2 points.
- New or worsening symptom.
- Documented HCP concern.
- Recent improvement after a RED state.
- Current observations are incomplete or overdue.

**Response**

- Responsible nurse informed within 15 minutes.
- Clinical reassessment and repeat observations within 60 minutes.

### RED — URGENT

**Criteria**

- TOKS/NEWS 5–6.
- One individual parameter scores 3.
- New confusion.
- Increasing oxygen requirement.
- Significant documented deterioration.

**Response**

- Immediate notification.
- Competent clinical review within 60 minutes.
- Observations at least hourly until review and a documented plan.

### RED — EMERGENCY

**Criteria**

- TOKS/NEWS ≥7.
- Acute airway, breathing or circulation problem.
- Unresponsiveness.
- Explicit emergency request from an HCP.

**Response**

- Immediate emergency response.
- Continuous monitoring according to local protocol.

### TOKS/NEWS direction

| Direction | Meaning |
|---|---|
| IMPROVING | Latest score is lower. |
| STABLE | Latest score is unchanged. |
| WORSENING | Latest score is higher. |
| UNKNOWN | Only one valid score is available. |

A change of at least 2 points within four hours is significant.

### Spoken information

- One new relevant symptom from one speaker creates a YELLOW reassessment trigger.
- Repetition by the same speaker strengthens the evidence but is not an independent source.
- Confirmation by two different speakers counts as corroboration.
- Spoken concern combined with abnormal structured observations within 10 minutes
  determines the state according to TOKS/NEWS.
- Severe statements such as "I cannot breathe" trigger immediate verification.
- The system must not wait for a second speaker before responding to a possible emergency.
- **Spoken information must never be used to invent a TOKS/NEWS score.**

### De-escalation

- RED must not change directly to GREEN after one improved measurement.
- RED changes to YELLOW after documented improvement and clinical reassessment.
- YELLOW changes to GREEN after two stable or improving observation sets at least
  60 minutes apart.
- Recent RED events remain visible in the 24-hour report.

---

## 3. Coordination State rules

Coordination State describes whether required tasks are progressing.

### Task lifecycle

```
IDENTIFIED → AWAITING_APPROVAL → APPROVED → ORDERED → SCHEDULED → PERFORMED →
RESULT_PENDING → RESULT_AVAILABLE → REVIEWED → ACTION_PENDING → COMPLETED
```

Clinical text documents intention. Structured system data documents execution.

### GREEN

- Tasks are completed or progressing within the expected timeframe.
- Orders have been submitted.
- Scheduled tasks remain within their planned time.
- Results have been reviewed when required.
- Normal expected waiting remains GREEN.

### YELLOW

- A planned task has not been ordered.
- Required HCP approval is pending.
- An investigation has not been scheduled.
- A planned sample has not been collected.
- An expected result is delayed.
- A result is available but not reviewed.
- A documented follow-up action is incomplete.
- Owner or deadline is missing.
- A non-critical task is overdue.

### RED

- A time-critical task is overdue.
- A critical result is not acknowledged.
- Required action following a critical result is missing.
- An urgent investigation has exceeded its deadline.
- An escalation has not been acknowledged.
- No qualified HCP has accepted a time-critical task.
- The delay creates documented immediate patient risk.

### Coordination time thresholds

| Situation | YELLOW | RED |
|---|---|---|
| Emergency alert | Not acknowledged within 2 minutes | Not acknowledged within 5 minutes |
| Urgent task | No owner within 5 minutes | No owner within 15 minutes |
| Urgent order | Not submitted within 15 minutes | Urgent deadline passed |
| Same-day order | Not submitted within 2 hours | Only RED if immediate risk is documented |
| Scheduled investigation | More than 15 minutes late | Urgent investigation more than 30 minutes late |
| Result pending | Expected turnaround exceeded | Only RED if immediate risk is documented |
| Non-critical result | Available but awaiting review | Normally remains YELLOW |
| Critical result | Awaiting acknowledgement | Not acknowledged within 10 minutes |
| Discharge task | Incomplete 48 hours before discharge | Safe discharge is due but blocked |

**The most serious unresolved task determines the colour.**

---

## 4. Task table

The Task Table provides input to the prioritisation and task-assignment agents.

| Task type | Purpose | Band | Recipient | Standard due window |
|---|---|---|---|---|
| Emergency clinical assessment | Respond to acute deterioration | E0 | Acute team/doctor | Immediate |
| Repeat TOKS/vital signs | Confirm and track change | E0/U1 | Nurse | 5–60 minutes |
| Urgent medical review | Assess significant deterioration | U1 | Doctor | Within 60 minutes |
| Blood-test order | Obtain planned diagnostic data | U1/P2 | Authorised HCP | 15 minutes–same shift |
| Blood-sample collection | Complete ordered test | U1/P2 | Nurse/phlebotomy | Documented collection time |
| Laboratory-result review | Prevent unreviewed results | U1/P2 | Responsible doctor | Critical: 10 minutes; routine: 30–60 minutes |
| Imaging order | Start planned investigation | U1/P2 | Authorised HCP | 15 minutes–2 hours |
| Imaging performance | Complete investigation | U1/P2 | Imaging department | Documented time |
| Imaging-result review | Support clinical decision | U1/P2 | Responsible doctor | Within 30–60 minutes |
| Specialist referral | Obtain specialist assessment | U1/P2 | Referring HCP/specialist | According to urgency |
| Mobility assessment | Support recovery/discharge | P2 | Nurse/physiotherapist | Same shift |
| Discharge equipment | Enable safe discharge | P2 | Discharge coordinator | At least 48 hours before discharge |
| Patient education | Enable safe self-management | P2/R3 | Nurse/pharmacist | Before discharge |
| Routine clinical review | Confirm continued progress | R3 | Ward team | During ward round |
| Remembered patient request | Prevent conversational promises being lost | P2/R3 | Relevant HCP | Documented deadline |

**Urgency bands**

| Band | Meaning |
|---|---|
| E0 | Emergency. |
| U1 | Urgent. |
| P2 | Flow-enabling. |
| R3 | Routine. |

---

## 5. Scoring weights

The clinical ladder is applied first. The numerical score orders tasks or patients
within the same ladder level.

Each component is scored from 0 to 5.

```
Priority score = 20 × (0.50U + 0.20W + 0.20D + 0.10F)
```

| Component | Weight | Meaning |
|---|---|---|
| Urgency | 0.50 | Patient State and potential harm from delay |
| Wait | 0.20 | Time remaining or amount overdue |
| Dependency | 0.20 | Number and importance of blocked next steps |
| Fit | 0.10 | Availability, qualification and interruptibility of the intended HCP |

**Fit must never move a lower-acuity task ahead of a RED patient.**

---

## 6. Interruptibility

Interruptibility is used by the task-assignment agent after the task has been prioritised.

### A — Interruptible now

*Examples:* Documentation. Routine chart review. Waiting. Routine administrative work.

**Action:** Offer the task immediately.

### B — Safe pause required

*Examples:* Routine bedside conversation. Non-critical teaching. Routine handover.
Ordinary walking support.

**Action:** Allow completion of a safe step, normally within two minutes.

### C — Do not interrupt except emergency

*Examples:* Medication preparation or administration. Sterile procedure. Manual patient
transfer. Critical-result handover. Sensitive clinical conversation.

**Action:** Route the task to another qualified HCP unless it is RED — EMERGENCY.

### D — Unavailable for ordinary routing

*Examples:* Resuscitation. Airway management. Active haemorrhage. Surgery or invasive
procedure.

**Action:** Never send ordinary tasks. Use the emergency pathway or next eligible HCP.

### Declining and rerouting

- An HCP may decline because they are busy or non-interruptible.
- Declining does not cancel the task.
- Priority and deadline are preserved.
- The task is offered to the next qualified HCP.
- Record the decline, reason, time and new recipient.
- Escalate when no qualified recipient accepts within the deadline.

---

## 7. Ward-round ladder

1. RED — EMERGENCY and RED — URGENT.
2. YELLOW, worsening or recently RED.
3. Patients awaiting time-critical results, investigations or decisions.
4. Stable patients who can be discharged or transferred after one decision.
5. Stable patients with unresolved tasks or an unclear plan.
6. GREEN patients with a clear active plan.

**Rules**

- The ladder is a hard clinical safety gate.
- The score orders patients within each step.
- Clinical urgency always overrides operational flow.
- Recalculate after every Patient State or Coordination State change.

---

## 8. Script rules

There are three interactive recordings:

1. Deteriorating patient.
2. Improving patient.
3. Stable patient with a stalled coordination task.

**Across the scripts, include**

- One conflict between prior documentation and current speech.
- One important question that is initially not answered.
- One nurse clearly occupied during an encounter.
- One audible decline of an offer or assigned task.
- Natural interruptions and minor overlap.
- Repeated symptoms described using different words.
- A spoken plan that must not be mistaken for a completed electronic order.
- At least one remembered request from a patient or relative.

**Audio requirements**

- One mixed mono track.
- Two clearly different voices.
- Normal room noise.
- No background music or editing.
- Approximately 60–90 seconds per recording.

---

## 9. Answer-key rules

The answer key defines expected system behaviour at three checkpoints:

| Checkpoint | When |
|---|---|
| T0 | Before interactive input. |
| T1 | Immediately after ambient recording. |
| T2 | After structured system updates. |

**For every room, record**

- Expected Patient State.
- Expected Coordination State.
- Expected TOKS/NEWS direction.
- Expected response time.
- Expected active tasks.
- Expected ward-round position.

**The evaluation passes when**

- Patient and Coordination States remain independent.
- Deterioration changes Patient State appropriately.
- One improved measurement does not move RED directly to GREEN.
- Spoken intention does not count as an electronic order.
- An available result does not count as reviewed.
- Every room receives its own colour.
- The queue recalculates after state changes.
- Declined tasks are rerouted rather than cancelled.
- Remembered conversation items remain visible until completed, cancelled or transferred.
