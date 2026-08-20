# Demo run sheet — 5:00 hard, 2:00 Q&A after

0:00  Introductions, all four, name and role. Team name and number said once by speaker 1.
0:25  Doctor: the ward today, two disconnected systems, and the line — a task nobody did
      and a task nobody mentioned look identical.
1:10  Demo, you. Silent except the conversation audio.
        Audio plays, room 2's Patient State moves to yellow with its quote.        ~30s
        A planned assessment nobody discussed flags on Coordination.
        HOLD THREE SECONDS OF SILENCE.                                            ~15s
        CT request derives, enters the ranked queue above two others, score shown.  ~20s
        Agent proposes a slot with rationale. Human confirms by voice.             ~25s
        Task offered to nurse A, engaged, declines audibly. Travels to B, accepts.  ~30s
        Log view: the whole chain, every step citing an event.                     ~10s
3:20  API teammate: architecture, one slide, five of five areas, one word each on why
      load-bearing. Ends on "remove Corti and this is a dead map."
3:50  Data scientist: eval table, then the FactsR receipt. Extraction resolves
      disagreement; reconciliation requires preserving it.
4:20  UI teammate: the two-bar card and the travelling task, why they are visually loud.
4:45  Doctor: what he would have missed. One sentence. Stop.

## Live rule
The Corti call happens once on stage during the state change, visibly, satisfying the
requirement to show speech to text functional. One clause, then move on.
Everything else replays from fixtures/events/demo.jsonl.

## Cut list, in cut order
log view · score components on screen · slot proposal · the third room
Never cut: the three seconds of silence.

## Q&A, one sentence each
Priority: doctor's weights, deterministic, shown on the card.
Booking: a human, always, confirmed by voice.
Hallucination: the candidate dies without a speaker-attributed quote.
Interrupted nurse: her task returns to the queue and is reoffered. Nothing is dropped.
Clinical questions to the doctor. Everything else to you.
