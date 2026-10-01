import { useRef } from "react";
import type { PointerEvent } from "react";
import type { DoorLandmark, EncodedImage, FloorMap } from "./types";
import type { PlanPoint } from "./walkable";

type Mode = "view" | "doors" | "navigate";

type Props = {
  image: EncodedImage;
  map: FloorMap;
  mode: Mode;
  walkOverlay?: string | null;
  doors: DoorLandmark[];
  selectedDoorId: string | null;
  route: PlanPoint[] | null;
  navPose: { x: number; y: number; heading: number } | null;
  destination: PlanPoint | null;
  onSelectDoor: (id: string) => void;
  onAddDoor?: (x: number, y: number) => void;
  onNavigateTap?: (x: number, y: number) => void;
};

function arrowEnd(x: number, y: number, heading: number, width: number, height: number) {
  const length = Math.min(width, height) * 0.09;
  const rad = (heading * Math.PI) / 180;
  const x1 = x * width;
  const y1 = y * height;
  return {
    x1,
    y1,
    x2: x1 + Math.sin(rad) * length,
    y2: y1 - Math.cos(rad) * length,
  };
}

function arrowHead(x1: number, y1: number, x2: number, y2: number, size: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const left = angle + Math.PI * 0.84;
  const right = angle - Math.PI * 0.84;
  return `${x2},${y2} ${x2 + Math.cos(left) * size},${y2 + Math.sin(left) * size} ${x2 + Math.cos(right) * size},${y2 + Math.sin(right) * size}`;
}

export function MapStage({
  image,
  mode,
  walkOverlay,
  doors,
  selectedDoorId,
  route,
  navPose,
  destination,
  onSelectDoor,
  onAddDoor,
  onNavigateTap,
}: Props) {
  const propsRef = useRef({ onAddDoor, onNavigateTap, onSelectDoor, doors, mode });
  propsRef.current = { onAddDoor, onNavigateTap, onSelectDoor, doors, mode };

  function eventPoint(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const thresh = (18 * image.width) / rect.width;
    return { nx, ny, px: nx * image.width, py: ny * image.height, thresh };
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    const point = eventPoint(event);
    if (!point) return;
    const { nx, ny, px, py, thresh } = point;
    const current = propsRef.current;

    for (let i = current.doors.length - 1; i >= 0; i -= 1) {
      const door = current.doors[i];
      const gx = door.gap.x * image.width;
      const gy = door.gap.y * image.height;
      if (Math.hypot(px - gx, py - gy) <= thresh) {
        current.onSelectDoor(door.id);
        return;
      }
    }

    if (current.mode === "doors" && current.onAddDoor) {
      current.onAddDoor(nx, ny);
      return;
    }
    if (current.mode === "navigate" && current.onNavigateTap) {
      current.onNavigateTap(nx, ny);
    }
  }

  const cursor = mode === "doors" || mode === "navigate" ? "crosshair" : "default";

  return (
    <div className="map-stage" style={{ ["--ar" as string]: image.width / image.height }}>
      <img src={image.dataUrl} alt="Floor plan" draggable={false} />
      {walkOverlay && <img className="walk-layer" src={walkOverlay} alt="" draggable={false} />}
      <svg
        viewBox={`0 0 ${image.width} ${image.height}`}
        role="application"
        aria-label="Floor plan map"
        style={{ cursor, fontFamily: "Outfit, sans-serif" }}
        onPointerDown={onPointerDown}
      >
        <rect width={image.width} height={image.height} fill="transparent" />
        {route && route.length > 1 && (
          <polyline
            points={route.map((p) => `${p.x * image.width},${p.y * image.height}`).join(" ")}
            fill="none"
            stroke="#1a6b8a"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {destination && (
          <circle
            cx={destination.x * image.width}
            cy={destination.y * image.height}
            r={Math.max(10, image.width * 0.012)}
            fill="rgba(26,107,138,0.25)"
            stroke="#1a6b8a"
            strokeWidth={3}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {doors.map((door) => {
          const selected = door.id === selectedDoorId;
          const gx = door.gap.x * image.width;
          const gy = door.gap.y * image.height;
          return (
            <g key={door.id}>
              <line
                x1={door.sideA.x * image.width}
                y1={door.sideA.y * image.height}
                x2={door.sideB.x * image.width}
                y2={door.sideB.y * image.height}
                stroke={selected ? "#0b5f5a" : "#3d4a43"}
                strokeWidth={selected ? 4 : 2}
                strokeDasharray="6 5"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={gx}
                cy={gy}
                r={Math.max(8, image.width * 0.009)}
                fill={selected ? "#0b5f5a" : "#f7f3ec"}
                stroke={selected ? "#f7f3ec" : "#0b5f5a"}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
        {navPose && (
          <g>
            {(() => {
              const end = arrowEnd(navPose.x, navPose.y, navPose.heading, image.width, image.height);
              const head = Math.max(12, image.width * 0.014);
              return (
                <>
                  <line
                    x1={end.x1}
                    y1={end.y1}
                    x2={end.x2}
                    y2={end.y2}
                    stroke="#fff7ef"
                    strokeWidth={8}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <line
                    x1={end.x1}
                    y1={end.y1}
                    x2={end.x2}
                    y2={end.y2}
                    stroke="#d4652f"
                    strokeWidth={4}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                  <polygon points={arrowHead(end.x1, end.y1, end.x2, end.y2, head)} fill="#d4652f" />
                  <circle cx={end.x1} cy={end.y1} r={Math.max(9, image.width * 0.011)} fill="#fff7ef" />
                  <circle cx={end.x1} cy={end.y1} r={Math.max(6, image.width * 0.007)} fill="#d4652f" />
                </>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
}
