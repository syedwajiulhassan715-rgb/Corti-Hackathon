# Animation Patterns Reference

All durations, easings, and implementation code by element type.

---

## Timing Reference

| Element | Enter | Exit | Easing |
|---------|-------|------|--------|
| Button hover | 150ms | 150ms | ease-out |
| Button press | 100ms | 100ms | ease-in / ease-out |
| Tooltip | 125ms | 100ms | ease-out / ease-in |
| Dropdown / menu | 150ms | 100ms | ease-out / ease-in |
| Toast / snackbar | 300ms | 200ms | ease-out / ease-in |
| Modal / dialog | 200ms | 150ms | ease-out / ease-in |
| Drawer / sheet | 300ms | 250ms | cubic-bezier(0.16,1,0.3,1) / ease-in |
| Popover | 150ms | 100ms | ease-out / ease-in |
| Accordion | 200ms | 200ms | ease-out |
| Tab switch | 150ms | — | ease-out |
| Page transition | 200ms | — | ease-out |
| Scroll reveal | 500ms | — | cubic-bezier(0.16,1,0.3,1) |
| Skeleton shimmer | 1500ms | — | ease-in-out (infinite) |

**Hard limits:**
- Nothing above 400ms for triggered UI (modals, dropdowns, drawers)
- Nothing above 600ms for scroll reveals
- Anything at 500ms+ will feel slow — test it

---

## Easing Presets

```css
/* Standard */
ease-out: cubic-bezier(0, 0, 0.2, 1)
ease-in:  cubic-bezier(0.4, 0, 1, 1)

/* Premium (expo-out) — for drawers, scroll reveals */
--ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)

/* Spring-like (for bouncy elements, use sparingly) */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)
```

---

## Patterns by Element Type

---

### Button — hover + press

**Tailwind:**
```tsx
<button className="
  transition-all duration-150 ease-out
  hover:scale-[1.02] hover:-translate-y-px hover:shadow-md
  active:scale-[0.97] active:translate-y-0 active:shadow-sm
">
```

**CSS:**
```css
.btn {
  transition: transform 150ms ease-out, box-shadow 150ms ease-out;
}
.btn:hover  { transform: scale(1.02) translateY(-1px); }
.btn:active { transform: scale(0.97) translateY(0); transition-duration: 100ms; }
```

Rules:
- Scale max: 1.02 up, 0.97 down. Never more — it looks exaggerated.
- translateY: −1px to −2px max on hover. Simulates lifting.
- Shadow increases on hover, decreases on press (light from sky).

---

### Card — hover lift

**Tailwind:**
```tsx
<div className="
  transition-all duration-200 ease-out
  hover:-translate-y-1 hover:shadow-lg
">
```

**CSS:**
```css
.card {
  transition: transform 200ms ease-out, box-shadow 200ms ease-out;
}
.card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.12); }
```

Rules:
- translateY: −4px max. More feels unstable.
- Shadow: grow proportionally with lift.

---

### Modal / Dialog — enter + exit

**CSS keyframes:**
```css
@keyframes modal-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes modal-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.95); }
}
.modal[data-state="open"]   { animation: modal-in  200ms ease-out forwards; }
.modal[data-state="closed"] { animation: modal-out 150ms ease-in  forwards; }

/* Overlay */
@keyframes overlay-in  { from { opacity: 0; } to { opacity: 1; } }
@keyframes overlay-out { from { opacity: 1; } to { opacity: 0; } }
.overlay[data-state="open"]   { animation: overlay-in  200ms ease-out; }
.overlay[data-state="closed"] { animation: overlay-out 150ms ease-in; }
```

Rules:
- Scale from 0.95, not 0 — subtle scale reads as "appearing in place"
- Overlay and modal animate together, same duration

---

### Drawer / Sheet — slide in

**CSS keyframes:**
```css
@keyframes drawer-in-right {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
@keyframes drawer-out-right {
  from { transform: translateX(0); }
  to   { transform: translateX(100%); }
}
.drawer[data-state="open"]   { animation: drawer-in-right  300ms cubic-bezier(0.16,1,0.3,1) forwards; }
.drawer[data-state="closed"] { animation: drawer-out-right 250ms ease-in forwards; }
```

Rules:
- Use expo-out easing for enter — gives a premium decelerating feel
- Exit is simpler (ease-in) — the user already chose to close it

---

### Dropdown / Menu — scale from origin

**CSS keyframes:**
```css
@keyframes dropdown-in {
  from { opacity: 0; transform: scaleY(0.95); }
  to   { opacity: 1; transform: scaleY(1); }
}
@keyframes dropdown-out {
  from { opacity: 1; transform: scaleY(1); }
  to   { opacity: 0; transform: scaleY(0.95); }
}
.dropdown[data-state="open"]   {
  transform-origin: top;
  animation: dropdown-in  150ms ease-out forwards;
}
.dropdown[data-state="closed"] {
  transform-origin: top;
  animation: dropdown-out 100ms ease-in  forwards;
}
```

Rules:
- `transform-origin: top` — scales from where it appears, not the center
- scaleY (not scale) — menus expand vertically, not radially

---

### Tooltip — fade + tiny scale

**CSS:**
```css
@keyframes tooltip-in  { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
@keyframes tooltip-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(0.95); } }
.tooltip[data-state="delayed-open"] { animation: tooltip-in  125ms ease-out; }
.tooltip[data-state="closed"]       { animation: tooltip-out 100ms ease-in; }
```

---

### Toast / Notification — slide up

**CSS keyframes:**
```css
@keyframes toast-in {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes toast-out {
  from { opacity: 1; transform: translateY(0); }
  to   { opacity: 0; transform: translateY(-8px); }
}
.toast[data-state="open"]   { animation: toast-in  300ms ease-out; }
.toast[data-state="closed"] { animation: toast-out 200ms ease-in; }
```

Rules:
- Slides up from below (gravity-consistent with light-from-sky rule)
- Exits upward (away from where it came from)

---

### Accordion / Collapsible — height expand

**CSS (grid trick — no layout thrash):**
```css
.accordion-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 200ms ease-out;
}
.accordion-content[data-state="open"] {
  grid-template-rows: 1fr;
}
.accordion-content > div {
  overflow: hidden;
}
```

Rules:
- `grid-template-rows: 0fr → 1fr` — CSS-only height animation with zero layout thrash
- Do NOT use `max-height` hack unless the content height is truly unknown and bounded

---

### Tab switch — fade + slide

**CSS:**
```css
@keyframes tab-in {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}
.tab-content[data-state="active"] {
  animation: tab-in 150ms ease-out;
}
```

Rules:
- Slide direction: left-to-right tabs slide in from right (+8px), right-to-left from left (−8px)
- Very subtle translateX — just enough to show direction, not a full slide

---

### Scroll Reveal — staggered fade up

**CSS (using Intersection Observer via JS, or CSS @scroll-timeline):**
```css
@keyframes reveal-up {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
.reveal {
  opacity: 0;
}
.reveal.visible {
  animation: reveal-up 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
/* Stagger with nth-child or data-delay */
.reveal:nth-child(2) { animation-delay: 100ms; }
.reveal:nth-child(3) { animation-delay: 200ms; }
.reveal:nth-child(4) { animation-delay: 300ms; }
```

**Minimal JS observer:**
```js
const observer = new IntersectionObserver(
  (entries) => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.1 }
);
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
```

Rules:
- translateY: 24px max. More feels like a lot of travel for a "reveal"
- Stagger: 100ms between siblings — enough to read as staggered, not so much it feels slow
- Threshold 0.1 — triggers when 10% of the element is visible, not when fully in view

---

### Page Transition — simple fade

```css
@keyframes page-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.page-wrapper {
  animation: page-in 200ms ease-out;
}
```

Rules:
- Keep it simple — a fade is almost always better than a slide for full pages
- 200ms max — any longer and navigation feels sluggish
- In Next.js App Router: add to the root `<main>` or a `PageWrapper` component in the layout

---

### Skeleton Shimmer

```css
@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}
.skeleton {
  background: linear-gradient(
    90deg,
    oklch(0.92 0.005 var(--brand-hue)) 25%,
    oklch(0.96 0.002 var(--brand-hue)) 50%,
    oklch(0.92 0.005 var(--brand-hue)) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1500ms ease-in-out infinite;
}
```

Rules:
- Use brand hue in skeleton (whisper chroma), not pure gray
- 1500ms for skeleton — slow enough to be calming, fast enough to not feel stuck

---

---

## GSAP Patterns

Use these when the project has `gsap` installed. GSAP is imperative like Motion One but has a richer timeline API — prefer `gsap.to()` for single animations and `gsap.timeline()` for sequenced ones.

### Setup
```ts
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
gsap.registerPlugin(ScrollTrigger)
```

### Easing names in GSAP
```
ease-out → "power2.out"
ease-in  → "power2.in"
expo-out → "expo.out"       // premium deceleration — use for drawers, scroll reveals
spring   → "back.out(1.2)"  // slight overshoot — use sparingly
```

### Button — hover + press
```ts
import gsap from 'gsap'
import { useRef } from 'react'

function AnimatedButton({ children, ...props }) {
  const ref = useRef(null)
  return (
    <button
      ref={ref}
      onMouseEnter={() => gsap.to(ref.current, { scale: 1.02, y: -1, duration: 0.15, ease: 'power2.out' })}
      onMouseLeave={() => gsap.to(ref.current, { scale: 1,    y:  0, duration: 0.15, ease: 'power2.out' })}
      onMouseDown ={() => gsap.to(ref.current, { scale: 0.97,         duration: 0.1,  ease: 'power2.in'  })}
      onMouseUp   ={() => gsap.to(ref.current, { scale: 1,            duration: 0.1,  ease: 'power2.out' })}
      {...props}
    >
      {children}
    </button>
  )
}
```

### Modal — enter + exit
```ts
import gsap from 'gsap'

function openModal(overlay: HTMLElement, panel: HTMLElement) {
  gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' })
  gsap.fromTo(panel,   { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.2, ease: 'power2.out' })
}

function closeModal(overlay: HTMLElement, panel: HTMLElement, onComplete: () => void) {
  const tl = gsap.timeline({ onComplete })
  tl.to(panel,   { opacity: 0, scale: 0.95, duration: 0.15, ease: 'power2.in' })
  tl.to(overlay, { opacity: 0, duration: 0.15, ease: 'power2.in' }, '<') // run at same time
}
```

### Drawer — slide in
```ts
function openDrawer(el: HTMLElement) {
  gsap.fromTo(el, { x: '100%' }, { x: '0%', duration: 0.3, ease: 'expo.out' })
}
function closeDrawer(el: HTMLElement, onComplete: () => void) {
  gsap.to(el, { x: '100%', duration: 0.25, ease: 'power2.in', onComplete })
}
```

### Scroll reveal — staggered list
```ts
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Call once after the component mounts
function initScrollReveal(container: HTMLElement) {
  gsap.fromTo(
    container.querySelectorAll('[data-reveal]'),
    { opacity: 0, y: 24 },
    {
      opacity: 1,
      y: 0,
      duration: 0.5,
      ease: 'expo.out',
      stagger: 0.1,
      scrollTrigger: {
        trigger: container,
        start: 'top 90%',   // trigger when top of container is 90% down the viewport
        once: true,
      },
    }
  )
}
```

In React (hook):
```tsx
import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

function useScrollReveal() {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const ctx = gsap.context(() => {
      gsap.fromTo(
        '[data-reveal]',
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.1,
          scrollTrigger: { trigger: ref.current, start: 'top 90%', once: true } }
      )
    }, ref)
    return () => ctx.revert() // cleanup on unmount
  }, [])
  return ref
}
// Usage: <section ref={useScrollReveal()}> <div data-reveal>...</div> </section>
```

### Page transition — fade
```ts
// On route change (e.g. in Next.js router events or layout component)
function pageEnter(el: HTMLElement) {
  gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' })
}
```

### Timeline — sequenced entrance (for hero sections)
```ts
function heroEntrance(heading: HTMLElement, subtext: HTMLElement, cta: HTMLElement) {
  const tl = gsap.timeline()
  tl.fromTo(heading, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out' })
  tl.fromTo(subtext, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: 'expo.out' }, '-=0.2')
  tl.fromTo(cta,     { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3,  ease: 'expo.out' }, '-=0.15')
}
```

### prefers-reduced-motion with GSAP
GSAP does not automatically check `prefers-reduced-motion`. Check manually and set durations to 0:
```ts
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

gsap.to(el, {
  opacity: 1,
  y: 0,
  duration: reduced ? 0 : 0.5,
  ease: 'expo.out',
})
```

Or set it globally once at app startup to disable all GSAP animations:
```ts
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  gsap.globalTimeline.timeScale(1000) // effectively instant
}
```

---

## Motion One Patterns

Use these when the project has `@motionone/dom` or the `motion` package (not Framer Motion). Motion One is a lightweight imperative animation library — you call `animate(element, keyframes, options)` directly rather than using component props.

### Setup
```ts
import { animate, inView, stagger } from 'motion'
```

### Button — hover + press
```ts
// Attach to the button element on mount
const btn = document.querySelector('.btn')

btn.addEventListener('mouseenter', () => {
  animate(btn, { scale: 1.02, y: -1 }, { duration: 0.15, easing: 'ease-out' })
})
btn.addEventListener('mouseleave', () => {
  animate(btn, { scale: 1, y: 0 }, { duration: 0.15, easing: 'ease-out' })
})
btn.addEventListener('mousedown', () => {
  animate(btn, { scale: 0.97 }, { duration: 0.1, easing: 'ease-in' })
})
btn.addEventListener('mouseup', () => {
  animate(btn, { scale: 1 }, { duration: 0.1, easing: 'ease-out' })
})
```

In React, use a ref:
```tsx
import { animate } from 'motion'
import { useRef } from 'react'

function AnimatedButton({ children, ...props }) {
  const ref = useRef(null)
  return (
    <button
      ref={ref}
      onMouseEnter={() => animate(ref.current, { scale: 1.02, y: -1 }, { duration: 0.15, easing: 'ease-out' })}
      onMouseLeave={() => animate(ref.current, { scale: 1,    y:  0 }, { duration: 0.15, easing: 'ease-out' })}
      onMouseDown ={() => animate(ref.current, { scale: 0.97 },         { duration: 0.1,  easing: 'ease-in'  })}
      onMouseUp   ={() => animate(ref.current, { scale: 1 },            { duration: 0.1,  easing: 'ease-out' })}
      {...props}
    >
      {children}
    </button>
  )
}
```

### Modal — enter + exit
```ts
import { animate } from 'motion'

function openModal(el: HTMLElement) {
  animate(el, { opacity: [0, 1], scale: [0.95, 1] }, { duration: 0.2, easing: 'ease-out' })
}
function closeModal(el: HTMLElement) {
  return animate(el, { opacity: [1, 0], scale: [1, 0.95] }, { duration: 0.15, easing: 'ease-in' }).finished
  // await .finished before removing from DOM
}
```

### Scroll reveal — staggered list
```ts
import { inView, animate, stagger } from 'motion'

inView('.reveal-list', ({ target }) => {
  animate(
    target.querySelectorAll('.reveal-item'),
    { opacity: [0, 1], y: [24, 0] },
    { duration: 0.5, easing: [0.16, 1, 0.3, 1], delay: stagger(0.1) }
  )
})
```

In React (hook):
```tsx
import { inView, animate, stagger } from 'motion'
import { useEffect, useRef } from 'react'

function useScrollReveal() {
  const ref = useRef(null)
  useEffect(() => {
    if (!ref.current) return
    const stop = inView(ref.current, ({ target }) => {
      animate(
        target.querySelectorAll('[data-reveal]'),
        { opacity: [0, 1], y: [24, 0] },
        { duration: 0.5, easing: [0.16, 1, 0.3, 1], delay: stagger(0.1) }
      )
    })
    return stop
  }, [])
  return ref
}
// Usage: <section ref={useScrollReveal()}> <div data-reveal>...</div> </section>
```

### Drawer — slide in
```ts
import { animate } from 'motion'

function openDrawer(el: HTMLElement) {
  animate(el, { x: ['100%', '0%'] }, { duration: 0.3, easing: [0.16, 1, 0.3, 1] })
}
function closeDrawer(el: HTMLElement) {
  return animate(el, { x: ['0%', '100%'] }, { duration: 0.25, easing: 'ease-in' }).finished
}
```

### prefers-reduced-motion with Motion One
Motion One checks `prefers-reduced-motion` automatically when you pass `{ allowWebkitAcceleration: true }`, but the safest approach is to check manually:
```ts
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

if (!prefersReduced) {
  animate(el, { opacity: [0, 1], y: [24, 0] }, { duration: 0.5 })
} else {
  // Snap to final state instantly
  animate(el, { opacity: 1, y: 0 }, { duration: 0 })
}
```

Or extract a helper:
```ts
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const dur = (ms: number) => reduced() ? 0 : ms / 1000

animate(el, { opacity: [0, 1] }, { duration: dur(500) })
```

---

## Framer Motion Patterns

Use these when the project has `framer-motion` installed. Same timing values as CSS — only the implementation differs.

### Setup
```tsx
// Wrap the app (or layout) in AnimatePresence for exit animations
import { AnimatePresence } from 'framer-motion'
// In layout.tsx:
<AnimatePresence mode="wait">{children}</AnimatePresence>
```

### Shared transition presets
```ts
// lib/motion.ts — import these everywhere for consistency
export const easeOut  = { type: 'tween', ease: 'easeOut' }
export const easeIn   = { type: 'tween', ease: 'easeIn' }
export const easeExpo = { type: 'tween', ease: [0.16, 1, 0.3, 1] }

export const spring = { type: 'spring', stiffness: 300, damping: 30 }
```

### Button — hover + press
```tsx
<motion.button
  whileHover={{ scale: 1.02, y: -1 }}
  whileTap={{ scale: 0.97, y: 0 }}
  transition={{ duration: 0.15, ease: 'easeOut' }}
>
```

### Card — hover lift
```tsx
<motion.div
  whileHover={{ y: -4 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
>
```

### Modal / Dialog — enter + exit
```tsx
// Overlay
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
/>

// Panel
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
/>
```

### Drawer / Sheet — slide in
```tsx
<motion.div
  initial={{ x: '100%' }}
  animate={{ x: 0 }}
  exit={{ x: '100%' }}
  transition={{
    enter: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
    exit:  { duration: 0.25, ease: 'easeIn' },
  }}
/>
```

### Dropdown — scale from top
```tsx
<motion.div
  initial={{ opacity: 0, scaleY: 0.95 }}
  animate={{ opacity: 1, scaleY: 1 }}
  exit={{ opacity: 0, scaleY: 0.95 }}
  transition={{ duration: 0.15, ease: 'easeOut' }}
  style={{ originY: 0 }}   // scale from top edge
/>
```

### Toast — slide up
```tsx
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
/>
```

### Tooltip — fade + tiny scale
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.125, ease: 'easeOut' }}
/>
```

### Scroll reveal — staggered list
```tsx
// Parent
<motion.ul
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true, amount: 0.1 }}
  variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
>
// Each child
<motion.li
  variants={{
    hidden:  { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
  }}
/>
```

### Page transition — fade
```tsx
// In each page component
<motion.main
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: 0.2, ease: 'easeOut' }}
>
```

### Tab switch
```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, x: 8 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -8 }}
    transition={{ duration: 0.15, ease: 'easeOut' }}
  />
</AnimatePresence>
```

### prefers-reduced-motion with Framer Motion
Framer Motion respects the OS setting automatically when you use `useReducedMotion()`:
```tsx
import { useReducedMotion } from 'framer-motion'

function AnimatedCard() {
  const reduce = useReducedMotion()
  return (
    <motion.div
      whileHover={reduce ? {} : { y: -4 }}
      transition={{ duration: reduce ? 0 : 0.2 }}
    />
  )
}
```
Or set it globally in the root layout:
```tsx
// Wrap app with MotionConfig to disable all animations for reduced-motion users
import { MotionConfig, useReducedMotion } from 'framer-motion'
function Root({ children }) {
  const reduce = useReducedMotion()
  return <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>{children}</MotionConfig>
}
```

---

## prefers-reduced-motion

This block must exist exactly once in `globals.css`. Do not add per-component. Verify it is present before starting:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## What NOT to animate

| Property | Why |
|----------|-----|
| `width` / `height` | Triggers layout — use `transform: scaleX/Y` or grid trick |
| `padding` / `margin` | Triggers layout |
| `top` / `left` / `right` / `bottom` | Triggers layout — use `transform: translate` |
| `border-radius` | Technically OK, but expensive on complex shapes |
| `font-size` | Triggers layout |
| `color` | OK but low visual impact; use sparingly |
| `background-color` | OK, not GPU-composited — keep short (150ms max) |
| `box-shadow` | OK, not GPU-composited — keep short |
