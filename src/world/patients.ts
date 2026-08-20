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

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const RECORDS = "fixtures/provided/text";

/** Which chart belongs to which bed. Hardcoded: see the header. */
export const ROOM_PATIENTS: Readonly<Record<string, string>> = Object.freeze({
  "room-01": "david_kim",
  "room-02": "elena_petrova",
  "room-03": "aisha_rahman",
});

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

  const encounters: Encounter[] = [];
  for (const file of ["encounter_2026-08-15_pneumonia.md", "encounter_2026-08-22_pneumonia_followup.md"]) {
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
