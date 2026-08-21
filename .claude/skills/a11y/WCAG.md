# WCAG 2.1 AA Quick Reference — Rules & Fix Patterns

---

## Contrast (WCAG 1.4.3, 1.4.11)

**Requirements:**
- Body text (< 18px regular, < 14px bold): **4.5:1** minimum
- Large text (≥ 18px regular, ≥ 14px bold): **3:1** minimum
- UI components (borders, icons, focus rings): **3:1** minimum
- Decorative elements: no requirement

**How to adjust using HSB:**
- Too light (fails): increase S + decrease B, shift hue toward 0°/120°/240°
- On dark bg: decrease S + increase B, shift hue toward 60°/180°/300°

**Common culprits:**
- Placeholder text (often `#999` = 2.8:1 on white — must be ≥4.5:1 or add asterisk label)
- Disabled elements (not required to pass, but should still be readable)
- Gray-on-gray secondary text in cards
- Link color that only differs from body text by hue (needs ≥3:1 contrast with surrounding text OR underline)

**Fix pattern:**
```css
/* Bad — placeholder at 2.8:1 */
::placeholder { color: #999; }

/* Good — placeholder at 4.5:1+ */
::placeholder { color: #767676; }
```

---

## Keyboard Navigation (WCAG 2.1.1, 2.1.2, 2.4.3, 2.4.7)

**Requirements:**
- All functionality operable by keyboard alone
- No keyboard traps (can always Tab away)
- Logical tab order (matches visual reading order)
- Visible focus indicator on every interactive element

**Tab order rules:**
- Follows DOM order by default — don't use `tabIndex > 0` to reorder (fix the DOM instead)
- `tabIndex={0}` — makes a non-focusable element focusable (use sparingly)
- `tabIndex={-1}` — removes from tab order but allows programmatic focus (use for modal triggers)

**Focus management patterns:**
```tsx
// Modal: trap focus while open, restore on close
const triggerRef = useRef<HTMLButtonElement>(null);
const modalRef   = useRef<HTMLDivElement>(null);

// On open: focus first interactive element in modal
useEffect(() => { if (isOpen) modalRef.current?.querySelector('button, [href], input')?.focus(); }, [isOpen]);

// On close: return focus to trigger
useEffect(() => { if (!isOpen) triggerRef.current?.focus(); }, [isOpen]);

// Escape closes modal
useEffect(() => {
  const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}, [onClose]);
```

**Keyboard trap in modal:**
```tsx
// Trap Tab inside modal
const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key !== 'Tab') return;
  const focusable = modalRef.current?.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable?.length) return;
  const first = focusable[0] as HTMLElement;
  const last  = focusable[focusable.length - 1] as HTMLElement;
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
};
```

---

## Focus Visibility (WCAG 2.4.7, 2.4.11)

**Requirement:** Every focused element must have a visible focus indicator. Browser default outlines must not be removed without replacement.

**Never do this:**
```css
*:focus { outline: none; }          /* removes all focus indicators */
button:focus { outline: 0; }        /* same violation */
```

**Correct pattern — global focus style:**
```css
/* In globals.css — applies to everything */
:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 2px;
}

/* Remove default outline only when focus-visible provides replacement */
:focus:not(:focus-visible) { outline: none; }
```

**Tailwind pattern:**
```tsx
<button className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2">
```

**Custom focus for dark backgrounds:**
```css
:focus-visible {
  outline: 2px solid white;
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--color-brand);
}
```

---

## Skip Link (WCAG 2.4.1)

**Requirement:** First focusable element must allow skipping repetitive navigation.

```tsx
// In root layout — first child of <body>
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded focus:bg-white focus:text-black focus:shadow-lg focus:outline-2"
>
  Skip to main content
</a>

// On the <main> element
<main id="main-content" tabIndex={-1}>
```

**`sr-only` / `focus:not-sr-only` — Tailwind utility:**
```css
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.not-sr-only { position: static; width: auto; height: auto; padding: 0; overflow: visible; clip: auto; white-space: normal; }
```

---

## Semantic HTML (WCAG 1.3.1, 1.3.2, 4.1.2)

**Landmarks — one of each per page:**
```html
<header>  — site header (nav, logo, search)
<nav>     — primary navigation
<main>    — page content (exactly one)
<aside>   — supplementary content
<footer>  — page footer
```

**Heading hierarchy:**
```html
<h1>Page title</h1>       <!-- exactly one per page -->
  <h2>Section</h2>
    <h3>Subsection</h3>   <!-- never skip levels -->
```

**Interactive elements — always use native HTML:**
| Wrong | Right |
|-------|-------|
| `<div onClick>` | `<button>` |
| `<span onClick>` | `<button>` |
| `<div role="button">` | `<button>` |
| `<a>` with no href | `<button>` |
| `<a onClick>` for non-navigation | `<button>` |

**Why:** native elements get keyboard handling, ARIA semantics, and accessible names for free.

---

## Names & Labels (WCAG 1.1.1, 2.4.6, 4.1.2)

**Every interactive element needs an accessible name.** Priority order:
1. Visible text content (best)
2. `aria-label` (for icon-only buttons)
3. `aria-labelledby` (references visible text elsewhere)
4. `title` attribute (last resort — not surfaced by all screen readers)

**Form inputs:**
```tsx
// Preferred — visible label associated by htmlFor/id
<label htmlFor="email">Email address</label>
<input id="email" type="email" />

// Acceptable — no visible label (search, inline forms)
<input aria-label="Search projects" type="search" />

// Never — placeholder is not a label (disappears on focus)
<input placeholder="Email address" />  // ← no label = violation
```

**Icon-only buttons:**
```tsx
// Wrong — screen reader announces nothing
<button><TrashIcon /></button>

// Right
<button aria-label="Delete project">
  <TrashIcon aria-hidden="true" />
</button>

// Also right — screen-reader-only text
<button>
  <TrashIcon aria-hidden="true" />
  <span className="sr-only">Delete project</span>
</button>
```

**Images:**
```tsx
<img src="chart.png" alt="Monthly revenue increased 23% in Q4" />  // informative
<img src="decoration.png" alt="" role="presentation" />             // decorative
```

---

## ARIA (WCAG 4.1.2)

**Golden rule: no ARIA is better than bad ARIA.** Use native HTML elements first.

**Valid ARIA usage:**
```tsx
// Live regions — announce dynamic updates
<div aria-live="polite">  {/* non-urgent: "3 results found" */}
<div aria-live="assertive">  {/* urgent: "Form submission failed" */}

// Expanded/collapsed state
<button aria-expanded={isOpen} aria-controls="dropdown-menu">Menu</button>
<ul id="dropdown-menu" hidden={!isOpen}>...</ul>

// Current page in nav
<nav>
  <a href="/dashboard" aria-current="page">Dashboard</a>
  <a href="/settings">Settings</a>
</nav>

// Loading state
<button aria-busy={isLoading} disabled={isLoading}>
  {isLoading ? 'Saving…' : 'Save Changes'}
</button>
```

**Common ARIA mistakes:**
```tsx
// Wrong — aria-label on a div (not interactive)
<div aria-label="Card title">...</div>

// Wrong — redundant role
<button role="button">...</button>

// Wrong — aria-hidden on focusable element
<button aria-hidden="true">Close</button>  // keyboard can still reach it!

// Right — if hiding from AT, also remove from tab order
<button aria-hidden="true" tabIndex={-1}>Close</button>

// Wrong — aria-required on non-form element
<div aria-required="true">...</div>

// Wrong — empty aria-label
<button aria-label="">...</button>
```

---

## Color as Only Signal (WCAG 1.4.1)

**Requirement:** Color cannot be the only visual means of conveying information.

| Wrong | Right |
|-------|-------|
| Red border on invalid input | Red border + error icon + error message text |
| Green text for success | Green text + checkmark icon |
| Link color differs from body text | Link color + underline (or ≥3:1 contrast with surrounding text) |
| Red dot for notifications | Red dot + number count |

**Fix pattern:**
```tsx
// Wrong — color only
<input className={hasError ? 'border-red-500' : 'border-gray-300'} />

// Right — color + icon + message
<input className={hasError ? 'border-red-500' : 'border-gray-300'} aria-invalid={hasError} />
{hasError && (
  <p className="text-red-600 flex items-center gap-1" role="alert">
    <AlertIcon aria-hidden="true" />
    {errorMessage}
  </p>
)}
```

---

## Tap Targets (WCAG 2.5.5 — AA target: 44×44px)

**Requirement:** Interactive targets should be at least 44×44 CSS pixels.

**Fix — increase padding, not the element dimensions:**
```tsx
// Wrong — 24px icon with no padding
<button><MenuIcon className="w-6 h-6" /></button>

// Right — padding makes the tap area ≥44px
<button className="p-3"><MenuIcon className="w-6 h-6" /></button>
// total: 24 + 12*2 = 48px ✓

// For inline icon buttons in tight layouts:
<button className="relative w-6 h-6 before:absolute before:-inset-3 before:content-['']">
  <MenuIcon />
</button>
```

---

## Motion / Animation (WCAG 2.3.3)

**Requirement:** All animations must respect `prefers-reduced-motion: reduce`.

**Verify this rule exists in globals.css:**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

**In Framer Motion:**
```tsx
import { useReducedMotion, MotionConfig } from 'framer-motion';

// Wrap app in MotionConfig — disables all animations when reduced motion is on
<MotionConfig reducedMotion="user">
  <App />
</MotionConfig>
```

**In JS-based animation:**
```ts
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const duration = prefersReduced ? 0 : 300;
```

---

## Language (WCAG 3.1.1)

**Requirement:** `<html>` must have a `lang` attribute matching the page language.

```html
<html lang="en">
```

For multilingual pages, mark language switches inline:
```html
<p>The word <span lang="fr">bonjour</span> means hello.</p>
```

---

## Quick Impact Reference

| Violation | Impact | WCAG | Fix |
|-----------|--------|------|-----|
| Missing alt on img | Critical | 1.1.1 | Add alt="" or descriptive alt |
| No form label | Serious | 1.3.1 | Add `<label>` or aria-label |
| onClick on div/span | Serious | 4.1.2 | Replace with `<button>` |
| Contrast < 4.5:1 (body) | Serious | 1.4.3 | Darken/lighten with HSB |
| Contrast < 3:1 (large) | Moderate | 1.4.3 | Darken/lighten with HSB |
| No focus visible | Serious | 2.4.7 | Add :focus-visible style |
| Missing skip link | Moderate | 2.4.1 | Add to root layout |
| Heading skip | Moderate | 1.3.1 | Fix hierarchy |
| Icon button no label | Serious | 4.1.2 | Add aria-label |
| Color-only error | Moderate | 1.4.1 | Add icon + text |
| Tap target < 44px | Minor | 2.5.5 | Increase padding |
| Missing lang attribute | Serious | 3.1.1 | Add lang to html element |
| aria-hidden + focusable | Serious | 4.1.2 | Add tabIndex={-1} |
| No prefers-reduced-motion | Moderate | 2.3.3 | Add CSS rule to globals |
| Modal focus not trapped | Critical | 2.1.2 | Add focus trap logic |
| Missing aria-live | Moderate | 4.1.3 | Add to dynamic content containers |
