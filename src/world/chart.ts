// World: a patient's charted past, as events.
//
// The 11 provided charts (fixtures/provided/SOURCE.md) carry real dated
// vitals and labs. This file turns those markdown tables into the same
// EventInput shape the live monitor (world/feeds.ts) produces, so the trend
// engine cannot tell a charted reading from a simulated one — only the
// timestamp differs. That is the whole point: the ward's "history" is not a
// separate concept from its "feed", it is older events in the same log.
//
// PARSE WHAT WE CAN CONFIRM, SKIP THE REST. Chart formats vary encounter to
// encounter and patient to patient (see the samples this was built against:
// maria_gonzalez, robert_okafor, elena_petrova, and the rest of
// fixtures/provided/text/*/vitals.md). Rather than one schema, this file
// runs a set of label-specific regexes over each dated section and only
// emits an observation when its regex matched with a unit or label attached.
// A number we are not confident about is a number we do not emit — the same
// rule patients.ts#parseConditions already follows for ICD-10 codes.
//
// PURE APART FROM THE READ. Like world/patients.ts and world/feeds.ts, this
// module is allowed to touch disk (it is world/), but never reads a clock —
// there is nothing here for `now` to affect, since every timestamp comes
// from a date already written in the chart.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { EventInput, Millis, PatientId } from "../contracts/index.ts";

const RECORDS = "fixtures/provided/text";

/**
 * Charts record a date, never a time of day. Noon UTC is the fixed stand-in
 * for "some time that day" — never randomised (product law), never derived
 * from the reader's local timezone (that would make the same chart parse to
 * different timestamps on different machines, breaking replay). Noon is
 * chosen over midnight so a date never silently rolls to the adjacent day
 * under a timezone-aware display layer.
 */
const CHART_TIME_OF_DAY_UTC_HOUR = 12;

/**
 * A handful of sections are headed by a month only, e.g. "## 2024-05 — Post-
 * treatment baseline" (aisha_rahman). Day 15 — the middle of the month — is
 * the least-wrong single day to assign: it is no more "guessing" than day 1
 * would be, but it does not bias a trend engine into reading a mid-month
 * value as though it were recorded at a month boundary.
 */
const CHART_DAY_OF_MONTH_DEFAULT = 15;

interface Section {
  readonly heading: string;
  readonly body: string;
}

/** Split a chart file into its "## <heading>" sections. */
function splitSections(markdown: string): Section[] {
  const sections: Section[] = [];
  let current: { heading: string; body: string } | null = null;

  for (const line of markdown.split("\n")) {
    const heading = line.match(/^##\s+(.*)/);
    if (heading !== null) {
      if (current !== null) sections.push(current);
      current = { heading: heading[1]!.trim(), body: "" };
      continue;
    }
    if (current !== null) current.body += line + "\n";
  }
  if (current !== null) sections.push(current);
  return sections;
}

/**
 * A section heading like "2026-08-15 — ED presentation" or "2024-05 — Post-
 * treatment baseline" parses to a timestamp. A heading with no leading date
 * — "Standing", "2026 (current — see note)" — returns null and the whole
 * section is skipped: we do not guess which day an undated note belongs to.
 */
function sectionDate(heading: string): Millis | null {
  const match = heading.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?\b/);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = match[3] !== undefined ? Number(match[3]) : CHART_DAY_OF_MONTH_DEFAULT;
  return Date.UTC(year, month - 1, day, CHART_TIME_OF_DAY_UTC_HOUR, 0, 0, 0);
}

function vitalEvent(
  patientId: PatientId,
  room: string,
  ts: Millis,
  observation: string,
  value: number,
): EventInput {
  return {
    ts,
    patientId,
    room,
    source: "vital",
    // CONTRACTS: non-speech sources carry no speaker and no words, and are
    // never coded.
    speaker: "unknown",
    quote: "",
    code: null,
    observation,
    value,
  };
}

function labEvent(
  patientId: PatientId,
  room: string,
  ts: Millis,
  observation: string,
  value: number,
): EventInput {
  return {
    ts,
    patientId,
    room,
    source: "lab",
    speaker: "unknown",
    quote: "",
    code: null,
    observation,
    value,
  };
}

// ------------------------------------------------------------- vitals.md
//
// Each regex matches a label ("Heart rate", "HR", "BP", ...) followed by its
// number(s), with the unit optional — the compact format
// ("HR 72, BP 118/76 mmHg") drops units the verbose format keeps
// ("Heart rate: 58 bpm"). What is NOT optional is the label: a bare number
// with no recognised label attached is never captured, because there is no
// way to know which observation it belongs to.

// "58 bpm (initial), then 92 bpm" (robert_okafor, ED presentation): two
// readings taken minutes apart during the same encounter, the first on
// arrival and the second once triage began. We take the settled ("then")
// reading, not the transient initial one, because a trend engine comparing
// this encounter to the next wants the value that describes the patient's
// state going forward, not the number that prompted the visit.
const HEART_RATE = /(?:Heart rate|HR)\b\s*:?\s*(\d{2,3})(?:\s*bpm)?(?:[^\n]{0,40}?\bthen\s*(\d{2,3})\s*bpm)?/i;

// "BP 122/72 (sitting), 112/66 (standing)" (harold_mitchell): an orthostatic
// pair. We take the first (resting/sitting) reading. The trend engine tracks
// this patient's resting baseline over time; the standing reading is a
// point-in-time orthostatic challenge, a different clinical question, and
// has no observation name of its own here.
const BLOOD_PRESSURE = /(?:Blood pressure|BP)\b\s*:?\s*(\d{2,3})\/(\d{2,3})/i;

const RESPIRATORY_RATE = /(?:Respiratory rate|RR)\b\s*:?\s*(\d{1,2})(?:\s*\/?\s*min)?/i;

// "93% on room air → 96% on 2L NC" (elena_petrova): before/after supplemental
// oxygen. We take the value after intervention, for the same reason as the
// heart-rate "then" rule above — it is the number that describes the
// patient going forward, room-air readings under acute distress are not
// comparable across encounters where oxygen support differed.
const SPO2 =
  /(?:Oxygen saturation(?:\s*\(SpO2\))?|SpO2)\b\s*:?\s*(\d{2,3})\s*%(?:[^\n]{0,40}?[→>]\s*(\d{2,3})\s*%)?/i;

const TEMPERATURE = /(?:Temperature|Temp)\b\s*:?\s*(\d{2}(?:\.\d+)?)\s*°?\s*C/i;

const WEIGHT_KG = /Weight\b\s*:?\s*(\d{1,3}(?:\.\d+)?)\s*kg/i;

/**
 * Parse one patient's vitals.md into events.
 *
 * `room` is supplied by the caller (typically `roomForPatient`) rather than
 * looked up here, so this stays a pure string-in-events-out function with no
 * dependency on how rooms get assigned.
 */
export function parseVitalsMarkdown(
  markdown: string,
  patientId: PatientId,
  room: string,
): EventInput[] {
  const events: EventInput[] = [];

  for (const { heading, body } of splitSections(markdown)) {
    const ts = sectionDate(heading);
    if (ts === null) continue; // undated section: "Standing", "2026 (current...)"

    const hr = body.match(HEART_RATE);
    if (hr !== null) {
      const value = hr[2] !== undefined ? Number(hr[2]) : Number(hr[1]);
      events.push(vitalEvent(patientId, room, ts, "heart_rate", value));
    }

    const bp = body.match(BLOOD_PRESSURE);
    if (bp !== null) {
      events.push(vitalEvent(patientId, room, ts, "systolic_bp", Number(bp[1])));
      events.push(vitalEvent(patientId, room, ts, "diastolic_bp", Number(bp[2])));
    }

    const rr = body.match(RESPIRATORY_RATE);
    if (rr !== null) {
      events.push(vitalEvent(patientId, room, ts, "respiratory_rate", Number(rr[1])));
    }

    const spo2 = body.match(SPO2);
    if (spo2 !== null) {
      const value = spo2[2] !== undefined ? Number(spo2[2]) : Number(spo2[1]);
      events.push(vitalEvent(patientId, room, ts, "spo2", value));
    }

    const temp = body.match(TEMPERATURE);
    if (temp !== null) {
      events.push(vitalEvent(patientId, room, ts, "temperature", Number(temp[1])));
    }

    const weight = body.match(WEIGHT_KG);
    if (weight !== null) {
      events.push(vitalEvent(patientId, room, ts, "weight", Number(weight[1])));
    }
  }

  return events;
}

// --------------------------------------------------------------- labs.md
//
// Lab tables are `| Test | Result | Reference Range | Flag |`. Test names
// are free text ("High-sensitivity Troponin I (peak)", "CBC — WBC") with no
// fixed vocabulary the way vitals have in world/feeds.ts#VITAL, so the
// observation name here is a deterministic slug of the test name rather
// than a curated constant. A Result cell that does not start with a number
// — "Pending", "2/2 pending; no growth at 24h", "—" — is skipped: those
// are qualitative results, and turning "Pending" into a number would be a
// guess wearing a number's clothes.

function normalizeTestName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function parseLabsMarkdown(
  markdown: string,
  patientId: PatientId,
  room: string,
): EventInput[] {
  const events: EventInput[] = [];

  for (const { heading, body } of splitSections(markdown)) {
    const ts = sectionDate(heading);
    if (ts === null) continue;

    for (const line of body.split("\n")) {
      if (!line.startsWith("|")) continue;
      const cells = line.split("|").map((c) => c.trim());
      if (cells.length < 5) continue;

      const [, rawName, rawResult] = cells;
      if (rawName === undefined || rawResult === undefined) continue;
      if (rawName === "" || rawName === "Test" || rawName.startsWith("---")) continue;

      // Guards against "2/2 pending; no growth at 24h": a leading digit that
      // is actually the numerator of a ratio, not a measurement.
      const valueMatch = rawResult.match(/^\**(-?\d+(?:\.\d+)?)(?!\/\d)/);
      if (valueMatch === null) continue; // qualitative or pending result: skip

      const observation = normalizeTestName(rawName);
      if (observation === "") continue;

      events.push(labEvent(patientId, room, ts, observation, Number(valueMatch[1])));
    }
  }

  return events;
}

function readIfPresent(dir: string, file: string): string {
  const path = join(dir, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

/**
 * Load one patient's charted vitals and labs from disk as events.
 *
 * Returns an empty array for a missing chart rather than throwing — a
 * failing stage degrades to a missing card, never a crash (test law).
 */
export function loadChartEvents(slug: PatientId, room: string): EventInput[] {
  const dir = join(RECORDS, slug);
  if (!existsSync(dir)) return [];

  const vitals = parseVitalsMarkdown(readIfPresent(dir, "vitals.md"), slug, room);
  const labs = parseLabsMarkdown(readIfPresent(dir, "labs.md"), slug, room);

  return [...vitals, ...labs].sort((a, b) => a.ts - b.ts);
}
