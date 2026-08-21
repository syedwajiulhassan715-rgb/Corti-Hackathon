# Attributions

## AI services

Corti — the only AI API used. Ambient transcription, clinical facts, medical
coding, document generation, and workflow rationale generation.

## Datasets

Corti Hackathon provided fixtures (2026-08-20): 24 audio clips and 11
synthetic patient records. Supplied by the organizers for hackathon use;
redistribution terms are unconfirmed. See `fixtures/provided/SOURCE.md`.

All projected vitals, device readings, staff availability, workloads, and
appointment slots are deterministic synthetic fixtures created for ECHO.

## Open source

Next.js (MIT), React (MIT), TypeScript (Apache-2.0), Tailwind CSS (MIT),
Lucide React (ISC), tsx (MIT), dotenv (BSD-2-Clause), and Node.js (MIT).

## Claude Code skills

Vendored into `.claude/skills/` as reference guidance for design work. They
shape how the UI is built; none of them runs on the clinical path.

frontend-design — Anthropic (`anthropics/skills`, MIT). Aesthetic direction.

a11y, animate, copy, design-grill, tokens, uicolor, uiux — dawitlabs/ui-skills
(see `.claude/skills/ui-skills-LICENSE`). Accessibility, motion, UI copy,
design interrogation, token enforcement, colour theory and screen redesign.

## Product inspiration

Haven by ScrappyDevs — command-center and hospital-operations product
inspiration only. No Haven code, architecture, or non-Corti AI integration was
copied.
