// S3 Grounding. The gate every candidate fact has to pass.
//
// Pure function of its arguments. No clock, no network, no stored state (D8).
//
// A candidate is a claim. It becomes a fact only if a real utterance in the log
// supports it: the event exists, it is speech-source, it is in the right room,
// and it is attributed to the speaker role the claim depends on. Anything else
// is discarded outright — not downgraded, not shown in grey, not kept with a
// low confidence. A fact that cannot point at a quote does not exist (D2).
//
// The quote on a grounded fact is copied from the event, never from the
// candidate. That is the whole anti-hallucination mechanism: whatever produced
// the candidate does not get to write its own evidence.
//
// Two channels out. The discard list is not error handling — it is what the
// surface shows when the system refuses, which is the most honest thing it
// does. See docs/DEMO.md.
//
// NOTE: Candidate and GroundedFact are pipeline-internal for now. If
// observations.ts or the engines start passing them across a lane boundary
// they belong in contracts/, like Event.

import type { Event, EventId, Millis, Speaker } from "../contracts/index.ts";

/** A claim awaiting evidence. Produced upstream; grounded or discarded here. */
export interface Candidate {
  /** Caller's id, echoed back on both channels so it can be traced. */
  readonly id: string;
  readonly room: string;
  readonly observation: string;
  readonly value?: number | string | null;
  /** The role the claim depends on. 'unknown' accepts an unattributed utterance. */
  readonly expectedSpeaker: Speaker;
  /** The utterance claimed to support this. Absent means unsupported. */
  readonly sourceEventId?: EventId;
  /** Optional: words the claim says were spoken. Checked against the utterance. */
  readonly quote?: string;
}

/** A candidate that survived. Everything here came out of the log. */
export interface GroundedFact {
  readonly candidateId: string;
  readonly room: string;
  readonly observation: string;
  readonly value: number | string | null;
  readonly eventId: EventId;
  /** Verbatim, from the supporting event. */
  readonly quote: string;
  readonly speaker: Speaker;
  readonly ts: Millis;
}

export type DiscardReason =
  /** The candidate named no supporting utterance. */
  | "no-supporting-event"
  /** It named one that is not in the log. */
  | "event-not-found"
  /** The supporting event is a feed, not speech. Feeds corroborate, never conclude (D2). */
  | "not-speech"
  /** The utterance is in a different room. */
  | "room-mismatch"
  /** The utterance is attributed to a different role. */
  | "wrong-speaker"
  /** The utterance has no role yet, and the claim needs one. */
  | "speaker-unresolved"
  /** The candidate quoted words the utterance does not contain. */
  | "quote-not-in-utterance";

export interface Discarded {
  readonly candidate: Candidate;
  readonly reason: DiscardReason;
  /** One line, written to be shown. */
  readonly detail: string;
}

export interface Grounding {
  readonly grounded: readonly GroundedFact[];
  readonly discarded: readonly Discarded[];
}

function discard(candidate: Candidate, reason: DiscardReason, detail: string): Discarded {
  return Object.freeze({ candidate, reason, detail });
}

/** Loose containment: the candidate must not introduce words the speaker did not say. */
function quotedInside(claimed: string, spoken: string): boolean {
  return spoken.toLowerCase().includes(claimed.trim().toLowerCase());
}

/**
 * Keep only the candidates a real utterance supports.
 *
 * Order is preserved on both channels, and every candidate lands in exactly
 * one of them.
 */
export function ground(
  candidates: readonly Candidate[],
  events: readonly Event[],
): Grounding {
  const byId = new Map<EventId, Event>();
  for (const event of events) byId.set(event.id, event);

  const grounded: GroundedFact[] = [];
  const discarded: Discarded[] = [];

  for (const candidate of candidates) {
    if (candidate.sourceEventId === undefined) {
      discarded.push(
        discard(
          candidate,
          "no-supporting-event",
          `"${candidate.observation}" named no supporting utterance.`,
        ),
      );
      continue;
    }

    const event = byId.get(candidate.sourceEventId);
    if (event === undefined) {
      discarded.push(
        discard(
          candidate,
          "event-not-found",
          `"${candidate.observation}" cites ${candidate.sourceEventId}, which is not in the log.`,
        ),
      );
      continue;
    }

    if (event.source !== "speech") {
      discarded.push(
        discard(
          candidate,
          "not-speech",
          `"${candidate.observation}" rests on a ${event.source} event. ` +
            `Feeds corroborate, they never conclude.`,
        ),
      );
      continue;
    }

    if (event.room !== candidate.room) {
      discarded.push(
        discard(
          candidate,
          "room-mismatch",
          `"${candidate.observation}" is for ${candidate.room} but ${event.id} was spoken in ${event.room}.`,
        ),
      );
      continue;
    }

    if (candidate.expectedSpeaker !== "unknown" && event.speaker === "unknown") {
      discarded.push(
        discard(
          candidate,
          "speaker-unresolved",
          `"${candidate.observation}" needs the ${candidate.expectedSpeaker}, but ${event.id} ` +
            `has no role assigned. Diarization did not separate the voices.`,
        ),
      );
      continue;
    }

    if (event.speaker !== candidate.expectedSpeaker) {
      discarded.push(
        discard(
          candidate,
          "wrong-speaker",
          `"${candidate.observation}" needs the ${candidate.expectedSpeaker}, but ${event.id} ` +
            `was spoken by the ${event.speaker}.`,
        ),
      );
      continue;
    }

    if (candidate.quote !== undefined && !quotedInside(candidate.quote, event.quote)) {
      discarded.push(
        discard(
          candidate,
          "quote-not-in-utterance",
          `"${candidate.observation}" quotes words ${event.id} does not contain.`,
        ),
      );
      continue;
    }

    grounded.push(
      Object.freeze({
        candidateId: candidate.id,
        room: candidate.room,
        observation: candidate.observation,
        value: candidate.value ?? null,
        eventId: event.id,
        quote: event.quote,
        speaker: event.speaker,
        ts: event.ts,
      }),
    );
  }

  return Object.freeze({
    grounded: Object.freeze(grounded),
    discarded: Object.freeze(discarded),
  });
}
