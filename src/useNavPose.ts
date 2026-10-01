import { useEffect, useState } from "react";
import type { DoorFix } from "./types";

export type NavPose = { x: number; y: number; heading: number };

export function useNavPose(fix: DoorFix | null): NavPose | null {
  const [pose, setPose] = useState<NavPose | null>(null);
  useEffect(() => {
    if (!fix) {
      setPose(null);
      return;
    }
    const f = fix;
    setPose({ x: f.x, y: f.y, heading: f.heading });
    let base: number | null = null;

    function onOrient(event: DeviceOrientationEvent) {
      if (event.alpha == null) return;
      if (base == null) base = event.alpha;
      const delta = normalizeDeg(event.alpha - base);
      setPose({ x: f.x, y: f.y, heading: normalizeDeg(f.heading + delta) });
    }

    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [fix]);

  return pose;
}

function normalizeDeg(value: number): number {
  let deg = value % 360;
  if (deg < 0) deg += 360;
  return deg;
}
