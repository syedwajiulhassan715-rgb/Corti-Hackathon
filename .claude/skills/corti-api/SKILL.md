---
name: corti-api
description: Verified Corti API reference — auth, coding, interactions, facts, fact groups, documents/templates, transcripts. Every field name here was confirmed against the live tenant, not read from docs. Load before writing any code that calls Corti.
---

# Corti API — verified against the live tenant

**Verified 2026-08-21 against `CORTI_ENVIRONMENT=eu`, tenant `base`.** Every
field below was confirmed by a real call. Nothing here is inferred from
documentation. CLAUDE.md API law: never guess a field name — if it is not in
this file, probe for it and add it here before writing the code.

## How to probe safely

The API leaks its own Go struct on a type mismatch, which is the fastest way to
learn a shape without guessing:

```
POST {"facts":"x"}        -> "cannot unmarshal string into ... []fact.FactsCreateInput"
POST {"facts":[{"text":1}]} -> "cannot unmarshal number into ... FactsCreateInput.facts.text of type string"
POST {}                   -> validationErrors listing every required pointer
```

Send `{}` for required fields, then a wrong type for the struct. Two calls
usually gives the whole shape.

## Auth

Keycloak, **realm-scoped per tenant**. The unscoped `/oauth2/token` 404s.

```
POST https://auth.<env>.corti.app/realms/<tenant>/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded
grant_type=client_credentials&client_id=<id>&client_secret=<secret>
-> { "access_token": "...", "expires_in": ... }
```

Every subsequent call needs **both**:
```
Authorization: Bearer <token>
Tenant-Name: <tenant>
```
Omitting `Tenant-Name` is a 403, not a 401. A 403 on a route that should exist
usually means a missing header or a scope your tenant does not have — not a
wrong path. Check `/openapi.json` style 404s to tell the two apart: a route
that does not exist 404s, a route you may not touch 403s.

## What this tenant CAN and CANNOT do

| Endpoint | Status | Notes |
|---|---|---|
| `POST /v2/tools/coding/` | ✅ | Works. Used by `src/corti/coding.ts`. |
| `POST /v2/tools/facts/` | ❌ 403 | **Standalone facts tool NOT scoped for this tenant.** |
| `POST /v2/tools/generate/` | ❌ 403 | **Standalone generate tool NOT scoped for this tenant.** |
| `GET/POST /v2/interactions/` | ✅ | |
| `GET/POST /v2/interactions/{id}/facts/` | ✅ | Use this instead of the facts tool. |
| `GET/POST /v2/interactions/{id}/documents/` | ✅ | Use this instead of the generate tool. |
| `POST /v2/interactions/{id}/transcripts/` | ✅ | Needs `recordingId` + `primaryLanguage`. |
| `GET /v2/templates/` | ✅ | 11 published templates. |
| `GET /v2/factgroups/` | ✅ | Note: **no hyphen.** `/v2/fact-groups/` is a 403. |

**Consequence:** all generation and fact work must be interaction-scoped.
That is the better path anyway — interactions carry patient identity natively.

## Interactions

`patient` is a first-class field, which is why patient identity is Corti's
model and not something ECHO bolts on.

```
POST /v2/interactions/
{
  "encounter": {
    "identifier": "<your id>",          // REQUIRED
    "status": "in-progress",            // planned | in-progress | ...
    "type": "first_consultation",
    "period": { "startedAt": "2026-08-21T09:00:00Z" },
    "title": "ECHO nurse round"
  },
  "patient": {
    "identifier": "00990288",
    "name": "Elena Petrova",
    "gender": "female",                 // female | male | unknown
    "birthDate": "1946-09-05"
  }
}
-> 200 { "interactionId": "<uuid>", "websocketUrl": "wss://.../audio-bridge/v2/interactions/<id>/streams?tenant-name=<tenant>" }
```

Note the response key is **`interactionId`**, not `id`. `GET /v2/interactions/`
returns objects keyed `id` instead. They are the same value.

`GET /v2/interactions/` -> `{ "interactions": [ ... ] }`, each with
`id, assignedUserId, encounter, patient, websocketUrl, createdAt, updatedAt`.

## Facts

`GET /v2/interactions/{id}/facts/` -> `{ "facts": [ ... ] }` (empty array on a
fresh interaction).

```
POST /v2/interactions/{id}/facts/
{ "facts": [ {
    "text":  "Patient reports increased shortness of breath since yesterday.",
    "group": "history-of-present-illness",   // REQUIRED, must be a known key
    "source": "user"
} ] }
-> 200 { "facts":[{ id, text, group, groupId, source, isDiscarded, updatedAt }] }
```

An unknown `group` is a **404 `fact group not found: <key>`**, not a 400.

### The 20 fact group keys (`GET /v2/factgroups/`)

```
chief-complaint              history-of-present-illness   past-medical-history
family-history               social-history               functional-status
medications-prior-to-visit   allergies                    demographics
vital-signs                  laboratory-results           imaging-results
normal-physical-findings     abnormal-physical-findings   denials-of-symptoms
concerns-and-expectations    assessment                   plan
actions                      other
```

This is Corti's own clinical ontology. **Use these keys as ECHO's fact taxonomy
rather than inventing one** — `vital-signs`, `abnormal-physical-findings`,
`concerns-and-expectations`, `denials-of-symptoms` and `functional-status` all
map directly onto what the trend engine needs.

## Documents (generation)

```
POST /v2/interactions/{id}/documents/
{
  "context": [ { "type": "string", "data": "<the text to write from>" } ],
  "templateKey": "corti-nursing-note",
  "template": {
    "documentName": "ECHO nurse round",
    "sectionKeys": ["corti-objective","corti-actions","corti-plan"]
  },
  "outputLanguage": "en"                 // BCP-47, validated
}
-> 201 { id, name, templateRef, isStream, sections:[{key,name,text,sort,...}],
         outputLanguage, usageInfo:{creditsConsumed} }
```

Gotchas, each cost a call to discover:

- `template` is an **object**, not a string. Its struct is
  `{ sectionKeys []string, sections []SectionOverride, documentName,
     description, additionalInstructions, additionalInstructionsOverride }`.
- `sectionKeys` and `sections` are **mutually exclusive** (`excluded_with`).
  Supply exactly one. Sending `"sections": []` counts as supplying it and
  fails with a confusing "both required / both excluded" pair of errors.
- `templateKey` AND `template` are both required.
- Cost is real: ~0.024 credits for a three-section nursing note.

### Published template keys (`GET /v2/templates/`)

```
corti-nursing-note              corti-patient-summary       summary-of-notes
corti-soap                      corti-h-and-p               corti-brief-clinical-note
corti-outpatient-visit-note     corti-referral              corti-emergency-note
corti-emergency-response-note   corti-epic-avr
```

Section keys live at `template.templateSections[].section.key`, e.g.
`corti-nursing-note` -> `corti-objective`, `corti-actions`, `corti-plan`.

## Transcripts

```
POST /v2/interactions/{id}/transcripts/
{ "recordingId": "<uuid>", "primaryLanguage": "en", ... }
```
Both fields required. Recording comes from the audio-bridge websocket.

## Streaming

`websocketUrl` is returned on interaction create:
`wss://api.<env>.corti.app/audio-bridge/v2/interactions/<id>/streams?tenant-name=<tenant>`
See `src/corti/stream.ts` for the implemented transport.

### Server message shapes — verified against `@corti/sdk@5.0.0`

- **The facts batch key is `fact`, SINGULAR.** `{ type: "facts", fact: [...] }`,
  per `StreamFactsMessage`. Reading `message.facts` returns undefined; calling
  `.filter` on it throws inside the socket listener, and because that listener
  runs on the socket's event-loop turn the exception becomes an unhandled
  'error' event that **kills the whole server mid-encounter**. This is what a
  live rehearsal looked like: transcription stopped dead and no facts ever
  appeared, because the process was gone.
- Transcript batches DO use the plural-ish `data`:
  `{ type: "transcript", data: StreamTranscript[] }`. Do not "fix" this one.
- `StreamTranscript.id` is the **interaction id**, not a per-segment id — the
  SDK comment says "Interaction ID that the transcript segments are associated
  with". Do not use it alone as a segment key; key on time + speakerId too.
- `StreamTranscript.speakerId` is `-1` when diarization is off.
- Any handler running off this socket must be wrapped: one malformed message
  may cost at most one message, never the process.

### Config shape — verified against `@corti/sdk@5.0.0` generated types

- **`factGenerationInterval` lives INSIDE `mode`.** Not at the top level of
  the config. Placed at the top level it is ignored silently and the stream
  falls back to the `fixed` default: ~60s between fact batches. This cost us
  a demo rehearsal — facts looked hung for two minutes.
  `mode: { type, outputLocale, factGenerationInterval }`.
  - `fixed` (default): ~60s cadence.
  - `fast_init`: logarithmic — first batch ~10s, then ~20s, ~26s, widening
    to 60s. Costs more credits and produces more near-duplicates.
- **`transcription.isDiarization` is deprecated, renamed `diarize`.** Both are
  still accepted and `CONFIG_ACCEPTED` echoes both; `diarize` wins if both are
  sent. We send both.
- `transcription.participants` is required, not optional.

### Audio

Supported stream MIME types: `audio/ogg`, `audio/webm`, `audio/opus`,
`audio/vorbis`, `audio/mpeg|mp3|mpeg3`, `audio/flac`, `audio/mp4|m4a`. For
`audio/ogg` and `audio/webm` an optional codec parameter is allowed, and the
allowed codecs are `opus` and `vorbis`. `audio/webm;codecs=opus` — what
MediaRecorder gives us in Chrome — is supported.

Omitting `audioFormat` makes the server auto-detect from the first chunk with
ffprobe. Supplying it is recommended; an unsupported MIME type gives
`CONFIG_REJECTED`, and audio that does not match the declared MIME type
returns audio validation errors on the socket — **and the docs warn this can
error silently in some cases**, so a stream that connects is not proof the
audio is being decoded.

Corti's documented capture guidance: **250ms chunks** ("sending much smaller
chunks more frequently can degrade recognition accuracy"), **16 kHz**, and
streamed at or near real-time rather than faster.

### Ambient two-speaker capture (learned on stage, not from docs)

Browser `getUserMedia` defaults — `echoCancellation`, `noiseSuppression`,
`autoGainControl` — are tuned for one near-field speaker on a call. In a
two-person ambient encounter they gate the further speaker out as background,
which presents as the patient's sentences going missing from the transcript.
Turn all three OFF for ambient capture.

### SDKs

`@corti/sdk` (v5, `corticph/corti-sdk-javascript`, Fern-generated) carries the
authoritative request/response types — worth installing purely to read them,
even where the hand-rolled transport stays. `@corti/ambient-web` is a web
component for ambient capture. Neither is on ECHO's path today.

## Coding

`POST /v2/tools/coding/` — see `src/corti/coding.ts`. Body:
`{ "system": ["icd10cm-outpatient"], "context": [{"type":"text","text":"..."}] }`

## Field mapping notes (Workstream E, interactions/facts/documents)

Learned while building `src/corti/interactions.ts`, `facts.ts`, `documents.ts`.
No new endpoints below — just shapes worth not re-discovering.

- **`PatientRecord` (world/patients.ts) has no `gender` or `birthDate`.**
  It only exposes a free-text `summary` like `"80 years, Female"`. Rather
  than guess a birth date from an age string, `interactions.patientFromRecord`
  re-reads the chart's own `patient.md` for the `Sex` and `Date of birth`
  lines Corti actually wants. Confirmed live against `elena_petrova` (MRN
  `00990288`): the created interaction round-tripped `name: "Elena Petrova"`,
  `gender: "female"`, `birthDate: "1946-09-05"` correctly.
- **POST facts response**: each returned fact carries a real
  `groupId` (UUID) alongside the `group` key you sent — e.g. group
  `"vital-signs"` came back with `groupId: "11111111-1111-4000-8000-111111111111"`.
  Useful if a caller ever needs to correlate groups across facts without
  string-comparing `group`.
- **Document generation cost, confirmed twice now**: a 3-section
  `corti-nursing-note` from ~450 chars of context cost `0.024051999999999997`
  credits — matches the `~0.024` estimate above almost exactly. Treat that as
  the per-call budget line, not a worst case.
- Only `corti-nursing-note` + `["corti-objective","corti-actions","corti-plan"]`
  has been called live. `documents.ts`'s three generation helpers (nurse-round
  note, why-this-patient-is-#1, handoff) all deliberately reuse this one
  verified combination — differentiated by `documentName` and
  `additionalInstructions` only — rather than guessing section keys for
  `corti-patient-summary` or `corti-h-and-p`, which were never probed.

## Caching law

Every response caches to disk on first call and replays offline
(`src/corti/cache.ts`). A cache miss without credentials must fail loudly
rather than silently calling out.
