# ECHO — CLAUDE CODE EXECUTION PROMPT

You are the lead staff engineer, product architect, UX engineer, and technical PM.

We have very limited hackathon time. **Optimize for working demo, parallel execution, and judge impact. Do not over-engineer.**

Repository:

`https://github.com/syedwajiulhassan715-rgb/Corti-Hackathon`

## THE ONE-SENTENCE GOAL

Build **ECHO**, a premium ward intelligence system that **automatically turns routine nursing work, conversations, vitals, and other observations into a patient's longitudinal history, continuously watches that history for meaningful deterioration over time, prioritizes patients who need attention, and uses a Corti agent to propose the next workflow action with human approval.**

The core insight is:

> **The nurse should not have to trigger ECHO. ECHO should quietly capture the nurse's normal work, update the patient history automatically, and become intelligent from the accumulated history.**

---

# 1. DO NOT BUILD THIS

Do NOT make:

```text
nurse says "chest pain"
       ↓
instant AI alert
```

Do NOT make every observation trigger an alert.

Do NOT require nurses to press an "AI analysis" button.

Do NOT make an LLM decide clinical truth.

Do NOT make a generic AI chatbot.

Do NOT build a generic dashboard.

---

# 2. BUILD THIS

```text
NURSE'S NORMAL WORK
    ↓
Corti speech / structured vitals / observations
    ↓
automatic fact extraction
    ↓
patient history updated
    ↓
time passes
    ↓
trend engine compares history
    ↓
persistent meaningful change detected
    ↓
patient priority changes
    ↓
attention queue updates
    ↓
Corti agent proposes workflow action
    ↓
human approves
    ↓
action becomes part of patient history
```

The critical differentiator:

> **ECHO watches the patient's trajectory, not just individual events.**

---

# 3. USE THE EXISTING REPOSITORY

First inspect the existing repository completely.

Preserve and reuse:

* event-sourced architecture
* contracts
* Corti auth
* Corti streaming
* Corti coding
* grounding
* patient-state rules
* replay
* test infrastructure
* evidence model

Do not rewrite working code unnecessarily.

Important current architecture:

```text
Event Log
   ↓
Projections
   ↓
Patient State
   ↓
Ward
```

Evolve it into:

```text
Event Log
   ↓
Patient History
   ↓
Trend Engine
   ↓
Risk
   ↓
Priority
   ↓
Attention Queue
   ↓
Agentic Workflow
```

---

# 4. PATIENT IS THE PRIMARY ENTITY

Add `patientId` to events.

Core event:

```ts
interface Event {
  id: string;
  ts: number;
  patientId: string;
  room: string;
  source:
    | "speech"
    | "vital"
    | "lab"
    | "movement"
    | "order"
    | "result"
    | "action";
  speaker:
    | "clinician"
    | "patient"
    | "nurse"
    | "family"
    | "unknown";
  quote: string;
  code: string | null;
  observation: string;
  value: number | string | null;
}
```

Everything must ultimately become an event.

---

# 5. AUTOMATIC DOCUMENTATION LOOP

Nurse performs a normal round:

```text
BP 136/84
HR 82
SpO2 96

"Patient feels more tired today."
```

ECHO automatically creates:

```text
vital events
+
Corti fact
+
evidence
```

and updates:

```text
PATIENT HISTORY
```

The nurse should NOT need to:

* retype the conversation
* manually create a fact
* manually trigger analysis
* manually update multiple fields

Show the value proposition:

> **One nurse interaction → structured history automatically.**

---

# 6. CORTI

Use Corti for all clinical AI.

Target:

* Ambient Speech-to-Text
* Facts / clinical extraction
* Medical Coding
* Text Generation
* Agentic Framework

No OpenAI.
No Anthropic API.
No Gemini.
No other AI model.

Use official Corti SDK/API.

Keep secrets server-side.

If credentials are unavailable, use a fixture provider with exactly the same interface.

Clearly label:

```text
DEMO MODE / SYNTHETIC DATA
```

---

# 7. PATIENT HISTORY

Create:

```text
src/projections/patientHistory.ts
```

Patient history should contain:

```text
patient
demographics
symptoms
facts
vitals
labs
medications
observations
tasks
trends
priority
alerts
actions
evidence
```

Important:

**History is a projection of events.**

Never replace evidence with an LLM-generated summary.

---

# 8. FACTS

Create/use a typed fact model:

```ts
interface ClinicalFact {
  id: string;
  patientId: string;
  observedAt: number;
  type: string;
  name: string;
  value?: string | number | boolean;
  direction?: "improving" | "stable" | "worsening" | "unknown";
  speaker?: string;
  evidenceEventIds: string[];
  source: "corti";
}
```

Every fact must point back to evidence.

Example:

```text
FACT
Worsening shortness of breath

Source:
Nurse

Quote:
"She seems more short of breath than yesterday."

Timestamp:
10:14
```

---

# 9. TREND ENGINE — MOST IMPORTANT NEW COMPONENT

Create:

```text
src/engines/patientTrend.ts
```

It must compare historical values.

Calculate:

* baseline
* current value
* delta
* direction
* rate of change
* persistence
* duration
* multi-signal agreement
* missing observations
* supporting conversation facts

Do NOT only ask:

> "Is BP high?"

Ask:

> "Is BP progressively changing compared with this patient's baseline?"

Example:

```text
BP
130/82
136/84
145/90
153/94
159/97

Trend: worsening
Persistence: 3 days
```

---

# 10. DELAYED TRIGGER MODEL

Use states:

```text
GREEN
WATCH
PERSISTING_CONCERN
HIGH
CRITICAL
```

Example:

```text
Day 1
BP 128/80
GREEN

Day 2
BP 136/84
WATCH

Day 3
BP 145/90
WATCH

Day 4
BP 153/94
PERSISTING CONCERN

Day 4 + later
BP 159/97
HR increasing
SpO2 declining

HIGH

Later:
still deteriorating

ACTION REQUIRED
```

The system should intentionally **wait for sufficient evidence**.

A single observation generally becomes history first, not an alert.

Exception: clearly defined emergency conditions.

---

# 11. SYNTHETIC WARD SIMULATION

This is crucial because we need a compelling demo quickly.

Create:

```text
src/simulation/
```

Generate synthetic patients and deterministic trajectories.

At minimum:

```text
stable
improving
gradual hypertension
gradual respiratory deterioration
medication-related deterioration
coordination delay
sudden emergency
```

Create 10–12 patients.

Make 2–3 interesting.

The simulation must support:

```text
Start
Pause
Resume
Reset
Advance 1 hour
Advance 1 day
1x
10x
60x
600x
```

Use a deterministic simulation clock.

This lets a multi-day patient story happen in minutes.

---

# 12. LIVE MONITOR SIMULATION

Make it look like a connected bedside monitor.

Example:

```text
PATIENT P-002

BP       159/97    ↑
HR       102       ↑
SpO2     93%       ↓
RR       24        ↑

● LIVE

SIMULATED DEVICE
```

The monitor produces normal events through the same event pipeline.

Do not fake actual hospital integration.

---

# 13. MULTI-SIGNAL CORRELATION

This is where the product becomes impressive.

Example:

```text
Nurse:
"More short of breath."

+

SpO2:
98 → 91

+

HR:
82 → 110

+

persistent for 40 minutes
```

Result:

```text
HIGH PRIORITY
```

Explain:

```text
Why #1?

• worsening respiratory symptom
• SpO2 declined 7 points
• heart rate increased 28
• trend persisted 40 minutes
```

Everything must be evidence-backed.

---

# 14. PATIENT PRIORITIZATION

Create:

```text
src/engines/prioritization.ts
```

Output:

```ts
interface PatientPriority {
  patientId: string;
  level: "LOW" | "WATCH" | "HIGH" | "CRITICAL";
  rank: number;
  reasons: string[];
  evidenceEventIds: string[];
  lastUpdatedAt: number;
}
```

Prioritize based on explainable components:

```text
severity
trend
persistence
multi-signal agreement
unresolved tasks
time waiting
```

Do not make one opaque AI score.

---

# 15. ATTENTION QUEUE

Main ward screen should show:

```text
ATTENTION QUEUE

#1 P-002   HIGH
    ↓ SpO2
    ↑ HR
    worsening breathing

#2 P-007   HIGH
    persistent BP rise
    medication issue

#3 P-023   WATCH
    abnormal trend

#4 P-011   WATCH
    overdue reassessment
```

Rank changes should animate smoothly.

No flashing nonsense.

---

# 16. AGENT — USE IT ONLY WHERE IT ADDS VALUE

Use the Corti Agentic Framework for workflow decisions.

Do NOT use the agent to decide:

> "Is the patient clinically deteriorating?"

The deterministic engine decides that.

Use the agent to decide:

> "Given this trusted patient state, who should handle the next task and what workflow action should be proposed?"

Useful agent tools:

```text
getPatientHistory(patientId)
getPatientTrend(patientId)
getPriorityQueue()
getAvailableStaff()
getOpenTasks(patientId)
getEvidence(eventIds)
proposeAssignment(patientId, staffId)
proposeReassessment(patientId)
generateHandoff(patientId)
generateEscalationSummary(patientId)
```

Every action-changing operation requires human approval.

Example:

```text
ECHO RECOMMENDS

Assign P-002 to Nurse A

Reason:
Patient #1 priority.
Nurse A available.
Matching ward.
No higher-priority task.

[Approve]
[Reject]
```

Approval creates an `action` event.

---

# 17. MEDICAL CODING

When a relevant fact appears:

```text
Shortness of breath
→ Corti coding
→ R06.02
```

Show the code alongside evidence.

Don't make coding the main product.

Use it as enrichment.

---

# 18. TEXT GENERATION

Use Corti generation only after deterministic state exists.

Generate:

* "Why is this patient #1?"
* handoff summary
* escalation summary
* 24-hour patient summary

Generation explains facts.

It must not invent facts.

---

# 19. PREMIUM UI — TOP 1%

Build a world-class interface.

Use:

* Next.js App Router
* TypeScript
* Tailwind
* shadcn/ui / Radix
* Lucide
* Geist/Inter
* high-end charts
* subtle Framer Motion-style transitions if appropriate
* responsive design
* command palette
* keyboard shortcuts

Visual references:

```text
Linear
Vercel
Stripe
Apple Health
modern clinical monitoring systems
```

But create a unique ECHO identity.

Do NOT build:

* generic admin dashboard
* generic AI dashboard
* excessive cards
* rainbow gradients
* fake glassmorphism
* giant meaningless hero sections

Healthcare aesthetic:

```text
warm neutral background
graphite text
subtle borders
restrained green / amber / red
excellent typography
high information density
calm motion
```

---

# 20. CORE ROUTES

Build:

```text
/
/ward
/patients
/patients/[patientId]
/simulation
/replay/[runId]
/activity
/settings
```

Prioritize `/ward` and `/patients/[patientId]`.

---

# 21. WARD SCREEN

Main demo screen:

```text
ECHO                         ● LIVE   DEMO MODE

12 PATIENTS
3 HIGH
2 WATCH
7 STABLE

────────────────────────────────────────────

ATTENTION QUEUE       SELECTED PATIENT

#1 P-002 HIGH         P-002

#2 P-007 HIGH         BP 159/97 ↑
#3 P-023 WATCH        HR 102 ↑
                      SpO2 93% ↓

                      Trend chart

                      WHY NOW?

                      Nurse:
                      "More short of breath..."

────────────────────────────────────────────

LIVE WARD ACTIVITY
```

This should be the strongest screen.

---

# 22. PATIENT PAGE

`/patients/[patientId]`

Show:

```text
Patient P-002
HIGH PRIORITY
Room 02

BP 159/97 ↑
HR 102 ↑
SpO2 93% ↓

TREND CHARTS

LONGITUDINAL TIMELINE

WHY THIS PATIENT MOVED UP

CONVERSATION EVIDENCE

VITAL EVIDENCE

CORTI CODES

OPEN TASKS

RECOMMENDED ACTION

[Approve]
[Reject]
```

The patient timeline is the hero feature.

---

# 23. NURSE ROUND

Build a tiny nurse workflow:

```text
NURSE ROUND

P-002

Record vitals

BP
HR
SpO2

Record observation

[Start recording]

[Save check]
```

After save:

```text
Patient history updated automatically.
```

No manual duplicate documentation.

---

# 24. REPLAY

Preserve event replay.

Make a beautiful scrubber:

```text
09:00 ───── 10:00 ───── 11:00 ───── 12:00
                  ●
```

Scrubbing should reconstruct:

* history
* trends
* priority
* tasks
* action events

This is extremely useful for the demo.

---

# 25. DEMO STORY

Optimize the entire app around this 5-minute sequence:

### Step 1

Show a stable ward.

### Step 2

Open P-002.

### Step 3

Nurse performs a normal check.

Corti captures:

> "She's more tired than yesterday."

History updates automatically.

No alert.

### Step 4

Advance simulation one day.

More vitals arrive.

Still no major alert.

### Step 5

Advance again.

BP increases.

HR increases.

SpO2 falls.

### Step 6

ECHO shows:

```text
WATCH
→
PERSISTING CONCERN
→
HIGH PRIORITY
```

### Step 7

Show "WHY NOW?"

Conversation + vital trends + persistence.

### Step 8

Open attention queue.

P-002 moves to #1.

### Step 9

Agent proposes:

```text
Request reassessment / assign available nurse
```

### Step 10

Human approves.

Action becomes part of history.

End with:

> **The nurse didn't trigger ECHO. The nurse simply did the job. ECHO connected the history.**

That is the story judges should remember.

---

# 26. BUILD FAST — PARALLEL EXECUTION

Work in parallel wherever possible.

Create parallel workstreams:

### WORKSTREAM A — DOMAIN

* patientId
* event contract
* patient history
* facts
* trends
* prioritization

### WORKSTREAM B — SIMULATION

* synthetic patients
* trajectories
* simulation clock
* live monitor
* delayed triggers

### WORKSTREAM C — CORTI

* stream
* facts
* coding
* generation
* agent

### WORKSTREAM D — UI

* ward
* patient page
* nurse round
* charts
* attention queue
* replay

### WORKSTREAM E — TESTING

* contracts
* trend tests
* priority tests
* replay tests
* Corti adapters
* simulation

Run independent tasks in parallel.

Merge continuously.

Do not wait for one subsystem to be "perfect" before starting another.

---

# 27. CLAUDE CODE EXECUTION STYLE

Use an elite coding workflow:

1. Inspect first.
2. Build a dependency map.
3. Identify parallelizable tasks.
4. Create small atomic changes.
5. Run tests after each meaningful milestone.
6. Use agents/subagents where the environment supports them.
7. Give each agent a narrow responsibility.
8. Do not have multiple agents edit the same files simultaneously.
9. Prefer shared contracts first.
10. Integrate early.
11. Remove dead code.
12. Never leave half-working UI paths.
13. Run final end-to-end demo locally.
14. Fix errors before polish.
15. Polish only the highest-value screens.

Use parallel agents for independent files/modules, not duplicated work.

---

# 28. AGENT ASSIGNMENT STRATEGY

If Claude Code supports subagents, use them like this:

```text
Agent 1:
Repository audit + domain architecture

Agent 2:
Patient history + trend engine

Agent 3:
Simulation + delayed trigger system

Agent 4:
Corti integrations

Agent 5:
Ward UI

Agent 6:
Patient detail UI

Agent 7:
Tests + integration validation

Agent 8:
Final UX/performance/security review
```

Do not allow agents to overwrite one another.

Have agents return concise implementation results and blockers.

---

# 29. HARD PRIORITY ORDER

When time is running out:

### MUST HAVE

1. Patient identity
2. Automatic patient history
3. Synthetic ward
4. Longitudinal trends
5. Delayed priority escalation
6. Attention queue
7. Beautiful ward UI
8. Corti integration
9. Evidence
10. Working demo

### SHOULD HAVE

11. Medical coding
12. Agentic assignment
13. Replay
14. Text-generated handoff

### NICE TO HAVE

15. advanced scheduling
16. dictation
17. population analytics
18. extra integrations

Never sacrifice the core demo to build optional features.

---

# 30. ACCEPTANCE TEST

Before stopping, verify this exact scenario:

```text
P-002 starts GREEN.

Nurse enters:
BP 132/82
HR 80
SpO2 98
"Feels more tired."

History updates automatically.

No major alert.

Advance simulation.

BP 142/88
HR 87
SpO2 96

Still no major alert.

Advance simulation.

BP 151/93
HR 95
SpO2 94

Patient becomes PERSISTING CONCERN.

Advance simulation.

BP 159/97
HR 104
SpO2 92

Patient becomes HIGH.

Attention queue moves P-002 to #1.

Why-now panel explains the change.

Agent proposes a workflow action.

Human approves.

Action event is recorded.

Patient timeline contains the entire story.
```

If this works beautifully, the hackathon prototype succeeds.

---

# 31. FINAL RULE

The product's deepest idea is:

> **ECHO doesn't wait for a dramatic phrase. It turns everyday clinical work into longitudinal intelligence.**

The nurse's work is the input.

The patient history is the memory.

The trend engine is the intelligence.

The priority engine decides who needs attention.

The Corti agent proposes what to do next.

The human remains in control.

Build exactly that.

**Move fast. Parallelize. Reuse the existing repository. Get the end-to-end loop working first. Then make the ward screen and patient timeline exceptional.**
