# Hour-one validations
Nothing downstream is written before these are answered. Paste raw output, not summaries.

V1  speakerId on multi-voice TTS mono, diarize true
    Does it populate, are slots stable across the file?
    Ran 2026-08-20 against the real endpoint.
    File:     fixtures/provided/audio/sample_17_en.wav  (longest 16 kHz mono WAV, 3:30, no transcode)
    Endpoint: POST https://api.eu.corti.app/v2/interactions/{id}/transcripts/
    Request:  {"recordingId":"bb672683-abf1-4dee-bdf4-e8624c740433","primaryLanguage":"en","diarize":true}
    HTTP 201, 8.4 s wall clock, creditsConsumed 0.02275
    Cached:   fixtures/provided/transcripts/sample_17_en.transcript.json  (ids in sample_17_en.ids.json)

    1. does speakerId populate on every segment, some, or none
       Every segment. There is exactly one segment. speakerId = 0, participant = 0, channel = 0.
       The field is present and populated, so it is not null-by-default. This run does not
       prove it separates voices, because this file has only one voice in it.

    2. how many distinct speaker slots, stable across the file
       One slot, speakerId 0, spanning start 1632 ms to end 209346 ms — the whole recording
       in a single segment. Stability is untested: one slot cannot drift.
       diarize:true did not split the audio into turns at all. No segmentation, no turn
       boundaries, no second speaker. metadata.participantsRoles = null (no participants[]
       was sent).

    3. first 15 segments verbatim with speakerId, start, text
       The response contains 1 segment, not 15. Pasted whole and verbatim:

       speakerId=0  participant=0  channel=0  start=1632  end=209346
       text:
       Reason for consultation Colon evaluation and management of chronic kidney disease and
       electrolyte imbalance Period new paragraph history of present illness Colon new line the patient
       is a 63-year-old female with a history of hypertension and type 2 diabetes mellitus Comma
       referred to nephrology consultation due to declining renal function and hyperkalemia period the
       patient reports fatigue and swelling in her lower extremities over the past month but denies any
       chest pain Comma dyspnea Comma or recent infections Period she notes poor dietary adherence
       Period new paragraph past medical history Colon hypertension Comma type 2 diabetes mellitus
       Period new paragraph medications Colon new line Lisinopril 10 mg daily new line Metformin 1,000
       mg by mouth twice daily new line Aspirin 81 mg daily new paragraph allergies Colon no known drug
       allergies period new paragraph social history Colon the patient reports no tobacco or illicit
       drug use Period consumes alcohol socially Comma 1-2 drinks per week period new paragraph family
       history Colon mother had hypertension Semicolon father had chronic kidney disease period new
       paragraph review of systems Colon negative except as noted in the history of present illness
       Period new paragraph vital signs Colon BP 152/88 period heart rate 78 bpm Period respiratory
       rate 16 breaths per minute period temperature 98.2 °F period weight 165 lb Period BMI 27 Period
       new paragraph physical exam Colon new line general Colon alert Comma oriented x 3 Comma no acute
       distress Period new line cardiovascular Colon regular rate and rhythm Comma no murmurs Comma
       rubs Comma or gallops Period new line respiratory Colon clear to auscultation bilaterally Comma
       no wheezes or rales Period new line abdomen Colon soft Comma non tender Comma nondistended Comma
       normal bowel sounds Period new line extremities Colon 1+ pitting edema in bilateral lower
       extremities Period new paragraph laboratory results Colon new line sodium 137 mmol/L new line
       potassium 5.9 mmol per L new line bicarbonate 20 mmol/L new line creatinine 2.1 mg/dL new line
       estimated GFR 28 mL/min per 1.73 m² new paragraph assessment Colon new line chronic kidney
       disease Comma stage IV with declining GFR new line hyperkalemia new line type 2 diabetes
       mellitus Comma suboptimal glycemic control new line hypertension new paragraph plan Colon new
       line one Period initiate a low potassium diet to address hyperkalemia period new line two Period
       consider discontinuing ACE inhibitor if potassium levels remain elevated Semicolon consult with
       primary physician Period new line three Period monitor renal functions and electrolytes closely
       with weekly labs period new line four period educate the patient on dietary management and the
       importance of diabetic control to slow CKD progression period new line five Period discuss
       options for dialysis access placement Comma considering current GFR and trajectory Period new
       line six period recommend a follow up appointment in 4 weeks to reassess renal function and
       overall management period new paragraph consult provided by Doctor Ravindra Tripathi, February
       20, 2026, period

    4. what the conversation actually is
       Not a conversation. This is single-speaker clinical DICTATION — one human, a
       nephrologist, dictating a consultation note into a recorder. No patient voice, no
       second party, no turn-taking. It signs off 'consult provided by Doctor Ravindra
       Tripathi, February 20, 2026'.
       Content: nephrology consult, 63F, CKD stage IV with declining GFR, hyperkalemia,
       T2DM and hypertension. Dictated in full note structure — reason for consultation,
       HPI, PMH, meds, allergies, social, family, ROS, vitals, exam, labs, assessment,
       six-point plan.
       Spoken punctuation is transcribed as literal words — 'Colon', 'Period', 'Comma',
       'new line', 'new paragraph' — because spokenPunctuation defaults to false and we
       did not send it. For dictation input that flag is needed; automaticPunctuation
       alone does not strip them.

    WHAT THIS DOES AND DOES NOT SETTLE
       Plumbing is proven end to end: OAuth client-credentials, create interaction, upload
       raw 16 kHz WAV as application/octet-stream with no transcode, create transcript.
       Four calls, ~8 s, works.
       The actual V1 question is unanswered. sample_17 is dictation, so it cannot show
       whether Corti separates two voices in a mono file. Until a genuinely multi-voice
       clip is run, treat pipeline/roles.ts as UNKNOWN, not as resolved either way.
       Next: run the same call on a clip that has two humans in it. If the provided audio
       is all dictation, the data scientist's multi-voice TTS becomes the blocker for V1.

V1b  same call on a second file, picked as most likely to be multi-human
     Ran 2026-08-20. Settings identical to V1 plus spokenPunctuation:true.

     HOW THE FILE WAS PICKED
       Filenames carry no content, so selection used measured turn-taking. ffmpeg
       silencedetect at a threshold calibrated to the real noise floor (mean volume
       -38 dB, so -30 dB found nothing; -45 dB used), pauses >= 0.7 s, per minute:
         M4A family  (samples 1-9):   0.0-1.6/min, except sample_8 at 6.3 and sample_9 at 8.1
         WAV family (samples 11-29):  2.9-6.2/min, sample_17 (known dictation) sits at 4.0
       sample_9_en.m4a has 5x the pause density of its own capture family — the
       strongest turn-taking signature in the corpus. M4A/AAC is natively accepted by
       /recordings, so still no transcode.

     RESULT: also single-speaker dictation. The proxy failed — pause density in this
     corpus tracks dictation cadence, not turn-taking.

     sample_9_en.m4a
       segment count:      1
       distinct speakerIds: [0]   participant: [0]   channel: [0]
       turn boundaries:    none. One segment, start 0 ms -> end 117983 ms, whole file.
       metadata.participantsRoles: None
       credits: 0.012805   cached: fixtures/provided/transcripts/sample_9_en.transcript.json
       what it is: Operative report — right pterional craniotomy for clipping of a right MCA bifurcation aneurysm, surgeon of record Dr Williams. Full operative narrative from positioning to closure. One surgeon dictating.

     sample_8_en.m4a
       segment count:      1
       distinct speakerIds: [0]   participant: [0]   channel: [0]
       turn boundaries:    none. One segment, start 1504 ms -> end 179504 ms, whole file.
       metadata.participantsRoles: None
       credits: 0.01963   cached: fixtures/provided/transcripts/sample_8_en.transcript.json
       what it is: Radiology report — lumbar spine MRI, indication herniated disc. L4-L5 broad-based posterior herniation with moderate canal stenosis and left L5 root impingement. One radiologist dictating.

     sample_13_en.wav
       segment count:      1
       distinct speakerIds: [0]   participant: [0]   channel: [0]
       turn boundaries:    none. One segment, start 864 ms -> end 145306 ms, whole file.
       metadata.participantsRoles: None
       credits: 0.015795   cached: fixtures/provided/transcripts/sample_13_en.transcript.json
       what it is: Paediatric well-child check, 4-year-old. Developmental milestones, growth percentiles, exam, anticipatory guidance. One clinician dictating; no child or parent voice.

     spokenPunctuation:true — works, and it is input-dependent
       sample_8 and sample_13 come back properly punctuated, with headings and line
       breaks, because those speakers dictated punctuation out loud. Every literal
       'Period' / 'Comma' / 'new paragraph' that polluted V1 is gone.
       sample_9 comes back with zero periods and zero commas in 1836 characters — that
       speaker never dictated any punctuation, so there was none to convert. The flag
       does not invent punctuation; automaticPunctuation did not fill the gap either.
       Consequence: transcript punctuation cannot be relied on as a sentence-boundary
       signal. Anything segmenting text must not assume periods exist.

     CONCLUSION AFTER FOUR FILES (17, 9, 8, 13 — both capture families)
       Four for four: one segment, speakerId 0, no turn boundaries. Two capture setups,
       four specialties, both file formats. The provided corpus is a DICTATION corpus,
       not consultation recordings. Nothing in it can answer V1.
       diarize:true is confirmed harmless and confirmed uninformative here — it has
       never been given a file with two voices in it.
       V1 stays UNANSWERED. pipeline/roles.ts stays UNKNOWN.
       BLOCKER: the data scientist's multi-voice TTS is now on the critical path. Until
       one two-voice clip exists, diarization is untested and the evidence-attribution
       story ('quote, speaker, time') has no speaker.
V2  medical coding scope
    Which code systems return, does coding run on segments or on facts?
    Result:
    Decides whether matching happens pre- or post-coding.

V3  agentic framework and MCP
    Can the agent reach an external MCP endpoint, at what setup cost?
    Result:
    If expensive: dispatch degrades to a logged intent, still fully demoable.
