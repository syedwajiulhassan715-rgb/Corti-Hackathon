// Tests for chart parsing. Written before wiring it into the rest of the
// ward, per the test law: no stage lands without an offline fixture that
// exercises it.
//
// What matters here, in order: an unparseable line never becomes a guessed
// number; the real fixture charts parse to plausible events; the same chart
// parses identically every time (chart.ts is pure — no clock, no randomness).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseVitalsMarkdown, parseLabsMarkdown, loadChartEvents } from "./chart.ts";
import type { EventInput } from "../contracts/index.ts";

const ROOM = "room-01";
const PATIENT = "test_patient";

function find(events: readonly EventInput[], observation: string): EventInput[] {
  return events.filter((e) => e.observation === observation);
}

// ------------------------------------------------------- skip, don't guess

test("an undated section is skipped entirely, even with parseable vitals in it", () => {
  const md = `# Vital Signs\n\n## Standing\n- Heart rate: 80 bpm\n- Weight: 70 kg\n`;
  const events = parseVitalsMarkdown(md, PATIENT, ROOM);
  assert.deepEqual(events, []);
});

test("a narrative-only dated section with no labelled number emits nothing", () => {
  const md = `# Vital Signs\n\n## 2026 (current — see note)\n- **Annual mammogram not completed in 2026.**\n`;
  const events = parseVitalsMarkdown(md, PATIENT, ROOM);
  assert.deepEqual(events, []);
});

test("an unlabelled number is never captured as a vital", () => {
  const md = `# Vital Signs\n\n## 2026-01-10 — Visit\n- Room number: 118\n- Bed: 4\n`;
  const events = parseVitalsMarkdown(md, PATIENT, ROOM);
  assert.deepEqual(events, []);
});

test("a lab result that is pending or qualitative is skipped, not coerced to a number", () => {
  const md =
    `# Laboratory Results\n\n## 2026-08-15 — Workup\n` +
    `| Test | Result | Reference Range | Flag |\n` +
    `|------|--------|-----------------|------|\n` +
    `| WBC | 14.8 K/µL | 4.5–11.0 | **HIGH** |\n` +
    `| Blood culture | 2/2 pending; no growth at 24h | — | — |\n` +
    `| Sputum culture | Pending | — | — |\n`;
  const events = parseLabsMarkdown(md, PATIENT, ROOM);

  assert.equal(events.length, 1);
  assert.equal(events[0]!.observation, "wbc");
  assert.equal(events[0]!.value, 14.8);
});

// -------------------------------------------------------- format variety

test("verbose labelled format with a units and 'initial, then' heart rate", () => {
  const md =
    `# Vital Signs\n\n## 2026-07-18 — ED presentation (STEMI)\n` +
    `- Heart rate: 58 bpm (initial), then 92 bpm\n` +
    `- Blood pressure: 150/92 mmHg\n` +
    `- Respiratory rate: 20 /min\n` +
    `- Oxygen saturation: 95% on room air\n` +
    `- Temperature: 36.9 °C\n`;
  const events = parseVitalsMarkdown(md, PATIENT, ROOM);

  // The settled reading is taken, not the transient initial one.
  assert.equal(find(events, "heart_rate")[0]!.value, 92);
  assert.equal(find(events, "systolic_bp")[0]!.value, 150);
  assert.equal(find(events, "diastolic_bp")[0]!.value, 92);
  assert.equal(find(events, "respiratory_rate")[0]!.value, 20);
  assert.equal(find(events, "spo2")[0]!.value, 95);
  assert.equal(find(events, "temperature")[0]!.value, 36.9);
});

test("compact comma-separated format with no units", () => {
  const md = `# Vital Signs\n\n## 2024-05 — Post-treatment baseline\n- HR 72, BP 118/76 mmHg, Weight 68.0 kg (150 lb), BMI 26.1\n`;
  const events = parseVitalsMarkdown(md, PATIENT, ROOM);

  assert.equal(find(events, "heart_rate")[0]!.value, 72);
  assert.equal(find(events, "systolic_bp")[0]!.value, 118);
  assert.equal(find(events, "diastolic_bp")[0]!.value, 76);
  assert.equal(find(events, "weight")[0]!.value, 68.0);
});

test("an oxygen saturation arrow takes the post-intervention value", () => {
  const md = `# Vital Signs\n\n## 2026-08-15 — Presentation\n- Oxygen saturation: 93% on room air → 96% on 2L NC\n`;
  const events = parseVitalsMarkdown(md, PATIENT, ROOM);
  assert.equal(find(events, "spo2")[0]!.value, 96);
});

test("an orthostatic sitting/standing pair takes the resting reading", () => {
  const md = `# Vital Signs\n\n## 2026-08-18 — Follow-up\n- Heart rate: 70 bpm, BP 122/72 (sitting), 112/66 (standing)\n`;
  const events = parseVitalsMarkdown(md, PATIENT, ROOM);
  assert.equal(find(events, "systolic_bp")[0]!.value, 122);
  assert.equal(find(events, "diastolic_bp")[0]!.value, 72);
});

test("a month-only heading still produces a timestamp, mid-month", () => {
  const md = `# Vital Signs\n\n## 2024-05 — Baseline\n- HR 72, BP 118/76 mmHg\n`;
  const events = parseVitalsMarkdown(md, PATIENT, ROOM);
  const ts = find(events, "heart_rate")[0]!.ts;
  const d = new Date(ts);
  assert.equal(d.getUTCFullYear(), 2024);
  assert.equal(d.getUTCMonth(), 4); // May, zero-indexed
  assert.equal(d.getUTCDate(), 15);
});

// -------------------------------------------------- event shape and law

test("every emitted event carries the CONTRACTS-mandated shape for a feed source", () => {
  const md = `# Vital Signs\n\n## 2026-08-15 — Visit\n- Heart rate: 80 bpm\n`;
  const [event] = parseVitalsMarkdown(md, "elena_petrova", "room-02");
  assert.ok(event);
  assert.equal(event.patientId, "elena_petrova");
  assert.equal(event.room, "room-02");
  assert.equal(event.source, "vital");
  assert.equal(event.speaker, "unknown");
  assert.equal(event.quote, "");
  assert.equal(event.code, null);
});

test("lab events carry source 'lab'", () => {
  const md =
    `# Laboratory Results\n\n## 2026-08-15 — Workup\n` +
    `| Test | Result | Reference Range | Flag |\n|---|---|---|---|\n| WBC | 14.8 K/µL | 4.5–11.0 | HIGH |\n`;
  const [event] = parseLabsMarkdown(md, "elena_petrova", "room-02");
  assert.ok(event);
  assert.equal(event.source, "lab");
});

test("parsing is deterministic: the same markdown parses identically twice", () => {
  const md = readFileSync("fixtures/provided/text/robert_okafor/vitals.md", "utf8");
  const first = parseVitalsMarkdown(md, "robert_okafor", "room-01");
  const second = parseVitalsMarkdown(md, "robert_okafor", "room-01");
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

// -------------------------------------------------------- real fixtures

const ALL_SLUGS = [
  "aisha_rahman",
  "david_kim",
  "elena_petrova",
  "harold_mitchell",
  "jamal_wright",
  "jane_smith",
  "lily_chen",
  "maria_gonzalez",
  "robert_okafor",
  "sarah_nguyen",
  "tom_baker",
];

test("every provided chart parses to at least one plausible vital event", () => {
  for (const slug of ALL_SLUGS) {
    const events = loadChartEvents(slug, "room-01");
    assert.ok(events.length > 0, `${slug} produced no events at all`);
    for (const e of events) {
      assert.equal(e.patientId, slug);
      assert.ok(Number.isFinite(e.value), `${slug} ${e.observation} is not a finite number`);
      assert.ok(e.ts > 0, `${slug} ${e.observation} has a non-positive timestamp`);
    }
  }
});

test("elena_petrova's charted vitals include the pneumonia presentation numbers", () => {
  const events = loadChartEvents("elena_petrova", "room-02");
  const hr = find(events, "heart_rate").map((e) => e.value);
  const spo2 = find(events, "spo2").map((e) => e.value);
  assert.ok(hr.includes(102), "expected the 102 bpm presentation reading");
  assert.ok(spo2.includes(96), "expected the post-2L-NC 96% reading, not the room-air 93%");
});

test("a missing patient directory returns no events, not a throw", () => {
  assert.deepEqual(loadChartEvents("nobody_here", "room-01"), []);
});
