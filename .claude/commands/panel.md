---
description: Run the clinical, engineer and strategist reviewers on a decision and return one recommendation
argument-hint: <the decision to review>
---

Review this decision: $ARGUMENTS

Run all three reviewers on it — the `clinical`, `engineer` and `strategist` agents —
launched in parallel in a single message. Give each the decision verbatim plus whatever
context from docs/SPEC.md, docs/CONTRACTS.md and docs/DECISIONS.md it needs to judge.

Then output exactly this, and nothing else:

## Clinical
One short verdict. Two sentences maximum.

## Engineer
One short verdict. Two sentences maximum.

## Strategist
One short verdict with its MUST / NICE / KILL label. Two sentences maximum.

## Recommendation
One recommendation. State the trade-off you are accepting and what it costs.

Rules: no hedging, no consensus theatre, no summarising the three into agreement they do
not have. If they disagree, say so in one line — who is against what, and why — before
the recommendation, and let the recommendation pick a side. Never invent a fourth
opinion. If a reviewer says a thing is unsafe or non-deterministic, that constraint
survives into the recommendation or you explain why it was overridden.
