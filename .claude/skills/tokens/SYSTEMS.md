# Design Token Systems — Architecture & Patterns

---

## The Three-Layer Model

Every design token system has three layers. Never skip layers.

```
┌─────────────────────────────────┐
│  Component tokens (optional)    │  --button-bg, --card-shadow
│  "what this component uses"     │
├─────────────────────────────────┤
│  Semantic tokens (required)     │  --color-primary, --color-surface
│  "what this value means"        │
├─────────────────────────────────┤
│  Primitive tokens (required)    │  --color-blue-500, --space-4
│  "the raw values"               │
└─────────────────────────────────┘
```

**Why three layers:**
- Primitives = the full palette. Change them nowhere except the token file.
- Semantic = the meaning. `--color-primary` → `var(--color-blue-500)`. When brand color changes, edit one line.
- Component = only when a component needs a value that can't be expressed by semantic tokens. Rare.

**What to skip:** most apps don't need component tokens until they have at least 3+ themes.

---

## Naming Conventions

### Primitives
```
--color-{hue}-{shade}     → --color-blue-500, --color-gray-100
--space-{n}               → --space-1 (4px), --space-2 (8px), --space-4 (16px)
--radius-{size}           → --radius-sm (4px), --radius-md (8px), --radius-full (9999px)
--shadow-{level}          → --shadow-sm, --shadow-md, --shadow-lg
--font-size-{size}        → --font-size-sm (14px), --font-size-base (16px)
--font-weight-{name}      → --font-weight-normal (400), --font-weight-bold (700)
--z-{name}                → --z-dropdown (100), --z-modal (200), --z-toast (300)
```

### Semantic
```
--color-primary           → main brand color
--color-primary-hover     → darker state of primary
--color-primary-active    → pressed state of primary
--color-secondary         → secondary brand color
--color-destructive       → dangerous actions (red)
--color-success           → positive states (green)
--color-warning           → caution states (amber)
--color-info              → informational states (blue)

--color-background        → page background
--color-surface           → card/panel background (slightly elevated)
--color-surface-raised    → tooltip/dropdown background (more elevated)

--color-text              → primary body text
--color-text-secondary    → secondary/muted text
--color-text-disabled     → disabled state text
--color-text-inverse      → text on dark backgrounds

--color-border            → default border color
--color-border-strong     → emphasized border
--color-border-focus      → focus ring color (usually = --color-primary)

--shadow-card             → card elevation
--shadow-dropdown         → floating elements
--shadow-modal            → modal overlay
```

### Z-index scale
Use a named scale, never magic numbers:
```css
--z-below:    -1;
--z-base:      0;
--z-raised:   10;    /* sticky elements */
--z-dropdown: 100;   /* menus, selects */
--z-overlay:  200;   /* backdrop */
--z-modal:    300;   /* modals, dialogs */
--z-toast:    400;   /* notifications */
--z-tooltip:  500;   /* tooltips */
```

---

## What Must Be a Token vs What Can Be Hardcoded

**Must be a token:**
- Any color (hex, rgb, hsl) used in more than one place
- Brand colors
- Any spacing value used in more than one component
- All shadows
- All border radii
- All z-index values
- All font sizes and weights

**Can be hardcoded:**
- `border: 1px solid` — the `1px` doesn't change per theme
- `transition: opacity 200ms ease-out` — animation values
- `transform: translateX(-50%)` — layout math
- `grid-template-columns: repeat(3, 1fr)` — structural layout
- `width: 100%`, `height: 100vh` — full-bleed values

---

## CSS Custom Properties Pattern (Recommended)

Best for: any framework. Works with Tailwind, plain CSS, CSS Modules, styled-components.

```css
/* globals.css */

/* ── Primitives ─────────────────────────────── */
:root {
  /* Color palette */
  --color-blue-50:  #eff6ff;
  --color-blue-100: #dbeafe;
  --color-blue-500: #3b82f6;
  --color-blue-600: #2563eb;
  --color-blue-700: #1d4ed8;
  --color-gray-50:  #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-400: #9ca3af;
  --color-gray-700: #374151;
  --color-gray-900: #111827;
  --color-red-500:  #ef4444;
  --color-green-500:#22c55e;

  /* Spacing scale (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* Border radius */
  --radius-sm:   4px;
  --radius-md:   8px;
  --radius-lg:   12px;
  --radius-xl:   16px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm:  0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md:  0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg:  0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl:  0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);

  /* Typography */
  --font-size-xs:   12px;
  --font-size-sm:   14px;
  --font-size-base: 16px;
  --font-size-lg:   18px;
  --font-size-xl:   20px;
  --font-size-2xl:  24px;
  --font-size-3xl:  30px;
  --font-size-4xl:  36px;

  /* Z-index */
  --z-below:    -1;
  --z-base:      0;
  --z-raised:   10;
  --z-dropdown: 100;
  --z-overlay:  200;
  --z-modal:    300;
  --z-toast:    400;
  --z-tooltip:  500;
}

/* ── Semantic (light mode) ────────────────── */
:root {
  --color-primary:          var(--color-blue-500);
  --color-primary-hover:    var(--color-blue-600);
  --color-primary-active:   var(--color-blue-700);
  --color-destructive:      var(--color-red-500);
  --color-success:          var(--color-green-500);

  --color-background:       var(--color-gray-50);
  --color-surface:          #ffffff;
  --color-surface-raised:   #ffffff;

  --color-text:             var(--color-gray-900);
  --color-text-secondary:   var(--color-gray-400);
  --color-text-disabled:    var(--color-gray-400);
  --color-text-inverse:     #ffffff;

  --color-border:           var(--color-gray-200);
  --color-border-strong:    var(--color-gray-400);
  --color-border-focus:     var(--color-blue-500);

  --shadow-card:            var(--shadow-sm);
  --shadow-dropdown:        var(--shadow-lg);
  --shadow-modal:           var(--shadow-xl);
}

/* ── Dark mode override ───────────────────── */
.dark {
  --color-primary:          var(--color-blue-400);
  --color-primary-hover:    var(--color-blue-300);
  --color-primary-active:   var(--color-blue-200);

  --color-background:       var(--color-gray-900);
  --color-surface:          #1f2937;
  --color-surface-raised:   #374151;

  --color-text:             var(--color-gray-50);
  --color-text-secondary:   var(--color-gray-400);
  --color-text-disabled:    var(--color-gray-700);
  --color-text-inverse:     var(--color-gray-900);

  --color-border:           var(--color-gray-700);
  --color-border-strong:    var(--color-gray-400);
}
```

---

## Tailwind Config Pattern

Wire CSS custom properties into Tailwind so `bg-primary`, `text-text-secondary`, etc. work as utility classes.

```ts
// tailwind.config.ts
import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary:        { DEFAULT: 'var(--color-primary)', hover: 'var(--color-primary-hover)', active: 'var(--color-primary-active)' },
        destructive:    'var(--color-destructive)',
        success:        'var(--color-success)',
        background:     'var(--color-background)',
        surface:        { DEFAULT: 'var(--color-surface)', raised: 'var(--color-surface-raised)' },
        text:           { DEFAULT: 'var(--color-text)', secondary: 'var(--color-text-secondary)', disabled: 'var(--color-text-disabled)', inverse: 'var(--color-text-inverse)' },
        border:         { DEFAULT: 'var(--color-border)', strong: 'var(--color-border-strong)', focus: 'var(--color-border-focus)' },
      },
      spacing: {
        // Extend only if adding non-standard values. Standard 4px grid already in Tailwind.
        '18': 'var(--space-18)',
      },
      borderRadius: {
        sm:   'var(--radius-sm)',
        md:   'var(--radius-md)',
        lg:   'var(--radius-lg)',
        xl:   'var(--radius-xl)',
      },
      boxShadow: {
        card:     'var(--shadow-card)',
        dropdown: 'var(--shadow-dropdown)',
        modal:    'var(--shadow-modal)',
      },
      zIndex: {
        dropdown: 'var(--z-dropdown)',
        overlay:  'var(--z-overlay)',
        modal:    'var(--z-modal)',
        toast:    'var(--z-toast)',
        tooltip:  'var(--z-tooltip)',
      },
    },
  },
};

export default config;
```

**Usage in components:**
```tsx
<button className="bg-primary hover:bg-primary-hover text-text-inverse shadow-card rounded-md">
<p className="text-text-secondary text-sm">
<div className="border border-border bg-surface">
```

---

## shadcn/ui Token Pattern

If the project uses shadcn/ui, it already has a CSS variable system. Map to it:

```css
/* globals.css — shadcn/ui convention */
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --accent: 210 40% 96.1%;
  --accent-foreground: 222.2 47.4% 11.2%;
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --border: 214.3 31.8% 91.4%;
  --input: 214.3 31.8% 91.4%;
  --ring: 221.2 83.2% 53.3%;
  --radius: 0.5rem;
}
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  /* ... */
}
```

Note: shadcn/ui uses HSL channel values without the `hsl()` wrapper so Tailwind opacity modifier (`bg-primary/50`) works. When adding custom tokens alongside shadcn/ui, match this format.

---

## Style Dictionary Pattern

For design systems with multi-platform output (web, iOS, Android):

```json
{
  "color": {
    "blue": {
      "500": { "value": "#3b82f6", "type": "color" },
      "700": { "value": "#1d4ed8", "type": "color" }
    },
    "primary": {
      "value": "{color.blue.500}", "type": "color"
    }
  },
  "spacing": {
    "4": { "value": "16px", "type": "dimension" },
    "8": { "value": "32px", "type": "dimension" }
  }
}
```

---

## Dark Mode Checklist

A semantic token layer is correct when switching `.dark` makes everything right with zero component edits:

- [ ] Background surfaces get darker
- [ ] Text colors invert (dark on light → light on dark)
- [ ] Borders become lighter (to create contrast on dark surfaces)
- [ ] Brand/primary color shifts to a lighter shade (lighter colors work better on dark)
- [ ] Shadow opacity increases (shadows are harder to see on dark backgrounds — see ui-design-principles)
- [ ] No component has a hardcoded light or dark hex value that breaks in the other mode

If any item fails: the failing value is hardcoded, not tokenized. Find it and add a token.

---

## Common Token Mistakes

| Mistake | Fix |
|---------|-----|
| Naming by color: `--blue` | Name by role: `--color-primary` |
| Skipping primitives: `--color-primary: #3b82f6` | Primitive first: `--color-blue-500: #3b82f6; --color-primary: var(--color-blue-500)` |
| Duplicating semantic tokens with same value | Merge to one token |
| Component token for a value only used once | Use semantic token directly |
| Dark mode only overrides half the tokens | Every semantic token needs a dark override |
| Off-grid spacing: `var(--space-3-5)` = 14px | Stick to 4px grid: 4, 8, 12, 16, 20, 24, 32 |
| Opacity hacks: `--color-primary-10: rgba(59,130,246,0.1)` | Use Tailwind opacity modifier `bg-primary/10` with CSS var approach |
