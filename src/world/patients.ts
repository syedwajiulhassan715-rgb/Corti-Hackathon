// World: who is in which bed, and what their chart already says.
//
// FAKED, DELIBERATELY AND VISIBLY (honesty law).
// The recording says "Anna Jensen". The chart is Elena Petrova's. There is no
// real admissions system behind this, so the room -> patient link below is a
// hardcoded assignment for the demo and is labelled as such everywhere it
// surfaces: PatientRecord.simulated is true and the UI prints it. The
// environment is faked; nothing on the Corti path is.
//
// The charts themselves are real fixture data shipped with the hackathon, not
// written by us. We read them, we never edit them.
//
// This file is world/, so it is allowed to touch the disk. Everything that
// reasons about a record — projections/history — takes the record as an
// argument and stays pure.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import type { PatientId } from "../contracts/index.ts";

const RECORDS = "fixtures/provided/text";

/**
 * Which chart belongs to which bed. Hardcoded: see the header.
 *
 * The first three keep the rooms they already had — other workstreams build
 * against room-01/02/03 meaning david_kim/elena_petrova/aisha_rahman, and
 * that must not move. room-04..room-11 are the remaining eight provided
 * charts (fixtures/provided/SOURCE.md), in the order SOURCE.md lists them,
 * so the assignment is reproducible from the doc rather than arbitrary.
 */
export const ROOM_PATIENTS: Readonly<Record<string, string>> = Object.freeze({
  "room-01": "david_kim",
  "room-02": "elena_petrova",
  "room-03": "aisha_rahman",
  "room-04": "harold_mitchell",
  "room-05": "jamal_wright",
  "room-06": "jane_smith",
  "room-07": "lily_chen",
  "room-08": "maria_gonzalez",
  "room-09": "robert_okafor",
  "room-10": "sarah_nguyen",
  "room-11": "tom_baker",
});

/**
 * The 11 provided chart slugs, in the same order as ROOM_PATIENTS above.
 * Not derived from ROOM_PATIENTS with Object.values: object key order is an
 * implementation detail we would rather not depend on, and this list is the
 * one place that ordering is asserted explicitly.
 */
export const ALL_PATIENTS: readonly PatientId[] = Object.freeze([
  "david_kim",
  "elena_petrova",
  "aisha_rahman",
  "harold_mitchell",
  "jamal_wright",
  "jane_smith",
  "lily_chen",
  "maria_gonzalez",
  "robert_okafor",
  "sarah_nguyen",
  "tom_baker",
]);

export interface Condition {
  /** ICD-10, as written on the problem list. */
  readonly code: string;
  readonly label: string;
  readonly status: string;
}

export interface Medication {
  readonly name: string;
  readonly dose: string;
  readonly frequency: string;
  readonly purpose: string;
}

export interface Encounter {
  readonly date: string;
  readonly title: string;
  readonly text: string;
}

export interface PatientRecord {
  readonly slug: string;
  readonly name: string;
  readonly mrn: string;
  readonly summary: string;
  readonly conditions: readonly Condition[];
  readonly medications: readonly Medication[];
  readonly encounters: readonly Encounter[];
  /** Always true here. The room assignment is not real. */
  readonly simulated: true;
}

/**
 * Problem-list lines look like:
 *   - **Community-acquired pneumonia (CAP)** — ICD-10 J18.9
 * followed by indented Onset/Status lines, or:
 *   - **Hyperlipidemia** — ICD-10 E78.5 — Active
 *
 * Anything without an ICD-10 code is skipped rather than guessed at. A
 * problem we cannot name by code is a problem we cannot match against a
 * conversation, and half-matching it would be worse than not listing it.
 */
function parseConditions(markdown: string): Condition[] {
  const conditions: Condition[] = [];
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const match = line.match(/\*\*(.+?)\*\*\s*[—-]+\s*ICD-10\s+([A-Z]\d{2}(?:\.\d+)?)/);
    if (match === null) continue;

    const [, label, code] = match;
    let status = line.split(/[—-]{1,2}\s*/).at(-1)?.trim() ?? "";
    if (status.includes("ICD-10")) status = "";

    // Status may be on an indented follow-up line instead.
    for (let j = i + 1; j < lines.length && lines[j]!.startsWith("  "); j += 1) {
      const inner = lines[j]!.match(/Status:\s*(.+)/);
      if (inner !== null) status = inner[1]!.trim();
    }

    conditions.push(Object.freeze({ code: code!, label: label!.trim(), status }));
  }
  return conditions;
}

/** Markdown table rows: | Name | Dose | Route | Frequency | Started | Purpose | */
function parseMedications(markdown: string): Medication[] {
  const medications: Medication[] = [];

  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 8) continue;
    const [, name, dose, , frequency, , purpose] = cells;
    if (name === "Medication" || name === undefined) continue;
    if (name.startsWith("---") || name === "") continue;
    medications.push(
      Object.freeze({
        name,
        dose: dose ?? "",
        frequency: frequency ?? "",
        purpose: purpose ?? "",
      }),
    );
  }
  return medications;
}

function readIfPresent(dir: string, file: string): string {
  const path = join(dir, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function field(markdown: string, label: string): string {
  return markdown.match(new RegExp(`- ${label}:\\s*(.+)`))?.[1]?.trim() ?? "";
}

/**
 * Load one chart from disk.
 *
 * A missing or unparseable chart returns undefined rather than throwing: a
 * failing stage degrades to a missing card, never a crash (test law).
 */
export function loadRecord(slug: string): PatientRecord | undefined {
  const dir = join(RECORDS, slug);
  if (!existsSync(dir)) return undefined;

  const patient = readIfPresent(dir, "patient.md");
  if (patient === "") return undefined;

  const conditions = parseConditions(readIfPresent(dir, "conditions.md"));
  const medications = parseMedications(readIfPresent(dir, "medications.md"));

  // Every provided chart names its notes `encounter_<date>_<type>.md`
  // (fixtures/provided/SOURCE.md), but the date and type vary per patient —
  // elena_petrova's are pneumonia notes, robert_okafor's are STEMI notes,
  // and so on. Discovering the files by pattern, sorted by the date in the
  // filename, is what lets one loader work for all 11 charts instead of one
  // hardcoded per patient.
  const encounters: Encounter[] = [];
  const encounterFiles = existsSync(dir)
    ? readdirSync(dir).filter((f) => /^encounter_\d{4}-\d{2}-\d{2}_.+\.md$/.test(f)).sort()
    : [];
  for (const file of encounterFiles) {
    const text = readIfPresent(dir, file);
    if (text === "") continue;
    encounters.push(
      Object.freeze({
        date: file.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? "",
        title: text.split("\n")[0]?.replace(/^#\s*/, "") ?? file,
        text,
      }),
    );
  }

  const name = field(patient, "Name") || slug;
  const age = field(patient, "Age");
  const sex = field(patient, "Sex");

  return Object.freeze({
    slug,
    name,
    mrn: field(patient, "MRN"),
    summary: [age, sex].filter((s) => s !== "").join(", "),
    conditions: Object.freeze(conditions),
    medications: Object.freeze(medications),
    encounters: Object.freeze(encounters),
    simulated: true as const,
  });
}

/** The chart for whoever is in this bed, if anyone is. */
export function recordForRoom(room: string): PatientRecord | undefined {
  const slug = ROOM_PATIENTS[room];
  return slug === undefined ? undefined : loadRecord(slug);
}

/**
 * Who is in this bed. The patientId every event from this room must carry.
 *
 * Returns undefined for a room nobody occupies, so a caller has to decide what
 * to do about it rather than silently attributing an event to nobody.
 */
export function patientForRoom(room: string): PatientId | undefined {
  return ROOM_PATIENTS[room];
}

/** Which bed a patient is in. The inverse of ROOM_PATIENTS. */
export function roomForPatient(patientId: PatientId): string | undefined {
  return Object.entries(ROOM_PATIENTS).find(([, slug]) => slug === patientId)?.[0];
}

/**
 * Every provided chart that loads successfully, in ALL_PATIENTS order.
 *
 * A chart that fails to load is dropped rather than thrown, same as
 * `loadRecord` itself — one bad fixture degrades the ward by one card, not
 * the whole boot (test law).
 */
export function loadAllRecords(): PatientRecord[] {
  const records: PatientRecord[] = [];
  for (const slug of ALL_PATIENTS) {
    const record = loadRecord(slug);
    if (record !== undefined) records.push(record);
  }
  return records;
}
