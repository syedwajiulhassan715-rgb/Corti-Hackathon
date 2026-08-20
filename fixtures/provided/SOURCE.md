# SOURCE — provided hackathon fixtures

Everything in `fixtures/provided/` was supplied by the Corti Hackathon
organisers on 2026-08-20 as three Google Drive downloads. Nothing here was
authored by us; nothing here is derived from a real patient.

| | |
|---|---|
| Provenance | Corti Hackathon organiser distribution, 2026-08-20 |
| Original folders | `Audio Samples-20260820T120948Z-1-001`, `Audio Samples-20260820T121124Z-1-001`, `Text Samples-20260820T120949Z-1-001` |
| Handling | Unpacked into `audio/` and `text/`; original wrapper folders removed |
| Duplicates | The two audio downloads were byte-for-byte identical (verified by sha256 across all 24 files); the second copy was discarded |
| Licence / terms | Hackathon use, per organiser terms — confirm before any redistribution |
| Real patient data | None. Synthetic records with masked identifiers throughout |

**Git handling.** `audio/` is ignored (`fixtures/provided/audio/*`, with
`.gitkeep` negated) — 78 MB of binaries stay out of history. `text/` is tracked;
it is 113 small Markdown files and diffs are useful.

---

## audio/ — 24 files, ~78 MB, unlabelled

The clips arrived with no manifest, transcript, or patient mapping. Filenames
carry only an index and a language tag, and the index has gaps (no 10, 23–25,
27) — assume the set is a subset of a larger corpus, not a complete series.

**The `contains` column below is unverified.** It is filled in as each clip goes
through a first transcription pass; until then a row says `unverified`. Do not
cite a clip in an eval or a demo while its row still says that.

**Status as of 2026-08-20: four rows verified, 20 still unverified.** Four clips
have been through Corti — `sample_17_en.wav` (V1), then `sample_9_en.m4a`,
`sample_8_en.m4a` and `sample_13_en.wav` (V1b) — see `docs/VALIDATION.md`. All
four are single-speaker dictation, across both capture families and four
specialties, so the corpus is very likely a dictation corpus throughout. That is
a strong prior, not a verified fact: the 20 rows still marked `unverified` have
not been listened to or transcribed. Do not cite one until its row says what it
holds.

| File | Format | Duration | Size | Contains |
|---|---|---|---|---|
| `sample_1_en.m4a` | AAC in M4A, 44100 Hz, mono | 4:40 | 2.3M | unverified |
| `sample_2_en.m4a` | AAC in M4A, 44100 Hz, mono | 5:15 | 2.6M | unverified |
| `sample_3_en.m4a` | AAC in M4A, 44100 Hz, mono | 2:01 | 1.0M | unverified |
| `sample_4_en.m4a` | AAC in M4A, 44100 Hz, mono | 3:52 | 1.9M | unverified |
| `sample_5_en.m4a` | AAC in M4A, 44100 Hz, mono | 7:05 | 3.5M | unverified |
| `sample_6_en.m4a` | AAC in M4A, 44100 Hz, mono | 1:55 | 932K | unverified |
| `sample_7_en.m4a` | AAC in M4A, 44100 Hz, mono | 2:46 | 1.4M | unverified |
| `sample_8_en.m4a` | AAC in M4A, 44100 Hz, mono | 3:00 | 1.5M | **Single-speaker dictation.** Radiology report — lumbar spine MRI for herniated disc; L4-L5 posterior herniation, moderate canal stenosis, left L5 root impingement. Verified 2026-08-20 via V1b — transcript cached at `transcripts/sample_8_en.transcript.json` |
| `sample_9_en.m4a` | AAC in M4A, 48000 Hz, mono | 1:58 | 956K | **Single-speaker dictation.** Operative report — right pterional craniotomy for clipping of a right MCA bifurcation aneurysm (surgeon Dr Williams). Speaker dictates no punctuation at all. Verified 2026-08-20 via V1b — transcript cached at `transcripts/sample_9_en.transcript.json` |
| `sample_11_en.wav` | WAV PCM s16le, 16000 Hz, mono | 2:32 | 4.7M | unverified |
| `sample_12_en.wav` | WAV PCM s16le, 16000 Hz, mono | 2:33 | 4.7M | unverified |
| `sample_13_en.wav` | WAV PCM s16le, 16000 Hz, mono | 2:25 | 4.5M | **Single-speaker dictation.** Paediatric well-child check, 4-year-old — milestones, growth percentiles, exam, anticipatory guidance. No child or parent voice. Verified 2026-08-20 via V1b — transcript cached at `transcripts/sample_13_en.transcript.json` |
| `sample_14_en.wav` | WAV PCM s16le, 16000 Hz, mono | 2:36 | 4.8M | unverified |
| `sample_15_en.wav` | WAV PCM s16le, 16000 Hz, mono | 1:46 | 3.3M | unverified |
| `sample_16_en.wav` | WAV PCM s16le, 16000 Hz, mono | 1:50 | 3.4M | unverified |
| `sample_17_en.wav` | WAV PCM s16le, 16000 Hz, mono | 3:29 | 6.5M | **Single-speaker dictation.** Nephrology consult note dictated by one clinician (Dr Ravindra Tripathi, 2026-02-20): 63F, CKD stage IV, hyperkalaemia, T2DM, hypertension; full note structure with a six-point plan. No second voice. Verified 2026-08-20 via V1 — transcript cached at `transcripts/sample_17_en.transcript.json` |
| `sample_18_en.wav` | WAV PCM s16le, 16000 Hz, mono | 3:06 | 5.7M | unverified |
| `sample_19_en.wav` | WAV PCM s16le, 16000 Hz, mono | 2:07 | 3.9M | unverified |
| `sample_20_en.wav` | WAV PCM s16le, 16000 Hz, mono | 2:12 | 4.1M | unverified |
| `sample_21_en.wav` | WAV PCM s16le, 16000 Hz, mono | 1:21 | 2.5M | unverified |
| `sample_22_en.wav` | WAV PCM s16le, 16000 Hz, mono | 2:47 | 5.2M | unverified |
| `sample_26_en.wav` | WAV PCM s16le, 16000 Hz, mono | 1:05 | 2.0M | unverified |
| `sample_28_en.wav` | WAV PCM s16le, 16000 Hz, mono | 1:36 | 3.0M | unverified |
| `sample_29_en.wav` | WAV PCM s16le, 16000 Hz, mono | 1:39 | 3.1M | unverified |

Total audio: 24 clips, 65 min 48 s. Nine 44.1/48 kHz AAC clips (samples 1–9) and
fifteen 16 kHz mono WAV clips (samples 11–29) — two different capture setups.
The 16 kHz WAVs are the ones that match Corti's expected input; the M4A set
needs transcoding first.

---

## text/ — 11 synthetic patient records, 113 Markdown files

One directory per patient, each a small longitudinal chart: demographics, a
problem list, medications, allergies, vitals, labs, and two to four dated
encounter notes. Identifiers (MRN, SSN, insurance member numbers) are present
but fabricated and partially masked. Every record is synthetic.

Coverage is deliberately spread across settings and demographics — primary
care, cardiology, oncology, psychiatry, geriatrics, paediatrics; ages 6 to 80;
several patients with limited English and interpreter use. Two records
(`elena_petrova`, `aisha_rahman`) carry an explicit care-gap storyline, which
makes them the natural candidates for anything we build around missed
follow-up.

The per-patient file set is near-identical, so the common files are described
once here rather than repeated in every table below:

| File | Contains |
|---|---|
| `patient.md` | Identifiers (MRN, masked SSN, insurance), demographics, contact, language, employment |
| `conditions.md` | Problem list — active and historical, with ICD-10 codes, onset and status |
| `medications.md` | Active medication list with dose, route, frequency, indication |
| `allergies.md` | Allergies and intolerances with reaction and severity |
| `vitals.md` | Vital signs, dated series |
| `labs.md` | Laboratory results, dated, with reference ranges |
| `imaging.md` / `procedures.md` | Imaging studies and procedures, dated with findings |
| `immunizations.md` | Immunisation history |
| `social_history.md` | Social history and, where present, social determinants of health |
| `encounter_<date>_<type>.md` | A dated progress note for one encounter |

### Per-patient

**aisha_rahman** — Aisha Rahman, 47F, breast cancer survivorship (DCIS with
microinvasion, right breast, NED since 2024); storyline is a lapsed
surveillance interval picked up in primary care.

| File | Contains |
|---|---|
| `patient.md` | MRN 00743019; 1979-06-14; South Asian American; English/Bengali |
| `cancer_summary.md` | Breast cancer survivorship summary — staging, treatment, surveillance plan |
| `conditions.md` | DCIS history (Z85.3, NED), mild situational anxiety |
| `imaging.md` | Surveillance imaging history |
| `labs.md`, `medications.md`, `allergies.md`, `vitals.md`, `procedures.md` | Standard chart sections (see common table) |
| `encounter_2025-06-10_survivorship_baseline.md` | Oncology survivorship visit — prior-year baseline |
| `encounter_2026-08-26_primary_care_surveillance_lapse.md` | Primary care visit that identifies the surveillance gap |

**david_kim** — David Kim, 63M, non-small-cell lung cancer on active treatment.

| File | Contains |
|---|---|
| `patient.md` | MRN 00880137; 1963-08-30; Korean American; restaurant owner, on leave |
| `cancer_summary.md` | NSCLC summary — histology, stage, regimen, response (longest file in the set) |
| `conditions.md` | NSCLC plus comorbidities |
| `imaging.md`, `labs.md`, `medications.md`, `allergies.md`, `vitals.md`, `procedures.md` | Standard chart sections |
| `encounter_2026-06-22_oncology_consult.md` | Oncology new-patient consult |
| `encounter_2026-08-20_oncology_on_treatment.md` | On-treatment review |

**elena_petrova** — Elena Petrova, 80F, community-acquired pneumonia;
Ukrainian-speaking with interpreter, widowed, Medicare.

| File | Contains |
|---|---|
| `patient.md` | MRN 00990288; 1946-09-05; limited English, interpreter used |
| `conditions.md` | Active problem list including the acute pneumonia |
| `imaging.md` | Chest imaging |
| `immunizations.md` | Immunisation history |
| `social_history.md` | Social history and functional status |
| `labs.md`, `medications.md`, `allergies.md`, `vitals.md` | Standard chart sections |
| `encounter_2026-08-15_pneumonia.md` | Acute presentation, community-acquired pneumonia |
| `encounter_2026-08-22_pneumonia_followup.md` | Follow-up that addresses the gap |

**harold_mitchell** — Harold Mitchell, 77M, comprehensive geriatric assessment;
spouse acts as caregiver and is present in the notes.

| File | Contains |
|---|---|
| `patient.md` | MRN 00655304; 1949-02-12; retired principal; caregiver spouse |
| `caregiver.md` | Caregiver record — Carol Mitchell, spouse |
| `functional_assessment.md` | Geriatric functional assessment (ADL/IADL, falls, cognition) |
| `conditions.md` | Multimorbidity problem list (longest in the set) |
| `immunizations.md`, `labs.md`, `medications.md`, `allergies.md`, `vitals.md` | Standard chart sections |
| `encounter_2026-04-20_geriatric_assessment.md` | Comprehensive older-adult assessment |
| `encounter_2026-08-18_geriatric_followup.md` | Geriatric follow-up |

**jamal_wright** — Jamal Wright, 52M, type 2 diabetes with a diabetic foot
ulcer; long-haul driver, ACA plan, SDOH-heavy record.

| File | Contains |
|---|---|
| `patient.md` | MRN 00512874; 1974-05-08; owner-operator truck driver |
| `social_history.md` | Social history and social determinants of health |
| `conditions.md` | Diabetes and complications |
| `labs.md`, `medications.md`, `allergies.md`, `vitals.md` | Standard chart sections |
| `encounter_2026-06-11_primary_care_foot_ulcer.md` | Primary care — diabetes plus foot ulcer |
| `encounter_2026-08-05_primary_care_followup.md` | Follow-up — wound healing and glycaemic improvement |

**jane_smith** — Jane Smith, 66F, new paroxysmal atrial fibrillation; the only
record with an inpatient admission and discharge summary.

| File | Contains |
|---|---|
| `patient.md` | MRN 00455281; 1960-03-15; retired teacher |
| `conditions.md` | New-onset paroxysmal AF (I48.91), hypertension, hyperlipidaemia |
| `labs.md`, `medications.md`, `allergies.md`, `vitals.md` | Standard chart sections |
| `encounter_2026-08-10_cardiology_consult.md` | Cardiology consult (longest encounter note in the set) |
| `encounter_2026-08-11_discharge_summary.md` | Discharge summary |
| `encounter_2026-08-25_primary_care_followup.md` | Primary care follow-up |
| `use-cases.md` | **Empty file (0 bytes) as shipped.** Not a copy error on our side — flag to the organisers if it was meant to carry the intended use cases |

**lily_chen** — Lily Chen, 6F, new paediatric asthma diagnosis; parent-present
consultation, Mandarin spoken at home.

| File | Contains |
|---|---|
| `patient.md` | MRN 00255190; 2020-04-27; kindergarten; parent's insurance |
| `conditions.md` | Asthma and paediatric problem list |
| `imaging.md` | Imaging and procedures |
| `immunizations.md` | Childhood immunisation schedule |
| `labs.md`, `medications.md`, `allergies.md`, `vitals.md` | Standard chart sections (paediatric dosing and ranges) |
| `encounter_2026-04-14_asthma_diagnosis.md` | Paediatrics — new asthma diagnosis |
| `encounter_2026-06-10_asthma_followup.md` | Paediatrics — asthma follow-up |

**maria_gonzalez** — Maria Gonzalez, 58F, HFrEF (LVEF 32%) with type 2
diabetes; Spanish-speaking, interpreter for complex topics, Medicaid.

| File | Contains |
|---|---|
| `patient.md` | MRN 00915508; 1968-04-02; factory line worker, part-time |
| `conditions.md` | HFrEF, nonischaemic cardiomyopathy, T2DM (long problem list) |
| `procedures.md` | Imaging and procedures, including echo |
| `labs.md`, `medications.md`, `allergies.md`, `vitals.md` | Standard chart sections |
| `encounter_2026-06-12_primary_care.md` | Primary care follow-up |
| `encounter_2026-08-18_hf_clinic.md` | Heart failure clinic visit |

**robert_okafor** — Robert Okafor, 71M, anterior STEMI with PCI, then post-MI
HFrEF; four encounters across ED, inpatient, cardiology and primary care — the
richest care-transition storyline in the set.

| File | Contains |
|---|---|
| `patient.md` | MRN 00671209; 1955-01-22; widowed; retired bus mechanic |
| `conditions.md` | STEMI, post-MI HFrEF, CAD, hypertension |
| `procedures.md` | Imaging and procedures, including PCI |
| `labs.md`, `medications.md`, `allergies.md`, `vitals.md` | Standard chart sections |
| `encounter_2026-07-18_ed_stemi.md` | ED presentation, anterior STEMI |
| `encounter_2026-07-22_discharge_summary.md` | Discharge summary |
| `encounter_2026-08-14_cardiology_followup.md` | Cardiology follow-up |
| `encounter_2026-08-28_primary_care.md` | Primary care follow-up |

**sarah_nguyen** — Sarah Nguyen, 28F, generalised anxiety and panic disorder in
treatment; nursing student. Her primary care note is labelled a stable, clear
case — the easy baseline in the set.

| File | Contains |
|---|---|
| `patient.md` | MRN 00476854; 1998-07-11; graduate nursing student, part-time barista |
| `conditions.md` | GAD, panic disorder, mild insomnia |
| `psychiatric_assessment.md` | Psychiatric assessment |
| `social_history.md` | Social history |
| `labs.md`, `medications.md`, `allergies.md`, `vitals.md` | Standard chart sections |
| `encounter_2026-04-08_primary_care.md` | Primary care — stable, clear case |
| `encounter_2026-07-14_psychiatry_followup.md` | Psychiatry follow-up |

**tom_baker** — Tom Baker, 34M, US Army veteran on TRICARE/VA; psychiatric
follow-up across two visits.

| File | Contains |
|---|---|
| `patient.md` | MRN 00593376; 1992-02-19; forklift operator, intermittent leave |
| `conditions.md` | Psychiatric and general problem list |
| `psychiatric_assessment.md` | Psychiatric assessment, current episode |
| `social_history.md` | Social history |
| `labs.md`, `medications.md`, `allergies.md`, `vitals.md` | Standard chart sections |
| `encounter_2026-06-16_psychiatry_followup.md` | Psychiatry initial/follow-up |
| `encounter_2026-08-04_psychiatry_followup.md` | Psychiatry follow-up |

---

## Open questions for the organisers

- Is there a mapping from `sample_NN_en` audio to these patient records, or are
  the two sets unrelated?
- What explains the index gaps in the audio (no 10, 23–25, 27)?
- Was `jane_smith/use-cases.md` meant to be empty?
- Redistribution terms — can these fixtures live in a public repo after the event?

## Change log

| Date | Change |
|---|---|
| 2026-08-20 | Imported from three organiser downloads; duplicate audio folder discarded; this file written |
| 2026-08-20 | V1 run: `sample_17_en.wav` transcribed with `diarize:true`, row verified, transcript cached under `transcripts/` |
| 2026-08-20 | V1b run: `sample_9_en.m4a`, `sample_8_en.m4a`, `sample_13_en.wav` transcribed with `diarize:true` + `spokenPunctuation:true`; all single-speaker dictation |
