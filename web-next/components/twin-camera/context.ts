"use client";

import { createContext, useContext } from "react";

export type CameraPhase = "establishing" | "flying" | "arrived";

export interface CameraState {
  /** Continuous 0..1, eased. 0 = wide shot, 1 = landed on the destination. */
  readonly zoom: number;
  readonly phase: CameraPhase;
  /** Land immediately. Safe to call at any time, including after arrival. */
  readonly skip: () => void;
  /** Clear the once-per-session flag and fly again. No-op under reduced motion. */
  readonly replay: () => void;
}

function noop(): void {
  /* the camera is not mounted; there is nothing to move */
}

/**
 * The default is "arrived", not "establishing".
 *
 * A child that asks for the camera outside a TwinCamera has no camera, and the
 * only safe reading of that is: you are already where you were going. Anything
 * else and a panel rendered on its own -- in a test, on a sub-route, in a
 * Storybook-ish harness -- would sit at zoom 0 waiting for a flight that never
 * comes. The page must always end up interactive.
 */
export const ARRIVED: CameraState = { zoom: 1, phase: "arrived", skip: noop, replay: noop };

export const CameraContext = createContext<CameraState>(ARRIVED);

export function useCameraZoom(): CameraState {
  return useContext(CameraContext);
}
