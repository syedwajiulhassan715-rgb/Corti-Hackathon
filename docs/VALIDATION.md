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
V1 RESOLVED  diarization on a genuine two-voice recording
     Ran 2026-08-20. The question V1 and V1b could not answer is now answered.
     File:     fixtures/audio/test_twovoice_01.16k.wav
     Source:   fixtures/audio/test_twovoice_01.wav.m4a — named .wav but actually AAC
               in an M4A container (magic ftypM4A), 48 kHz, STEREO, 93.76 s. A copy
               was converted to 16 kHz mono PCM; the original is untouched. The L-R
               residual sat ~9 dB below the channels, so the voices were not
               hard-panned and the downmix discarded nothing.
     Path:     the real corti/cache + corti/transcribe modules. diarize:true,
               spokenPunctuation:true. HTTP 201, credits 0.010140000000000001.
     Cached:   fixtures/transcripts/test_twovoice_01.transcript.json

     1. segment count
        17

     2. distinct speakerIds, and do they alternate sensibly
        speakerIds [0,1]  participants [0,1]  channels [0]
        sequence:  0 1 0 1 0 1 0 1 0 1 0 1 0 1 0 1 0
        16 switches across 17 segments. Perfect alternation: no drift, no
        third slot invented, no slot swapped mid-file.
        slot 0: 9 segments, 56.5s speaking
        slot 1: 8 segments, 28.6s speaking
        Against the actual turn-taking: CORRECT. Slot 0 is the nurse (opens the
        round, reads the observations aloud, calls the acute team). Slot 1 is the
        patient (reports the pain, asks whether it is a clot). Every turn sits on
        the right slot.

     3. first 15 segments verbatim
        speakerId=0 start=608 end=7167
          Good morning Anna the chart says that you had a quiet evening the chox is one and you're doing fine
        speakerId=1 start=7487 end=11811
          I was fine earlier but something has changed I have a sharp pain here in my chest
        speakerId=0 start=12132 end=15647
          oh you have pneumonia coughing hurts that's hardly surprising
        speakerId=1 start=16046 end=21647
          no no no it's different it started about 20 minutes ago and the pain is 9/10 and I cannot catch my breath
        speakerId=0 start=21976 end=29804
          oh yesterday you said your pain was only 1/10 you're talking to me and you're getting air
        speakerId=1 start=30448 end=35169
          but but I'm puffing from just sitting here this be a blood clot
        speakerId=0 start=35489 end=39810
          let's not diagnose ourselves I can give you some more pain medication
        speakerId=1 start=40286 end=45325
          no thank you I don't I don't want to just cover the pain please check who I cannot breathe
        speakerId=0 start=45646 end=48442
          okay fine let me look at the new observations
        speakerId=1 start=48692 end=51646
          it's getting harder it's getting harder again I feel dizzy too
        speakerId=0 start=52286 end=65488
          your oxygen saturation is 87% despite 2 L of oxygen respiration rate 30 pulse 180 blood pressure 90/80 f eight
        speakerId=1 start=65808 end=68285
          is that bad could this be a blood clot
        speakerId=0 start=68449 end=71886
          your neurotoxic seven this is changed significantly
        speakerId=1 start=72206 end=74050
          you did not answer my question
        speakerId=0 start=74605 end=80120
          I heard you I'm calling the acute team now s try sitting up right and try not to stand

     4. roles.ts on this result
        method:   question-density
        resolved: true
        note:     Slot 1 asked 13% questions against 0%, so it is the clinician; the rest is the patient side.
        slot 0: 9 utterances, 0 questions, questionRate 0.000, clinicalRate 0.222 -> patient
        slot 1: 8 utterances, 1 questions, questionRate 0.125, clinicalRate 0.000 -> clinician

        *** roles.ts ASSIGNED THE ROLES BACKWARDS. ***
        It called slot 1 the clinician and slot 0 the patient. Both are inverted.
        Why: question density is the primary discriminator, and in this scenario the
        clinician asks nothing at all. Slot 0 scored 0 questions in 9 utterances
        because it dismisses rather than enquires — 'oh you have pneumonia coughing
        hurts that's hardly surprising'. Slot 1, the patient, asks the only question
        in the recording: 'is that bad could this be a blood clot'. The heuristic did
        exactly what it was written to do and was wrong.
        Clinical vocabulary had the right answer and was never consulted: slot 0
        scores 0.222 against slot 1 at 0.000. It is currently a tie-break only, so a
        clear 0-vs-0.125 question margin overrode it.
        This is a heuristic failure, not a diarization failure. Corti did its job.

     WHAT IS NOW SETTLED
        speakerId populates and separates two voices in a mono 16 kHz file. Slots are
        stable across the whole file. pipeline/roles.ts is a MUST, and it now has
        real input to be tuned against instead of synthetic fixtures.
        The single-slot refusal path stays: it is still correct for the 24 provided
        dictation clips.

     WHAT IS NOT SETTLED
        Which signal should be primary. On this recording clinical vocabulary wins
        and question density loses. One recording is not a basis for inverting the
        rule — that needs the doctor's view and a second two-voice scenario where the
        clinician does ask questions. Until then roles.ts is UNCHANGED and known to
        invert on this file. Do not demo role labels on this recording.

     ASR ACCURACY NOTE, relevant to V2 and the demo script
        Clinical shorthand came back mangled: 'the chox is one' (obs/TOKS?),
        'your neurotoxic seven' (NEWS/TOKS is seven?), 'blood pressure 90/80 f eight'
        (temperature 38?), 'the implica initiated problem'. Numbers and plain clinical
        English survived — '87%', '2 L of oxygen', 'respiration rate 30', 'pulse 180'.
        Anything keying on TOKS or NEWS by name will not find it in this transcript.
V2  medical coding scope
    Which code systems return, does coding run on segments or on facts?
    Result:
    Decides whether matching happens pre- or post-coding.

V3  agentic framework and MCP
    Can the agent reach an external MCP endpoint, at what setup cost?
    Result:
    If expensive: dispatch degrades to a logged intent, still fully demoable.
