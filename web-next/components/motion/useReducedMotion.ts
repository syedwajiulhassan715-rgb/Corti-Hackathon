"use client";

import { useEffect, useState } from "react";

/**
 * Whether the viewer has asked the OS for less motion.
 *
 * Starts `false` so the static export prerenders the same markup it hydrates
 * with; the effect corrects it on the first client frame. CSS already disables
 * the animations independently -- this hook exists only for the few decisions
 * JavaScript has to make itself, such as whether to smooth-scroll.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
