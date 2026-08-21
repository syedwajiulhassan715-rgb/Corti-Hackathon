# UI/UX Principles Quick Reference

Full knowledge base: `~/.claude/skills/ui-design-principles/SKILL.md`

## Color rules (apply every time)
- **Darker state** → increase S + decrease B + shift hue toward Red/Green/Blue (0°/120°/240°)
- **Lighter state** → decrease S + increase B + shift hue toward Yellow/Cyan/Magenta (60°/180°/300°)
- **Neutral surfaces** → same hue as brand, chroma ~0.005 (never pure gray)
- **60-30-10** → 60% dominant, 30% secondary, 10% accent
- **WCAG AA** → 4.5:1 body, 3:1 headlines

## Shadow rules
- Light background → `0 1–2px 2–4px rgba(0,0,0,0.20–0.30)`
- Dark background → `0 2px 4px rgba(0,0,0,0.40–0.50)`
- Raised elements → lighter on top, darker on bottom edge
- Inset elements → darker on top, lighter on bottom edge

## Typography rules
- Max 2 typefaces
- Body ≥15px, labels ≥12px
- H1 ≈ 2.5× body, H2 ≈ 1.75×, H3 ≈ 1.25×
- Line height: body 1.4–1.6×, headings 1.1–1.25×
- Rounded font → rounded border-radius; geometric/squared → 0px radius
- Uppercase text → always add letter-spacing

## Spacing rules
- Double whitespace (padding ≥ font-size value)
- Spacing rhythm: 4 / 8 / 16 / 24 / 32 / 48px
- Group spacing > element spacing > line spacing
- Menu item padding ≥ text height; list group gap ≥25px

## Hierarchy rules
- One MIT (most important thing) per screen
- Page title only element styled all-out up-pop
- Up-pop = large + bold + high-contrast + uppercase
- Down-pop = small + muted + light weight
- Squint test: blur the screen, the MIT must be the only thing visible

## Control rules
- Controls must be adjacent to what they affect (Law of Locality)
- ABD — Anything But Dropdowns: use segmented, toggle, stepper, typeahead
- Dropdowns OK only when options > 7 or rarely changed defaults

## Text on images
- Never raw text on a busy image
- Overlay: ~35% opacity black
- Floor fade: 0% opacity → ~20% opacity gradient
- Text-in-box: semi-opaque black behind white text
- Blur: blur area behind text

## Alignment
- Left-aligned text has a strong left edge, weak right — trace actual alignment lines
- Centering is valid alignment when used deliberately
- Hanging alignment: punctuation and icons hang outside the main text grid

## Animation
- Hover: 100–250ms | Modals: 200–300ms | Threshold: 500ms+
- ease-out for entering, ease-in for exiting
- Only animate `transform` and `opacity`

## Key reference numbers
| Item | Value |
|------|-------|
| iOS tap target | 44×44pt |
| Android tap target | 48×48dp |
| Most common iPhone width | 375pt |
| Standard button height | 40px |
| Standard button H padding | 20px |
| Body text line length | 50–75 chars |
| Center-align max lines | 3 |
| Shadow opacity on light bg | 20–30% |
| Shadow opacity on dark bg | 40–50% |
| Overlay opacity | ~35% |
| Floor fade max opacity | ~20% |
