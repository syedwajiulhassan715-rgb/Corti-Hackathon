"use client";

/**
 * The opening move: the hospital as a whole, then one continuous push down into
 * North Ward.
 *
 * The camera and the building were built as separate pieces on purpose -- the
 * camera knows nothing about hospitals, the building knows nothing about time.
 * This is the only file that knows both, and all it does is hand each one the
 * value the other produces: the building reports where North Ward is, the
 * camera reports how far in we are.
 *
 * Nothing here is load-bearing. The ward underneath is already in its final,
 * correct state before the flight starts; if the camera never runs -- reduced
 * motion, a second visit in the same session, a thrown sessionStorage -- the
 * ward is simply what you see, immediately.
 */

import { useCallback, useRef, useState } from "react";
import { TwinCamera, useCameraZoom, type FocusRect } from "@/components/twin-camera";
import { HospitalTwin, zonesFromWard, LIVE_ZONE_ID } from "@/components/hospital/HospitalTwin";
import type { WardResponse } from "@/lib/api";

/**
 * The wide shot. It reads the camera position rather than being told it, so the
 * building resolves detail on exactly the frames the camera moves -- one optical
 * move rather than two animations that agree approximately.
 */
function Establishing({ ward, onRect }: { ward: WardResponse | null; onRect: (rect: FocusRect) => void }) {
  const { zoom } = useCameraZoom();
  return (
    <div className="h-full w-full">
      <HospitalTwin zones={zonesFromWard(ward)} zoom={zoom} focusZoneId={LIVE_ZONE_ID} onFocusRect={onRect} />
    </div>
  );
}

export function WardTwinIntro({ ward, children }: { ward: WardResponse | null; children: React.ReactNode }) {
  const [focusRect, setFocusRect] = useState<FocusRect | null>(null);
  const locked = useRef(false);

  // The building re-reports the rect on every zoom change, and the camera reads
  // focusRect while it is flying. Feeding it a target that moves as a *result*
  // of the move is how a flight ends up chasing itself, so the first
  // measurement is the only one taken: aim once, then commit.
  const onRect = useCallback((rect: FocusRect) => {
    if (locked.current) return;
    locked.current = true;
    setFocusRect(rect);
  }, []);

  return (
    <TwinCamera
      establishing={<Establishing ward={ward} onRect={onRect} />}
      destination={children}
      focusRect={focusRect}
      label="North ward · live spatial view"
    />
  );
}
