"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import "@/app/twin-camera.css";
import { EASE_CAMERA, EASE_FADE, lerp, ramp } from "./easing";
import { ARRIVED, CameraContext, type CameraPhase, type CameraState } from "./context";

export type { CameraPhase, CameraState } from "./context";

/**
 * TwinCamera -- a generic two-shot camera move.
 *
 * It knows nothing about hospitals. It is handed a wide shot and a destination
 * and choreographs one optical push from the first into the second: hold a
 * beat, ease in toward a focus rectangle, cross-fade at the top of the move,
 * and land. Everything it animates is transform, opacity and (briefly) filter
 * -- no width, height, top or left, so nothing it does can cost a layout.
 *
 * Nothing here is load-bearing. The move is decoration over a destination that
 * is already correct in its final state: if the browser asks for reduced
 * motion, if the sequence already played this session, if a key is pressed, if
 * the page is scrolled, or if the component is torn down mid-flight, the
 * destination is what remains and it is fully interactive. There is no path
 * through this file that can leave a viewer looking at a page they cannot use.
 */

export interface FocusRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TwinCameraProps {
  /** The wide shot. Unmounted once the camera has arrived. */
  readonly establishing: React.ReactNode;
  /** What we land on. Always mounted, inert until arrival. */
  readonly destination: React.ReactNode;
  /**
   * Where in the wide shot to fly toward, in the establishing layer's own
   * coordinate space -- which is the viewport, because that layer is fixed to
   * it. Two units are accepted, because both are natural depending on who is
   * supplying the rect:
   *   - fractions of the viewport, when width and height are both <= 1
   *     (e.g. { x: .35, y: .4, width: .3, height: .22 } -- a measured SVG
   *     viewBox ratio, resolution-independent);
   *   - CSS pixels otherwise (e.g. the result of getBoundingClientRect()).
   * Omitted or null means a centred push at a modest fixed scale.
   */
  readonly focusRect?: FocusRect | null;
  /**
   * The eased 0..1 camera position, every frame of the flight, so the
   * establishing child can resolve detail in step with the move. Also called
   * once with 0 when the wide shot is taken up and once with 1 on arrival.
   * Constant zeroes are not re-sent during the hold: the value has not changed,
   * and consumers of this callback typically set state.
   */
  readonly onZoom?: (zoom: number) => void;
  readonly onPhaseChange?: (phase: CameraPhase) => void;
  /** Default true. When false the wide shot is held until replay() is called. */
  readonly autoPlay?: boolean;
  /** Beat on the wide shot before the move begins. */
  readonly holdMs?: number;
  /** The move itself. */
  readonly durationMs?: number;
  /** Caption shown over the wide shot during the establishing beat. */
  readonly label?: string;
}

const DEFAULT_HOLD_MS = 900;
const DEFAULT_DURATION_MS = 1800;

/** Without a focus rect the camera still moves, just modestly and centred. */
const DEFAULT_TARGET_SCALE = 2.2;
/** A cover-fit onto a tiny rect can ask for absurd magnification. It cannot have it. */
const MAX_TARGET_SCALE = 12;
const MIN_TARGET_SCALE = 1.05;

/** The destination lands from slightly over-scale, so arrival settles rather than pops. */
const DESTINATION_OVERSCALE = 1.1;
/** Depth blur on the outgoing layer. Small on purpose -- suggestion, not gimmick. */
const MAX_OUTGOING_BLUR_PX = 3;

const SESSION_KEY = "echo.twin-camera.played";

/** sessionStorage throws outright in some embedding contexts. Never let it decide whether the page renders. */
function sessionPlayed(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markSessionPlayed(played: boolean): void {
  try {
    if (played) window.sessionStorage.setItem(SESSION_KEY, "1");
    else window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode, blocked site data, a thumbnailer: the flight is not worth an exception */
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * useLayoutEffect warns when a component is prerendered on the server, and this
 * app is a static export -- so every page is prerendered at build time. The
 * decision "did this already play / does this viewer want motion" has to happen
 * before the browser paints the hydrated tree, or a returning viewer sees a
 * frame of a wide shot they already dismissed.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

interface ResolvedFocus {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
}

function resolveFocus(rect: FocusRect | null | undefined, width: number, height: number): ResolvedFocus {
  if (width <= 0 || height <= 0) return { cx: 0, cy: 0, scale: MIN_TARGET_SCALE };
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    return { cx: width / 2, cy: height / 2, scale: DEFAULT_TARGET_SCALE };
  }
  const normalized = rect.width <= 1 && rect.height <= 1;
  const x = normalized ? rect.x * width : rect.x;
  const y = normalized ? rect.y * height : rect.y;
  const w = normalized ? rect.width * width : rect.width;
  const h = normalized ? rect.height * height : rect.height;
  const cover = Math.max(width / w, height / h);
  return {
    cx: x + w / 2,
    cy: y + h / 2,
    scale: Math.min(MAX_TARGET_SCALE, Math.max(MIN_TARGET_SCALE, cover)),
  };
}

export function TwinCamera(props: TwinCameraProps): React.JSX.Element {
  const {
    establishing,
    destination,
    focusRect = null,
    onZoom,
    onPhaseChange,
    autoPlay = true,
    holdMs = DEFAULT_HOLD_MS,
    durationMs = DEFAULT_DURATION_MS,
    label,
  } = props;

  // The server and the first client render agree on this, always: the wide
  // shot, un-zoomed. Every reason to skip is a browser fact, and browser facts
  // are read in the layout effect below -- never during render, which would
  // desynchronise hydration and log an error on a stage.
  const [phase, setPhase] = useState<CameraPhase>("establishing");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const establishingRef = useRef<HTMLDivElement | null>(null);
  const destinationRef = useRef<HTMLDivElement | null>(null);
  const chromeRef = useRef<HTMLDivElement | null>(null);

  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const zoomRef = useRef(0);
  const emittedRef = useRef<number | null>(null);
  const subscribersRef = useRef(new Set<() => void>());
  const phaseRef = useRef<CameraPhase>("establishing");
  const settledRef = useRef(false);

  // Callbacks and timings are read through refs so that a caller passing an
  // inline arrow function cannot restart the flight on every render of their
  // own component.
  const onZoomRef = useRef(onZoom);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const focusRef = useRef<FocusRect | null>(focusRect);
  const holdRef = useRef(holdMs);
  const durationRef = useRef(durationMs);
  onZoomRef.current = onZoom;
  onPhaseChangeRef.current = onPhaseChange;
  focusRef.current = focusRect;
  holdRef.current = holdMs;
  durationRef.current = durationMs;

  const publishZoom = useCallback((value: number): void => {
    zoomRef.current = value;
    for (const notify of subscribersRef.current) notify();
    if (emittedRef.current !== value) {
      emittedRef.current = value;
      onZoomRef.current?.(value);
    }
  }, []);

  const setPhaseOnce = useCallback((next: CameraPhase): void => {
    if (phaseRef.current === next) return;
    phaseRef.current = next;
    setPhase(next);
    onPhaseChangeRef.current?.(next);
  }, []);

  const cancelFrame = useCallback((): void => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  /** Paint one frame of the move. Transform, opacity, filter -- nothing else. */
  const paint = useCallback((eased: number): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const focus = resolveFocus(focusRef.current, width, height);

    const stage = stageRef.current;
    if (stage) {
      const scale = 1 + (focus.scale - 1) * eased;
      const cx = lerp(width / 2, focus.cx, eased);
      const cy = lerp(height / 2, focus.cy, eased);
      // transform-origin is 0 0, so this is a pure camera: bring the focus
      // point to the centre of frame, then magnify about that same origin.
      stage.style.transform =
        "translate3d(" +
        String(width / 2 - cx * scale) +
        "px, " +
        String(height / 2 - cy * scale) +
        "px, 0) scale(" +
        String(scale) +
        ")";
    }

    const outgoing = establishingRef.current;
    if (outgoing) {
      outgoing.style.opacity = String(1 - EASE_FADE(ramp(eased, 0.62, 1)));
      const blur = ramp(eased, 0.5, 1) * MAX_OUTGOING_BLUR_PX;
      outgoing.style.filter = blur > 0.05 ? "blur(" + blur.toFixed(2) + "px)" : "";
    }

    const chrome = chromeRef.current;
    if (chrome) chrome.style.opacity = String(1 - ramp(eased, 0, 0.18));

    const landing = destinationRef.current;
    if (landing) {
      landing.style.opacity = String(EASE_FADE(ramp(eased, 0.48, 0.98)));
      const settle = EASE_CAMERA(ramp(eased, 0.42, 1));
      landing.style.transform = "scale(" + String(lerp(DESTINATION_OVERSCALE, 1, settle)) + ")";
    }
  }, []);

  /** Drop every inline style the flight wrote, so the landed page owns its own layout. */
  const clearPaint = useCallback((): void => {
    const landing = destinationRef.current;
    if (landing) {
      // A lingering transform would make this element the containing block for
      // any position:fixed descendant of the destination. It has to go.
      landing.style.transform = "";
      landing.style.opacity = "";
    }
    const chrome = chromeRef.current;
    if (chrome) chrome.style.opacity = "";
  }, []);

  const land = useCallback((): void => {
    cancelFrame();
    startedAtRef.current = null;
    settledRef.current = true;
    markSessionPlayed(true);
    publishZoom(1);
    setPhaseOnce("arrived");
    clearPaint();
  }, [cancelFrame, clearPaint, publishZoom, setPhaseOnce]);

  const tick = useCallback(
    (timestamp: number): void => {
      if (startedAtRef.current === null) startedAtRef.current = timestamp;
      const elapsed = timestamp - startedAtRef.current;
      const hold = Math.max(0, holdRef.current);
      const duration = Math.max(1, durationRef.current);

      if (elapsed < hold) {
        // The beat. Nothing moves, the caption is readable, and the zoom is 0
        // and stays 0 -- no consumer is asked to re-render for a value that has
        // not changed.
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      setPhaseOnce("flying");
      const progress = Math.min(1, (elapsed - hold) / duration);
      const eased = EASE_CAMERA(progress);
      paint(eased);
      publishZoom(eased);

      if (progress >= 1) {
        land();
        return;
      }
      frameRef.current = requestAnimationFrame(tick);
    },
    [land, paint, publishZoom, setPhaseOnce],
  );

  const start = useCallback((): void => {
    cancelFrame();
    settledRef.current = false;
    startedAtRef.current = null;
    setPhaseOnce("establishing");
    publishZoom(0);
    paint(0);
    frameRef.current = requestAnimationFrame(tick);
  }, [cancelFrame, paint, publishZoom, setPhaseOnce, tick]);

  const skip = useCallback((): void => {
    if (phaseRef.current === "arrived") return;
    land();
  }, [land]);

  const replay = useCallback((): void => {
    markSessionPlayed(false);
    if (prefersReducedMotion()) {
      land();
      return;
    }
    start();
  }, [land, start]);

  // ------------------------------------------------------------------- mount
  useIsomorphicLayoutEffect(() => {
    const alreadyPlayed = sessionPlayed();
    const reduced = prefersReducedMotion();

    if (reduced || alreadyPlayed) {
      // No flight at all. Not a fast flight -- none. The destination is the
      // first thing this viewer sees, at zoom 1, fully interactive.
      land();
      return cancelFrame;
    }
    if (!autoPlay) {
      setPhaseOnce("establishing");
      publishZoom(0);
      paint(0);
      return cancelFrame;
    }
    start();
    return cancelFrame;
  }, [autoPlay, cancelFrame, land, paint, publishZoom, setPhaseOnce, start]);

  // --------------------------------------------------------- escape hatches
  useEffect(() => {
    if (phase === "arrived") return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") skip();
    };
    const onIntent = (): void => skip();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onIntent);
    window.addEventListener("wheel", onIntent, { passive: true });
    window.addEventListener("touchmove", onIntent, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onIntent);
      window.removeEventListener("wheel", onIntent);
      window.removeEventListener("touchmove", onIntent);
    };
  }, [phase, skip]);

  // ------------------------------------------------------------- scroll lock
  useEffect(() => {
    if (phase === "arrived") return;
    const root = document.documentElement;
    const body = document.body;
    const priorRoot = root.style.overflow;
    const priorBody = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";
    // The cleanup is the whole point. Arrival, unmount, a thrown render
    // upstream, a hot reload mid-flight -- every one of them runs this and the
    // page is scrollable again. A demo that ends on a frozen page is a lost
    // demo.
    return () => {
      root.style.overflow = priorRoot;
      body.style.overflow = priorBody;
    };
  }, [phase]);

  // Re-frame on resize, so a rotated tablet or a projector plugged in mid-move
  // does not strand the camera across a stale viewport.
  useEffect(() => {
    if (phase === "arrived") return;
    const onResize = (): void => {
      if (!settledRef.current) paint(zoomRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [paint, phase]);

  useEffect(() => cancelFrame, [cancelFrame]);

  const subscribe = useCallback((notify: () => void): (() => void) => {
    const subscribers = subscribersRef.current;
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
    };
  }, []);
  const getZoom = useCallback(() => zoomRef.current, []);
  const getServerZoom = useCallback(() => 0, []);

  const arrived = phase === "arrived";

  return (
    <div className="tc" data-phase={phase}>
      {!arrived && (
        <div className="tc-establishing" ref={establishingRef} aria-hidden={phase === "flying"}>
          <div className="tc-stage" ref={stageRef}>
            {establishing}
          </div>
        </div>
      )}

      {!arrived && (
        <div className="tc-chrome" ref={chromeRef}>
          {label !== undefined && label !== "" && <p className="tc-label">{label}</p>}
          <button type="button" className="tc-skip" onClick={skip}>
            Skip intro
            <span className="tc-skip-key">Esc</span>
          </button>
        </div>
      )}

      <div
        className="tc-destination"
        ref={destinationRef}
        // Not merely un-clickable: removed from the tab order and from the
        // accessibility tree, so a keyboard user cannot land focus inside a
        // page that is still flying toward them.
        inert={!arrived}
      >
        <ZoomProvider
          subscribe={subscribe}
          getZoom={getZoom}
          getServerZoom={getServerZoom}
          phase={phase}
          skip={skip}
          replay={replay}
        >
          {destination}
        </ZoomProvider>
      </div>
    </div>
  );
}

/**
 * The per-frame value lives here rather than in TwinCamera so that sixty state
 * updates a second re-render one provider, not the camera and both of its
 * shots. `children` is the same element object on every one of those renders,
 * so React bails out of the destination subtree unless something inside it
 * actually asked for the zoom via useCameraZoom.
 */
function ZoomProvider(props: {
  readonly subscribe: (notify: () => void) => () => void;
  readonly getZoom: () => number;
  readonly getServerZoom: () => number;
  readonly phase: CameraPhase;
  readonly skip: () => void;
  readonly replay: () => void;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { subscribe, getZoom, getServerZoom, phase, skip, replay, children } = props;
  const zoom = useSyncExternalStore(subscribe, getZoom, getServerZoom);
  const value = useMemo<CameraState>(
    () => ({ zoom, phase, skip, replay }),
    [zoom, phase, skip, replay],
  );
  return <CameraContext.Provider value={value}>{children}</CameraContext.Provider>;
}

export { ARRIVED };
