// S5 Patient State. Deterministic rules over grounded coded facts, corroborated by feeds.
//
// Pure function of the event log. No network, no stored state.
// Takes `now` as an explicit argument (D8). Never calls Date.now().
// Live passes Date.now(); replay passes the timestamp of the last event read.
//
// Two things this engine will not do, both from D2:
//
//   A feed never raises a level. A saturation of 86% is corroboration for
//   something a human said, never a conclusion on its own. Feed events carry
//   no code by contract, so they cannot even be counted as a mention.
//
//   An unattributed utterance never raises a level. If diarization did not
//   separate the voices, speaker is 'unknown' and no rule requiring the
//   patient can fire. The room stays green and the reason says why.
//
// Rules live in rules/patient.rules.ts and are data. This file is the fold.

import type { Event, EventId, Millis } from "../contracts/index.ts";
import { PATIENT_RULES, type Level, type PatientRule } from "./rules/patient.rules.ts";

export interface PatientState {
  readonly room: string;
  readonly level: Level;
  readonly reason_text: string;
  readonly evidence: readonly EventId[];
  readonly changed_at: Millis;
  /** Consumed by web/, which animates the change. Never omitted. */
  readonly previous_level: Level;
}

export interface PatientStateOptions {
  readonly room: string;
  /** The level before this fold. Defaults to green. */
  readonly previousLevel?: Level;
  /** Override for tests and for the doctor's table once it lands. */
  readonly rules?: readonly PatientRule[];
}

interface Firing {
  readonly rule: PatientRule;
  readonly first: Event;
  readonly second: Event;
}

const GREEN_NO_EVENTS = "No speech has raised anything in this room.";

/** A coded mention of one of the rule's concepts. Feeds are excluded by having no code. */
function mentions(events: readonly Event[], rule: PatientRule): Event[] {
  return events.filter(
    (e) => e.source === "speech" && e.code !== null && rule.codes.includes(e.code),
  );
}

/**
 * The earliest pair that satisfies a rule: a mention by the required speaker,
 * then any later mention of the same code inside the window.
 *
 * Earliest rather than latest, because changed_at should be when the room
 * actually turned, not when it was last confirmed.
 */
function firstFiring(events: readonly Event[], rule: PatientRule): Firing | undefined {
  const coded = mentions(events, rule);

  for (const first of coded) {
    if (first.speaker !== rule.reportedBy) continue;
    for (const second of coded) {
      if (second === first) continue;
      if (second.ts < first.ts) continue;
      if (second.code !== first.code) continue;
      if (second.ts - first.ts > rule.windowMs) continue;
      return { rule, first, second };
    }
  }
  return undefined;
}

/** Feed events that landed between the two mentions. Evidence, never cause. */
function corroboration(events: readonly Event[], firing: Firing): Event[] {
  return events.filter(
    (e) => e.source !== "speech" && e.ts >= firing.first.ts && e.ts <= firing.second.ts,
  );
}

function explain(firing: Firing, corroborating: readonly Event[]): string {
  const { rule, first, second } = firing;
  const gapMinutes = Math.round((second.ts - first.ts) / 60000);

  const parts = [
    `Breathing difficulty (${first.code}) reported by the ${first.speaker} at ts ${first.ts}, ` +
      `mentioned again by the ${second.speaker} at ts ${second.ts} — ${gapMinutes} minutes later, ` +
      `inside the ${Math.round(rule.windowMs / 60000)} minute window.`,
  ];
  if (corroborating.length > 0) {
    parts.push(
      `Corroborated by ${corroborating.length} feed reading${corroborating.length === 1 ? "" : "s"} ` +
        `(${corroborating.map((e) => e.observation).join(", ")}), which did not raise the level.`,
    );
  }
  if (rule.provisional) {
    parts.push(`PROVISIONAL rule ${rule.id}, pending clinical sign-off.`);
  }
  return parts.join(" ");
}

/**
 * Fold the log into one room's Patient State at `now`.
 *
 * Events after `now` are invisible, so replaying to T reproduces the state at
 * T exactly. Only rules matching on speech can raise the level; everything
 * else is evidence.
 */
export function patientState(
  events: readonly Event[],
  now: Millis,
  options: PatientStateOptions,
): PatientState {
  const previous_level = options.previousLevel ?? "green";
  const rules = options.rules ?? PATIENT_RULES;

  const visible = events.filter((e) => e.room === options.room && e.ts <= now);

  for (const rule of rules) {
    const firing = firstFiring(visible, rule);
    if (firing === undefined) continue;

    const corroborating = corroboration(visible, firing);
    return Object.freeze({
      room: options.room,
      level: rule.level,
      reason_text: explain(firing, corroborating),
      evidence: Object.freeze([
        firing.first.id,
        firing.second.id,
        ...corroborating.map((e) => e.id),
      ]),
      changed_at: firing.second.ts,
      previous_level,
    });
  }

  return Object.freeze({
    room: options.room,
    level: "green",
    reason_text: greenReason(visible, rules),
    evidence: Object.freeze([]),
    changed_at: 0,
    previous_level,
  });
}

/** Say why nothing fired. A green with no explanation is a green nobody trusts. */
function greenReason(visible: readonly Event[], rules: readonly PatientRule[]): string {
  if (visible.length === 0) return GREEN_NO_EVENTS;

  const speech = visible.filter((e) => e.source === "speech");
  if (speech.length === 0) {
    return `${visible.length} feed reading${visible.length === 1 ? "" : "s"} and no speech. ` +
      `Feeds corroborate, they never conclude.`;
  }

  const coded = rules.flatMap((rule) => mentions(speech, rule));
  if (coded.length === 0) {
    return `${speech.length} utterance${speech.length === 1 ? "" : "s"}, none coded to a concept any rule watches.`;
  }
  if (coded.every((e) => e.speaker === "unknown")) {
    return `${coded.length} relevant mention${coded.length === 1 ? "" : "s"}, but no speaker is attributed. ` +
      `Diarization did not separate the voices, so no rule can fire.`;
  }
  return `${coded.length} relevant mention${coded.length === 1 ? "" : "s"}, but no rule's conditions were met.`;
}
