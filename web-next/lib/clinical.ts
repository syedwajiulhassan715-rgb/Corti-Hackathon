// How clinical observations are named and rendered to a human.
//
// The engine keys observations by their event name -- `diastolic_bp`, `spo2`.
// That is the right key for a log and the wrong string for a ward board: a
// nurse reads "Diastolic BP", never a snake_cased field. Before this existed
// the raw key leaked into the floor plan, the queue card and the why-now
// panel, directly under a heading that had spelled it correctly, which reads
// as an unfinished product rather than a considered one.
//
// One map, so a new observation is named once and is named everywhere.

export interface Vocabulary {
  /** What a clinician calls it. Sentence case; it appears mid-sentence. */
  readonly label: string;
  /** Compact form for a bed tile, where horizontal space is the constraint. */
  readonly short: string;
  /** Units, rendered smaller and dimmer beside the value. Never inside it. */
  readonly unit: string;
}

const VOCABULARY: Readonly<Record<string, Vocabulary>> = {
  systolic_bp: { label: "Systolic BP", short: "SYS", unit: "mmHg" },
  diastolic_bp: { label: "Diastolic BP", short: "DIA", unit: "mmHg" },
  heart_rate: { label: "Heart rate", short: "HR", unit: "bpm" },
  spo2: { label: "Oxygen saturation", short: "SpO\u2082", unit: "%" },
  resp_rate: { label: "Respiratory rate", short: "RR", unit: "/min" },
  temp: { label: "Temperature", short: "TEMP", unit: "\u00b0C" },
  news2: { label: "NEWS2", short: "NEWS2", unit: "" },
};

/**
 * Unknown observations degrade to a readable form rather than to a blank or a
 * throw: `some_new_reading` becomes "Some new reading". A stage ECHO has not
 * been taught about yet still renders, which is the same rule the rest of the
 * system follows -- a missing card, never a crash.
 */
export function vocabularyFor(observation: string): Vocabulary {
  const known = VOCABULARY[observation];
  if (known !== undefined) return known;
  const words = observation.replace(/_/g, " ").trim();
  const label = words.charAt(0).toUpperCase() + words.slice(1);
  return { label, short: observation.slice(0, 4).toUpperCase(), unit: "" };
}

/** Humanise any engine text that embeds raw observation keys. */
export function humanise(text: string): string {
  return text.replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g, (key) => vocabularyFor(key).label);
}

/** A signed delta, always with its sign, for a value read at a glance. */
export function signed(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}
