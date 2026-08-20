// History rules. What a thing already on the chart makes worth asking about.
//
// Data, not behaviour. projections/history matches these; this file only says
// what to look for and what the question is.
//
// EVERY ENTRY PRODUCES A QUESTION, NEVER A CONCLUSION.
// CLAUDE.md: "A planned thing nobody discussed becomes a flag with the
// question to ask, never a guess." A prior condition plus a new symptom is not
// a diagnosis and this file must never read like one. `question` is what a
// nurse would say out loud on the ward round; `why` is the chain of facts that
// earned the question, so a clinician can dismiss it in one read if it is
// noise.
//
// The bar for adding an entry: a clinician would be annoyed NOT to be asked.
// Anything less becomes an alert nobody reads.

export interface HistoryFlag {
  readonly id: string;
  /** ICD-10 that must already be on the problem list for this to apply. */
  readonly requiresCondition: string;
  /** Codes from THIS conversation that make it live. Any one is enough. */
  readonly triggeredByCodes: readonly string[];
  /** Or something the patient said, matched as lowercase substring. */
  readonly triggeredByPhrases: readonly string[];
  /** Asked, not asserted. */
  readonly question: string;
  /** The chain, for the explanation line. */
  readonly why: string;
}

export const HISTORY_FLAGS: readonly HistoryFlag[] = Object.freeze([
  Object.freeze({
    id: "af-new-chest-pain-or-breathlessness",
    requiresCondition: "I48.0",
    triggeredByCodes: Object.freeze(["R07.89", "R07.9", "R06.02", "R09.02"]),
    triggeredByPhrases: Object.freeze(["blood clot", "clot"]),
    question:
      "Has a pulmonary embolism been considered and excluded, and is she actually taking her apixaban?",
    why:
      "Atrial fibrillation is on the problem list, and this conversation carries new chest pain " +
      "and breathlessness. She is anticoagulated, which lowers the risk but does not remove it. " +
      "She raised a clot herself, twice, and was told not to diagnose herself.",
  }),
  Object.freeze({
    id: "pneumonia-oxygen-not-improving",
    requiresCondition: "J18.9",
    triggeredByCodes: Object.freeze(["R09.02", "R06.02", "R06.82"]),
    triggeredByPhrases: Object.freeze([]),
    question:
      "Pneumonia is being treated — is the oxygen requirement going the wrong way, and does the plan still fit?",
    why:
      "Community-acquired pneumonia is active and treated on the chart. Breathlessness and low " +
      "oxygen in this conversation are consistent with it, which is exactly why they are easy to " +
      "attribute to it and stop looking.",
  }),
  Object.freeze({
    id: "dementia-symptom-reporting",
    requiresCondition: "F03.90",
    triggeredByCodes: Object.freeze(["R42"]),
    triggeredByPhrases: Object.freeze(["dizzy", "confused"]),
    question:
      "Is a change in her orientation being read as her baseline dementia rather than as new deterioration?",
    why:
      "Mild dementia is on the chart. New confusion scores on TOKS/NEWS; baseline confusion does " +
      "not. Telling them apart needs someone who knows her baseline.",
  }),
]);
