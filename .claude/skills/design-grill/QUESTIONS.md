# Question Tree — Probing Guide

Full reference for every question in the interview. Each entry has: the surface question, what vague answers look like, what good answers look like, and follow-up probes.

---

## Q1 — Product Category

**Surface:** "What kind of product is this?"

**Vague:** "An app." "A website." "A platform."

**Good:** "A B2B SaaS dashboard for finance teams, primarily used on desktop."

**Probes:**
- "Is the primary surface a dashboard (data at a glance) or a workflow (steps to complete)?"
- "Do users come in and out quickly, or do they live in this product for hours?"
- "Is this primarily consumed (reading data) or primarily produced (creating things)?"

**What the answer unlocks:**
- Dashboard → density tolerance is high, information hierarchy is key
- Workflow → step clarity is key, progressive disclosure matters
- Consumed → display typography, legibility first
- Produced → keyboard shortcuts, dense controls, power-user affordances

---

## Q2 — Target User

**Surface:** "Who exactly is using this? Describe one specific person."

**Vague:** "Developers." "Businesses." "Teams." "Everyone."

**Good:** "A mid-level product designer at a 50-person startup who uses Figma all day and is tired of stitching together design systems from scratch."

**Probes:**
- "What's their technical comfort level? Would they read a changelog, or does every feature need hand-holding?"
- "What's their job stress level when they use this product? Are they in a hurry, or relaxed?"
- "Do they use it alone or with a team? Does their work get seen by others?"
- "What's the main thing they want to get done and get out?"

**Banned answers:** "non-technical users" (what does that mean?), "enterprise customers" (department? company size? role?), "anyone who needs X" (no one is 'anyone').

---

## Q3 — Brand Personality

**Surface:** "5 adjectives — how does the brand carry itself?"

**Banned words to reject immediately:**
clean, modern, minimal, professional, simple, sleek, intuitive, user-friendly, innovative, seamless, powerful, robust

**Good adjective pairs and what they mean:**

| Pair | Visual meaning |
|------|---------------|
| Expert + approachable | Dense information but friendly tone, warm neutrals |
| Confident + direct | Bold type, strong hierarchy, no decorative filler |
| Calm + focused | Max whitespace, muted palette, no animation noise |
| Playful + credible | Geometric shapes or illustration, serious typography underneath |
| Precise + honest | Monospace touches, grid-heavy, no visual tricks |
| Authoritative + warm | Serif headings, warm neutrals, generous spacing |

**Probes:**
- "If this product were a magazine, what would it be?" (The Economist vs Wired vs FastCo vs a design agency portfolio)
- "If it were a person at a conference, would they be in a blazer, a t-shirt, or a suit?"
- "Which word would your most loyal user use to describe using this product to a friend?"

---

## Q4 — Emotional Goal

**Surface:** "How should the user feel when they use this?"

**Common answers and their design implications:**

| Feeling | Design response |
|---------|----------------|
| Confident | Zero ambiguity. Strong CTAs. Clear empty states. No mystery. |
| Productive | High density. Keyboard shortcuts. Minimal decoration. |
| Delighted | Micro-animations. Personality in copy. Surprising details. |
| Calm | Generous whitespace. Muted palette. No urgent visual noise. |
| Powerful | Large type. Bold color. Dramatic interactions. |
| Trusted | Conservative palette. Polished details. Social proof. |
| Creative | Generous canvas. Minimal chrome. Inspirational typography. |
| In control | Visible state everywhere. Explicit actions. Nothing implicit. |

**Probes:**
- "What would the OPPOSITE feeling be — what would make a user feel terrible using a competitor?"
- "Is there a moment in the product where the feeling should peak? (Completing a task, seeing results, sharing)"

---

## Q5 — Visual References

**Surface:** "3 products you look at and think 'I want ours to feel like that.'"

**How to handle each reference:**
1. Name the specific element (typography? color? whitespace? animation? illustration?)
2. Is it the whole aesthetic or one aspect?
3. What's the user's relationship to this reference? (Aspires to it? Uses it daily?)

**Good reference extraction:**
- "I like Linear" → "What specifically? Their heading scale? The sidebar density? The dark mode? The hover animations?"
- "I like Apple's site" → "The marketing pages (photography, whitespace, huge type) or the product pages (dense specs, clean tables)?"
- "I like Stripe" → "The docs (mono, dense, technical) or the marketing site (illustrations, gradients, animation)?"

**What cross-industry references reveal:**
- "I like how Notion looks" → wants lots of whitespace, system font feel, content-first
- "I like how Vercel looks" → wants dark/light toggle, minimal, technical precision
- "I like how Superhuman looks" → wants fast interactions, keyboard-first, premium
- "I like how Airbnb looks" → wants warm photography, rounded, consumer-friendly

**Probe:** "Is there anything in your references you specifically don't want? Sometimes we love something but it's wrong for our product."

---

### Reference DNA Library

When a user names a product, translate it immediately into specific design decisions. Never leave a reference vague.

| Reference | What it means concretely |
|-----------|--------------------------|
| **Linear** | Dark sidebar, Inter at tight leading, muted blue accent, 4px radius, no shadows (flat), dense, keyboard-first, minimal animation |
| **Vercel** | Dark/light toggle, Geist font, high contrast, sharp 4px radius, flat UI, technical precision, subtle hover states |
| **Notion** | System font stack, extreme whitespace, icon-heavy sidebar, no color (almost monochrome), content-first canvas |
| **Stripe** | Split-tone (dark left, light right), heavy whitespace, custom sans (Stripe's own), gradient accents on marketing, precise docs |
| **Figma** | Dense sidebar, icon-forward, color only in the canvas, neutral chrome, Inter, flat with subtle borders |
| **GitHub** | Compact, information-dense, border-heavy, neutral grays, syntax highlighting as the main color story, Mona Sans |
| **Tailwind UI / shadcn** | Zinc/slate neutrals, Inter, 6–8px radius, light borders, subtle shadows, no decorative elements |
| **Raycast** | Dark, opaque surfaces, Inter, minimal borders, speed-first interaction, very subtle gradients |
| **Superhuman** | Dark mode default, serif headline + sans body, high contrast, minimal chrome, keyboard-driven |
| **Loom** | Purple primary, rounded (12px+), friendly, elevated cards, expressive illustrations |
| **Slack** | Aubergine sidebar, white main, rounded (8px), icon-heavy, mid-density, warm neutrals |
| **Airbnb** | Coral/pink primary, rounded (12px+), generous whitespace, photography-first, humanist sans |
| **Apple (marketing)** | Giant type (80–120px), extreme whitespace, SF Pro, product photography on white, subtle animations |
| **Apple (product pages)** | Dense specs, tight grid, system font, dark/light toggle, minimal decoration |
| **Framer** | Dark first, bold typography (clash display), gradient accents, animated hero, expressive |
| **Anthropic / Claude** | Warm neutrals (sand/cream), serif touches, calm, rounded, generous whitespace, trust-coded |
| **Resend / Mintlify** | Clean docs aesthetic, Inter, off-white background, minimal nav, code-heavy |
| **Planetscale** | Dark, high contrast, grid-heavy layout, Inter, technical authority |
| **Craft** | Extremely polished iOS-native aesthetic, shadows, blur, rounded, delightful micro-interactions |
| **Things 3** | macOS native, deep shadows, rounded, generous padding, warm grays, every detail matters |
| **Arc Browser** | Sidebar-first, custom colors, playful but serious, expressive gradients, rounded corners |
| **Webflow** | Dark marketing, blue accent, editorial type scale, animation-heavy landing |
| **Retool** | Dense tables, functional, enterprise-feeling, blue primary, minimal decoration |
| **Airtable** | Colorful, rounded, consumer-friendly, icon-heavy, medium density, playful |

**When a reference isn't on this list:** ask "What specifically about it?" and derive the DNA yourself from the user's description.

---

## Q6 — Competitors

**Surface:** "3 main competitors and what to avoid."

**What you're looking for:**
- Visual clichés in the category (every SaaS uses dark blue cards → differentiate)
- Trust associations (competitor X has a bad reputation → avoid their color scheme)
- Overcrowded patterns (everyone has a sidebar → what if there wasn't one?)

**Probes:**
- "Do you want to look similar to competitors (signaling you belong) or different (signaling you're new)?"
- "Is there a color in your category that everyone uses? (Finance: dark navy. Dev tools: dark sidebar. Health: green.)"
- "If a user switches from [competitor] to you, what visual change should immediately signal 'this is better'?"

---

## Q7 — Color Direction

**7a: Light or dark default?**

Light default:
- Easier to read long-form content
- Works everywhere (no dark-mode adoption required)
- More familiar for most users

Dark default:
- Signals technical, developer-forward
- Better for data visualization
- Required if users work in dark environments (code editors, monitoring tools)

**7b: Warm, cool, or neutral?**

| Temperature | Hue range | Typical use |
|------------|-----------|-------------|
| Cool | Blues (200–260°), Teals (160–200°) | Tech, finance, health, SaaS |
| Neutral | Grays, near-neutral | Works everywhere, relies on accent color for personality |
| Warm | Ambers (30–60°), Earth (15–40°), Rose (340–360°) | Consumer, food, lifestyle, creative |

**7c: Single accent or full palette?**
- Single accent = sophisticated, focused. The brand is the accent color.
- Full palette = expressive, consumer-facing. Risk of visual noise.

**7d: Saturated or muted?**

| Level | What it signals |
|-------|----------------|
| Electric/vivid (HSB S>80%) | Energy, startup, consumer |
| Balanced (HSB S 50–70%) | Professional, confident |
| Muted/dusty (HSB S 20–45%) | Sophisticated, mature, editorial |
| Near-neutral (HSB S<20%) | Minimalist, lets content lead |

**Synthesising to a hex:**
After all four answers, derive a starting primary:
- Cool + muted + light mode → blue-600 range (#2563eb territory)
- Warm + saturated + dark mode → amber-400 range (#fbbf24 territory)
- Neutral + muted → gray-900 as primary text, brand accent as the one touch of color

---

## Q8 — Typography

**8a: Typeface category**

| Category | Examples | When to use |
|----------|---------|-------------|
| Geometric sans | Inter, Geist, DM Sans, Plus Jakarta | Default for tech products. Neutral, modern. |
| Humanist sans | Nunito, Figtree, Outfit | Friendlier feel. Good for consumer apps. |
| Transitional sans | IBM Plex Sans, Source Sans | Technical precision. Developer tools. |
| Serif | Playfair, Lora, Freight, Canela | Editorial, premium, publishing. Unusual in SaaS. |
| Mono | JetBrains Mono, Berkeley Mono | Developer tools, technical purity, code-first products. |

**8b: One or two fonts?**

One font wins with weight variation:
- Inter 800 heading / Inter 400 body — coherent, modern, zero friction

Two fonts work when:
- The display font has strong personality (editorial serif for headings)
- The body font is highly readable (not the same as the display)
- They share a visual DNA (both geometric, or both humanist)

**Pairing rules (from ui-design-principles):**
- Personality + neutrality: expressive display + neutral body
- Contrast in category: serif heading + sans body
- Never two of the same category at similar weights — they fight

**8c: Density**

| Level | Typical values |
|-------|---------------|
| Spacious | body 16–18px, line-height 1.7, generous paragraph spacing |
| Balanced | body 15–16px, line-height 1.5–1.6 |
| Dense | body 13–14px, line-height 1.4, compact spacing |

---

## Q9 — Component Style

**Corner radius mapping:**

| Value | Visual register |
|-------|----------------|
| 0px | Banking software, government tools, maximum precision |
| 2–4px | Developer tools, technical products, subtle softening |
| 6–8px | Standard SaaS — the professional default |
| 10–16px | Consumer-friendly, modern, approachable |
| 24px+ / full | Consumer app, playful, pill buttons |

**Elevation mapping:**

| Level | When |
|-------|------|
| Flat (borders only) | Modern minimalism, 2022+ aesthetic |
| Subtle shadows | Professional default, safe choice |
| Elevated cards | Traditional SaaS, data dashboards |
| Dramatic shadows | Marketing pages, landing pages |

**Density + border combination reveals register:**

| Style | Register |
|-------|---------|
| Dense + heavy borders | Enterprise data tool, Bloomberg terminal |
| Dense + light borders | Developer tool, Linear, VS Code |
| Balanced + subtle shadow | Standard B2B SaaS |
| Spacious + borderless | Premium consumer, marketing |
| Spacious + soft shadows | Marketing, landing page |

---

## Q10 — Animation

**Level decision tree:**

Is this a developer tool? → Minimal. Developers find animation distracting.
Is this a marketing site? → Expressive.
Is this data-heavy? → Subtle at most. Don't animate the numbers.
Does the brand personality include "delightful"? → Expressive.
Does the brand personality include "calm" or "focused"? → Subtle.

**Key interaction to make great:**
This is the one animation to invest in — usually the product's signature moment:
- For a chat app: message send animation
- For a dashboard: data loading transition (not a spinner)
- For a form tool: success state after submission
- For a code tool: copy-to-clipboard confirmation

---

## Q11 — Dark Mode

**When dark mode is non-negotiable:**
- Primary audience is developers or designers (nearly all use dark mode OS-wide)
- The product is used in dark environments (monitoring, broadcast, live events)
- Data visualization is central (charts look better on dark)

**When to defer:**
- Consumer product with broad demographic (many users prefer light)
- Design time is limited (dark mode adds ~30% to token work)
- No clear user demand signal yet

**What "add later" requires:**
- Build with CSS custom properties from day one (so dark mode is just overriding variables)
- Never hardcode `#ffffff` or `#000000` anywhere — always use semantic tokens

---

## Q12 — The Defining Screen

**Why this question matters:**
The defining screen sets the visual bar for everything else. Once it's pixel-perfect, every other screen is calibrated against it.

**Typical answers and what they reveal:**

| Answer | What it means |
|--------|--------------|
| The landing page | First impression matters most — conversion-led design |
| The dashboard / home | The product's value lives in data visualization |
| The main creation flow | The product is about output — blank canvas, creation states |
| The onboarding | User activation is the main challenge |
| A specific component | There's one interaction the user is already proud of |

**Probe:**
- "When you imagine a screenshot that could be on your homepage, what are you picturing?"
- "If a potential customer sees one screenshot on a review site, which one should it be?"
