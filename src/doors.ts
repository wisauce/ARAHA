import { uid } from "./geometry";
import { bearing } from "./pathfind";
import { nearestWalkablePixel } from "./pathfind";
import type { DoorFix, DoorLandmark, DoorSide } from "./types";
import type { PlanPoint, WalkGrid } from "./walkable";

function idx(grid: WalkGrid, x: number, y: number): number {
  return y * grid.width + x;
}

function probeSide(grid: WalkGrid, gx: number, gy: number, dx: number, dy: number, steps = 36): PlanPoint | null {
  let x = gx;
  let y = gy;
  let lastWalk = -1;
  for (let s = 0; s < steps; s += 1) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) break;
    if (!grid.walkable[idx(grid, nx, ny)]) break;
    lastWalk = s;
    x = nx;
    y = ny;
  }
  if (lastWalk < 4) return null;
  const back = Math.min(6, lastWalk);
  return { x: (x - dx * back) / grid.width, y: (y - dy * back) / grid.height };
}

export function sidesForGap(grid: WalkGrid, nx: number, ny: number): Pick<DoorLandmark, "gap" | "sideA" | "sideB" | "headingA" | "headingB"> | null {
  const snap = nearestWalkablePixel(grid, nx, ny, 28);
  if (!snap) return null;
  const gx = Math.round(snap.x * grid.width);
  const gy = Math.round(snap.y * grid.height);
  const pairs: Array<[[number, number], [number, number]]> = [
    [
      [1, 0],
      [-1, 0],
    ],
    [
      [0, 1],
      [0, -1],
    ],
  ];
  for (const [da, db] of pairs) {
    const sideA = probeSide(grid, gx, gy, da[0], da[1]);
    const sideB = probeSide(grid, gx, gy, db[0], db[1]);
    if (sideA && sideB) {
      const gap = { x: gx / grid.width, y: gy / grid.height };
      return {
        gap,
        sideA,
        sideB,
        headingA: bearing(sideA, sideB),
        headingB: bearing(sideB, sideA),
      };
    }
  }
  return null;
}

export function createDoorAt(grid: WalkGrid, nx: number, ny: number, name: string): DoorLandmark | null {
  const sides = sidesForGap(grid, nx, ny);
  if (!sides) return null;
  return {
    id: uid(),
    name,
    ...sides,
  };
}

function probesBothWays(grid: WalkGrid, x: number, y: number): boolean {
  for (const [dx, dy] of [
    [1, 0],
    [0, 1],
  ] as const) {
    if (probeSide(grid, x, y, dx, dy) && probeSide(grid, x, y, -dx, -dy)) return true;
  }
  return false;
}

function doorGapScore(grid: WalkGrid, x: number, y: number): number | null {
  const { width, walkable, dist } = grid;
  const i = idx(grid, x, y);
  if (!walkable[i]) return null;
  const d = dist[i];
  if (d > 8) return null;

  const neighbors = [i - 1, i + 1, i - width, i + width];
  if (!neighbors.some((n) => !walkable[n])) return null;

  const walkNeighbors = neighbors.filter((n) => walkable[n]);
  if (walkNeighbors.length === 0 || !walkNeighbors.every((n) => dist[n] >= d - 0.01)) return null;
  if (!probesBothWays(grid, x, y)) return null;

  return 8 - d;
}

export function suggestDoors(grid: WalkGrid, maxDoors = 48): DoorLandmark[] {
  const { width, height } = grid;
  const candidates: { x: number; y: number; score: number }[] = [];
  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      const score = doorGapScore(grid, x, y);
      if (score == null) continue;
      candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const kept: { x: number; y: number }[] = [];
  for (const c of candidates) {
    if (kept.some((p) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 < 24 * 24)) continue;
    kept.push({ x: c.x, y: c.y });
    if (kept.length >= maxDoors) break;
  }
  const doors: DoorLandmark[] = [];
  kept.forEach((p, n) => {
    const door = createDoorAt(grid, p.x / width, p.y / height, `Door ${n + 1}`);
    if (door) doors.push(door);
  });
  return doors;
}

export function fixFromDoor(door: DoorLandmark, side: DoorSide): DoorFix {
  const approach = side === "a" ? door.sideA : door.sideB;
  const heading = side === "a" ? door.headingA : door.headingB;
  return {
    doorId: door.id,
    side,
    x: approach.x,
    y: approach.y,
    heading,
    scannedAt: Date.now(),
  };
}

export function doorUrl(doorId: string, side: DoorSide): string {
  const base = `${window.location.origin}${window.location.pathname}`.replace(/\/$/, "");
  return `${base}/door/${doorId}?side=${side}`;
}

export function parseDoorUrl(href: string): { doorId: string; side: DoorSide } | null {
  try {
    const url = new URL(href, window.location.origin);
    const match = url.pathname.match(/\/door\/([^/]+)\/?$/);
    if (!match) return null;
    const side = url.searchParams.get("side");
    if (side !== "a" && side !== "b") return null;
    return { doorId: match[1], side };
  } catch {
    return null;
  }
}

export function destinationPoint(
  grid: WalkGrid,
  dest: { kind: "point"; x: number; y: number } | { kind: "door"; doorId: string; side: DoorSide },
  doors: DoorLandmark[],
): PlanPoint | null {
  if (dest.kind === "point") return nearestWalkablePixel(grid, dest.x, dest.y);
  const door = doors.find((d) => d.id === dest.doorId);
  if (!door) return null;
  const approach = dest.side === "a" ? door.sideA : door.sideB;
  return nearestWalkablePixel(grid, approach.x, approach.y);
}
