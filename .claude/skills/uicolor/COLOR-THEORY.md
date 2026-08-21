# Color Theory — Master Reference for Web UI

---

## The HSB System

Every color decision uses HSB (Hue, Saturation, Brightness). Never adjust hex values by eyeballing — convert to HSB, apply the rule, convert back.

```
H — Hue         0–360°   what color it is
S — Saturation  0–100%   how vivid or washed-out
B — Brightness  0–100%   how bright or dark
```

**The two rules everything else derives from:**

```
Darker version:   S + 10  ·  B − 15  ·  hue toward 0°/120°/240° (primary)
Lighter version:  S − 20  ·  B + 20  ·  hue toward 60°/180°/300° (secondary)
```

**Why hue shifts with brightness:** as colors get darker, they appear to shift hue in the wrong direction unless you compensate. Pushing the hue toward the nearest primary (red 0°, green 120°, blue 240°) keeps the darker version feeling like the same color family.

### Converting hex to HSB (mental model)

You don't need a calculator every time. Train your eye:

| If hex looks... | HSB diagnosis |
|-----------------|--------------|
| Washed out, pastel | S is low (< 30%) |
| Garish, neon | S is too high (> 80%) for a UI |
| Too dark | B is low (< 30%) |
| Too light | B is high (> 90%) |
| Wrong temperature | H is off from intended direction |

---

## 60-30-10 Applied to Web UI

The dominant/secondary/accent ratio that creates visual harmony.

```
60% — Dominant (background surfaces)
       Neutral — white, off-white, or near-neutral
       The color the eye rests on

30% — Secondary (structural elements)
       Sidebar, card surfaces, elevated panels, borders
       Slightly deeper than dominant — creates depth

10% — Accent (brand / primary)
       Buttons, links, active states, badges, highlights
       The color that pulls attention
```

**Measuring coverage:** use the palette JSON from `_uicolor_extract.mjs`. The coverage percentages are the ground truth.

**Common violations:**

| Violation | Coverage example | Fix |
|-----------|-----------------|-----|
| Brand dilution | Primary at 28% | Remove from decorative uses, keep only interactive |
| Surface collapse | Only one background color | Add a 5–8% darker shade for cards/panels |
| Accent starvation | Primary < 3% | Underused — consider adding it to more interactive elements |
| Noise colors | 8 colors each at 2–4% | Consolidate — most should map to 1 of 3 main roles |

---

## Color Temperature

Temperature is the most-felt, least-discussed dimension of UI color.

```
Warm hues: Red (0°) → Orange (30°) → Yellow (60°)
Cool hues: Cyan (180°) → Blue (220°) → Violet (270°)
Neutral:   Pure gray (any B, S=0%) — takes its temperature from surroundings
```

**How temperature works in practice:**

- Warm surfaces feel closer, intimate, energetic
- Cool surfaces feel further, calm, precise, technical
- Mixing warm and cool without intention = temperature clash = "something feels off"

**The hue whisper rule for neutrals:**
Pure gray (S=0%) looks cold next to warm brands and warm next to cool brands — never neutral. Always add a hue whisper:

```
Warm neutral: H 20–40°, S 4–8%, B whatever
  → #f9f6f2 instead of #f9f9f9

Cool neutral: H 210–230°, S 4–8%, B whatever
  → #f4f6f9 instead of #f9f9f9

The hue whisper must match the brand primary's temperature direction.
```

**Temperature consistency rule:** every neutral on the product must have the same hue direction. Never mix warm and cool grays. One temperature per product.

---

## Shadow Construction

Shadows have color. Pure black shadows look painted on — they add darkness without depth.

**The formula:**
1. Take the surface color
2. Convert to HSB
3. Increase S by 30–40%
4. Decrease B by 50–70%
5. Use this at 10–20% opacity

```
Surface: white (#ffffff) → HSB(0°, 0%, 100%)
Shadow:  H 220°, S 30%, B 30% → #344055 at 12% opacity
Result:  box-shadow: 0 4px 6px rgba(52, 64, 85, 0.12)

Surface: blue-50 (#eff6ff) → HSB(214°, 6%, 100%)
Shadow:  H 214°, S 40%, B 25% → #243d5f at 15% opacity
Result:  box-shadow: 0 4px 6px rgba(36, 61, 95, 0.15)

Surface: dark (#1e293b) → HSB(215°, 50%, 23%)
Shadow:  H 215°, S 80%, B 8% → #061220 at 40% opacity
Result:  box-shadow: 0 4px 6px rgba(6, 18, 32, 0.4)
```

**Shadow opacity by background luminosity:**
- Light bg (B > 80%): 8–15% opacity
- Mid bg (B 40–80%): 20–30% opacity
- Dark bg (B < 40%): 35–50% opacity

**Shadow elevation scale:**
```css
/* Subtle — cards, inputs */
box-shadow: 0 1px 3px rgba(var(--shadow-rgb) / 0.08), 0 1px 2px rgba(var(--shadow-rgb) / 0.06);

/* Medium — dropdowns, popovers */
box-shadow: 0 4px 6px rgba(var(--shadow-rgb) / 0.1), 0 2px 4px rgba(var(--shadow-rgb) / 0.06);

/* High — modals, drawers */
box-shadow: 0 10px 15px rgba(var(--shadow-rgb) / 0.1), 0 4px 6px rgba(var(--shadow-rgb) / 0.05);

/* Dramatic — landing pages, hero elements */
box-shadow: 0 25px 50px rgba(var(--shadow-rgb) / 0.15);
```

---

## Hover / Active / Focus State Construction

Every interactive element needs three states beyond base. All derived by HSB rule, never guessed.

```
State       S delta    B delta    Hue shift         Opacity
────────────────────────────────────────────────────────────
Hover       +10        −15        toward primary     1.0
Active      +15        −25        toward primary     1.0
Disabled    −30        +10        none               0.5
Focus ring  0          0          none (brand color)  1.0 (outline)
```

**Example — blue primary (#3b82f6 = HSB 213°, 75%, 96%):**
```
Base:     HSB(213°, 75%,  96%) → #3b82f6
Hover:    HSB(210°, 85%,  81%) → #2563eb
Active:   HSB(210°, 90%,  71%) → #1d4ed8
Disabled: HSB(213°, 45%, 100%) → #8db4f8 at 50% opacity
```

**Focus ring:**
- Always the brand primary color
- `outline: 2px solid var(--color-primary)`
- `outline-offset: 2px`
- Never the same visual weight as a border — it must be more prominent

---

## Neutral Color Scale Construction

A neutral scale is not shades of gray — it is hue-tinted steps.

**Building a 10-step cool neutral scale (for a blue-primary product):**
```
Step  HSB                  Hex        Use
50    H215° S5%  B99%     #f7f8fb    Page background
100   H215° S8%  B97%     #f0f3f8    Subtle background, zebra stripe
200   H215° S10% B93%     #e4e9f2    Border color, dividers
300   H215° S12% B85%     #c5cede    Muted border, input border
400   H215° S14% B70%     #9aaabf    Disabled text, placeholder
500   H215° S16% B55%     #738297    Secondary text
600   H215° S18% B42%     #566070    Subdued text
700   H215° S20% B33%     #42505e    Label text
800   H215° S25% B22%     #2c3749    Primary text (soft)
900   H215° S30% B14%     #1a2232    Primary text (strong)
```

**Rules:**
- Every step has the same hue (215°) — temperature is consistent
- Saturation increases slightly as it gets darker (more chroma in shadow)
- Use ≤4 steps as text colors — more creates chaos, not hierarchy
- Step 500 is your secondary text, step 900 is your primary text

---

## Color Hierarchy Principles

Color is an attention signal. Every color decision is a claim: "look here."

**Hierarchy rules:**
1. Only one color at full saturation on any screen — the primary action
2. Every other color competes by being less saturated, lighter, or smaller
3. Background colors must be the least saturated on the screen
4. Text is second-least saturated (muted, readable, not competing with CTAs)
5. Borders are the least prominent — 1px, subtle color, nearly invisible

**Simultaneous contrast** — a color looks different next to different colors:
- Warm color on cool background → appears even warmer (use this for CTAs on neutral backgrounds)
- Same color on similar background → disappears (never put a blue button on a blue panel)
- Light gray on white → nearly invisible (use 200-step gray minimum for visible borders on white)

**Color weight:**
- High saturation + high brightness = visual weight (demands attention)
- Low saturation + high brightness = light (recedes)
- Low saturation + low brightness = heavy but quiet (good for text)
- High saturation + low brightness = deep and rich (accents on dark surfaces)

---

## Semantic Color System

These hues are universally understood. Never repurpose them.

| Semantic | Hue range | Meaning |
|----------|-----------|---------|
| Error / Destructive | 0–10° (red) | Something failed, dangerous action |
| Warning | 35–45° (amber) | Needs attention, caution |
| Success | 120–145° (green) | Completed, positive, approved |
| Info | 200–230° (blue) | Neutral information, hints |

**Semantic color construction (light mode):**
```
Error:
  Background: HSB(0°,   15%,  98%)  → #faf0f0  (error surface)
  Border:     HSB(0°,   40%,  88%)  → #e08080  (error border)
  Text:       HSB(0°,   70%,  55%)  → #8c1a1a  (error text — readable on error bg)
  Icon/Badge: HSB(0°,   85%,  70%)  → #b22222  (error emphasis)

Success:
  Background: HSB(130°, 15%,  97%)  → #f0faf2
  Border:     HSB(130°, 35%,  80%)  → #7bc98a
  Text:       HSB(130°, 70%,  35%)  → #1a6630
  Icon/Badge: HSB(130°, 80%,  50%)  → #198a37
```

**Rules:**
- Never use green for brand elements if it conflicts with success green
- Never use red for decorative elements (people read them as errors)
- Semantic backgrounds should be near-white with a hue whisper — not vivid fills
- Semantic text must have 4.5:1 contrast on semantic background

---

## Color Blindness Patterns

~8% of men, ~0.5% of women have red-green color blindness (deuteranopia/protanopia).

**Never rely on red/green distinction alone:**
```
Wrong:  ● Red dot = error, ● Green dot = success
Right:  ✗ Red text label + icon, ✓ Green text label + icon
```

**Safe combinations (distinguishable in all forms of color blindness):**
- Blue + Orange (most distinguishable)
- Blue + Red
- Blue + Yellow
- Purple + Yellow

**Avoid distinguishing by hue alone:**
- Red vs Green → invisible to ~8% of users
- Red vs Black → hard for many
- Green vs Brown → hard for deuteranopes

**Test:** convert any color-coded UI to grayscale. If you can still tell the difference, it's accessible.

---

## Dark Mode Color Adaptation

Dark mode is not "invert everything." It requires specific adjustments:

```
Light → Dark adaptation rules:

Surfaces:   light-mode background → reverse the luminosity scale
            white (#fff) → near-black (#0f172a)
            gray-50 → gray-900
            gray-100 → gray-800 (elevated surface)

Primary:    lighter shade at same hue (lighter colors pop on dark)
            blue-600 → blue-400 (not the same blue — it looks darker on dark bg)

Text:       dark text → near-white (not pure white — use 90–95% brightness)
            #111827 → #f1f5f9

Borders:    light border (#e2e8f0) → dark border (#334155)
            Borders must be LIGHTER than the surface on dark mode

Shadows:    increase opacity (shadows are harder to see on dark)
            light-mode: 0.1 → dark-mode: 0.4
            color: same hue-tinted shadow, but more opaque
```

**The shadow rule for dark mode:**
On dark surfaces, shadows create depth by being even darker — but they must still be hue-tinted. A pure black shadow on a dark surface is invisible. Use a slightly cooler/more saturated dark hue.

---

## Quick Diagnosis Table

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| UI feels cold and corporate | Pure gray neutrals, cool temperature | Add warm hue whisper (H30°, S5%) to all neutrals |
| Brand feels everywhere, nowhere special | Primary color >15% coverage | Remove from decorative elements, keep only interactive |
| Shadows look flat/painted | Pure black rgba(0,0,0) | Reconstruct with hue-tinted formula |
| Colors feel muddy | Mixing warm and cool hues | Standardize to one temperature direction |
| Interface feels garish/loud | Saturation too high globally | Reduce S by 15–20% across all accent uses |
| Cards don't feel elevated | No shadow, or identical bg as page | Add subtle shadow or step down in bg shade |
| Hover states invisible | S/B delta too small | Hover needs minimum S+10 B-15 |
| Text feels hard to read | Text gray too light or wrong hue | Step text to 900 on light, and whisper same hue |
| Dark mode feels washed out | Copied light-mode grays | Rebuild surface scale from dark end up |
| UI lacks energy | Accent color ≤3% coverage | Add brand color to more interactive elements |
| Semantic colors misread | Green/red used decoratively | Reserve exclusively for success/error states |
