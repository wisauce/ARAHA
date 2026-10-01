import type { FloorMap, MapLabel, MapObject, ObjectKind, Point, Room, RoomKind } from "./types";
import { OBJECT_KINDS, ROOM_KINDS } from "./types";

export function clamp(n: number, min = 0, max = 1): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function uid(): string {
  return crypto.randomUUID();
}

export function headingLabel(deg: number): string {
  const names = ["Up", "Up right", "Right", "Down right", "Down", "Down left", "Left", "Up left"];
  const wrapped = ((deg % 360) + 360) % 360;
  return names[Math.round(wrapped / 45) % 8];
}

export function pointInPoly(x: number, y: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const crosses = yi > y !== yj > y;
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

export function centroid(poly: Point[]): Point {
  if (poly.length === 0) return [0.5, 0.5];
  let x = 0;
  let y = 0;
  for (const [px, py] of poly) {
    x += px;
    y += py;
  }
  return [x / poly.length, y / poly.length];
}

function areaCentroid(poly: Point[]): Point {
  let twice = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const cross = x1 * y2 - x2 * y1;
    twice += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(twice) < 1e-12) return centroid(poly);
  return [cx / (3 * twice), cy / (3 * twice)];
}

function distanceToEdges(x: number, y: number, poly: Point[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i += 1) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.min(1, Math.max(0, ((x - x1) * dx + (y - y1) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return best;
}

export function fitLabel(poly: Point[], text: string, width: number, height: number): number {
  const [x, y] = labelPoint(poly);
  const radius = distanceToEdges(x, y, poly) * Math.min(width, height);
  const byHeight = radius * 1.15;
  const byWidth = (radius * 1.8) / Math.max(1, text.length * 0.52);
  return Math.max(10, Math.min(28, byHeight, byWidth));
}

export function labelPoint(poly: Point[]): Point {
  const center = areaCentroid(poly);
  if (poly.length < 3) return center;
  if (pointInPoly(center[0], center[1], poly)) return center;
  const xs = poly.map(([x]) => x);
  const ys = poly.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  let best = center;
  let bestDistance = -1;
  const steps = 40;
  for (let i = 1; i < steps; i += 1) {
    for (let j = 1; j < steps; j += 1) {
      const x = minX + ((maxX - minX) * i) / steps;
      const y = minY + ((maxY - minY) * j) / steps;
      if (!pointInPoly(x, y, poly)) continue;
      const distance = distanceToEdges(x, y, poly);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [x, y];
      }
    }
  }
  return best;
}

export function translatePolygon(poly: Point[], dx: number, dy: number): Point[] {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const ndx = clamp(dx, -minX, 1 - maxX);
  const ndy = clamp(dy, -minY, 1 - maxY);
  return poly.map(([x, y]) => [x + ndx, y + ndy]);
}

export function moveVertex(poly: Point[], index: number, x: number, y: number): Point[] {
  return poly.map((point, i) => (i === index ? [clamp(x), clamp(y)] : point));
}

export function rectPolygon(a: Point, b: Point): Point[] | null {
  const x1 = Math.min(a[0], b[0]);
  const y1 = Math.min(a[1], b[1]);
  const x2 = Math.max(a[0], b[0]);
  const y2 = Math.max(a[1], b[1]);
  if (x2 - x1 < 0.012 || y2 - y1 < 0.012) return null;
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];
}

export function roomAt(map: FloorMap, x: number, y: number): Room | undefined {
  for (let i = map.rooms.length - 1; i >= 0; i -= 1) {
    if (pointInPoly(x, y, map.rooms[i].polygon)) return map.rooms[i];
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

function asKind<T extends string>(value: unknown, allowed: readonly (readonly [T, string])[], fallback: T): T {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "");
  const alias: Record<string, string> = {
    bathroom: "restroom",
    toilet: "restroom",
    wc: "restroom",
    hall: "corridor",
    hallway: "corridor",
    passage: "corridor",
    stair: "stairs",
    staircase: "stairs",
    lift: "elevator",
    desk: "furniture",
    table: "furniture",
    chair: "furniture",
    sofa: "furniture",
    plant: "fixture",
    sink: "fixture",
    reception: "lobby",
  };
  const normalized = (alias[text] ?? text) as T;
  return allowed.some(([kind]) => kind === normalized) ? normalized : fallback;
}

type CoordSpace = "unit" | "grid" | "pixel";

function detectSpace(values: number[], imageWidth: number): CoordSpace {
  const finite = values.filter((n) => Number.isFinite(n) && n >= 0);
  const max = finite.length ? Math.max(...finite) : 0;
  if (max <= 1.5) return "unit";
  if (max > 1000) return "pixel";
  if (imageWidth > 0 && imageWidth <= 1100 && max <= imageWidth * 1.08 && max > imageWidth * 0.62) return "pixel";
  return "grid";
}

function scaleComponent(value: number, space: CoordSpace, size: number): number {
  if (space === "grid") return clamp(value / 1000);
  if (space === "pixel") return clamp(size > 0 ? value / size : value / 1000);
  return clamp(value);
}

function collectNumbers(value: unknown, into: number[]) {
  if (typeof value === "number") into.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectNumbers(item, into));
  else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.x === "number") into.push(record.x);
    if (typeof record.y === "number") into.push(record.y);
  }
}

function pairFrom(value: unknown): [number, number] | null {
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    return [value[0], value[1]];
  }
  const record = asRecord(value);
  if (record && typeof record.x === "number" && typeof record.y === "number") return [record.x, record.y];
  return null;
}

function polygonFrom(value: unknown, space: CoordSpace, image: { w: number; h: number }): Point[] | null {
  const record = asRecord(value);
  const rawPoints = Array.isArray(value) ? value : record?.polygon ?? record?.points ?? record?.vertices;
  if (
    Array.isArray(rawPoints) &&
    rawPoints.length >= 6 &&
    rawPoints.length % 2 === 0 &&
    rawPoints.every((point) => typeof point === "number")
  ) {
    const flat: Point[] = [];
    for (let i = 0; i < rawPoints.length; i += 2) {
      flat.push([
        scaleComponent(rawPoints[i] as number, space, image.w),
        scaleComponent(rawPoints[i + 1] as number, space, image.h),
      ]);
    }
    return flat;
  }
  const looksLikePoints =
    Array.isArray(rawPoints) &&
    rawPoints.length >= 3 &&
    rawPoints.some((point) => Array.isArray(point) || asRecord(point) !== null);
  if (looksLikePoints && Array.isArray(rawPoints)) {
    const points = rawPoints
      .map(pairFrom)
      .filter((point): point is [number, number] => point !== null)
      .map(([x, y]) => [scaleComponent(x, space, image.w), scaleComponent(y, space, image.h)] as Point);
    return points.length >= 3 ? points : null;
  }

  const box = record?.bbox ?? record?.box ?? record?.bounds;
  if (!Array.isArray(box) || box.length < 4 || box.some((n) => typeof n !== "number")) return null;
  const [a, b, c, d] = box as number[];
  const limit = space === "unit" ? 1 : space === "grid" ? 1000 : Math.max(image.w, image.h, 1);
  const asCorners = c > a && d > b;
  const overflowsIfSize = a + c > limit * 1.04 || b + d > limit * 1.04;
  const x1 = a;
  const y1 = b;
  const x2 = asCorners && overflowsIfSize ? c : a + c;
  const y2 = asCorners && overflowsIfSize ? d : b + d;
  return rectPolygon(
    [scaleComponent(x1, space, image.w), scaleComponent(y1, space, image.h)],
    [scaleComponent(x2, space, image.w), scaleComponent(y2, space, image.h)],
  );
}

export function parseFloorMap(payload: unknown, image: { w: number; h: number }): FloorMap {
  const root = asRecord(payload);
  if (!root) throw new Error("The model returned a map that was not an object.");

  const roomSource = root.rooms ?? root.spaces ?? root.areas ?? [];
  const objectSource = root.objects ?? root.items ?? root.fixtures ?? [];
  const labelSource = root.labels ?? root.texts ?? [];
  const numbers: number[] = [];
  collectNumbers(roomSource, numbers);
  collectNumbers(objectSource, numbers);
  collectNumbers(labelSource, numbers);
  const space = detectSpace(numbers, image.w);

  const rooms: Room[] = [];
  if (Array.isArray(roomSource)) {
    for (const item of roomSource.slice(0, 80)) {
      const record = asRecord(item);
      if (!record) continue;
      const polygon = polygonFrom(record, space, image);
      if (!polygon) continue;
      rooms.push({
        id: uid(),
        name: String(record.name ?? record.label ?? record.title ?? "Room").slice(0, 80),
        kind: asKind<RoomKind>(record.kind ?? record.type, ROOM_KINDS, "room"),
        polygon,
        uncertain: Boolean(record.uncertain),
      });
    }
  }

  const objects: MapObject[] = [];
  if (Array.isArray(objectSource)) {
    for (const item of objectSource.slice(0, 80)) {
      const record = asRecord(item);
      if (!record) continue;
      const polygon = polygonFrom(record, space, image);
      if (!polygon) continue;
      objects.push({
        id: uid(),
        name: String(record.name ?? record.label ?? record.title ?? "Object").slice(0, 80),
        kind: asKind<ObjectKind>(record.kind ?? record.type, OBJECT_KINDS, "other"),
        polygon,
        uncertain: Boolean(record.uncertain),
      });
    }
  }

  const labels: MapLabel[] = [];
  if (Array.isArray(labelSource)) {
    for (const item of labelSource.slice(0, 80)) {
      const record = asRecord(item);
      const pair = pairFrom(item) ?? (record ? pairFrom([record.x, record.y]) : null);
      if (!record || !pair) continue;
      const text = String(record.text ?? record.name ?? record.label ?? "").trim().slice(0, 80);
      if (!text) continue;
      const x = scaleComponent(pair[0], space, image.w);
      const y = scaleComponent(pair[1], space, image.h);
      const duplicate = rooms.some(
        (room) => room.name.trim().toLowerCase() === text.toLowerCase() && pointInPoly(x, y, room.polygon),
      );
      if (duplicate) continue;
      labels.push({ id: uid(), text, x, y });
    }
  }

  return {
    summary: String(root.summary ?? root.description ?? "").slice(0, 400),
    rooms,
    objects,
    labels,
  };
}

export function parseLocate(payload: unknown): {
  referenceId: string | null;
  confidence: number;
  reason: string;
  x: number;
  y: number;
  heading: number;
} {
  const root = asRecord(payload);
  if (!root) throw new Error("The model returned a location that was not an object.");
  let confidence = typeof root.confidence === "number" ? root.confidence : Number(root.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  if (confidence > 1) confidence = clamp(confidence / 100);
  confidence = clamp(confidence);
  const xRaw = typeof root.x === "number" ? root.x : Number(root.x);
  const yRaw = typeof root.y === "number" ? root.y : Number(root.y);
  const grid = Math.max(Math.abs(xRaw) || 0, Math.abs(yRaw) || 0) > 1.5;
  const headingRaw = typeof root.heading_deg === "number" ? root.heading_deg : Number(root.heading_deg ?? root.heading);
  const id = root.matched_reference_id ?? root.reference_id ?? root.id;
  return {
    referenceId: id == null ? null : String(id),
    confidence,
    reason: String(root.reason ?? root.explanation ?? "").slice(0, 500),
    x: clamp(grid ? xRaw / 1000 : xRaw),
    y: clamp(grid ? yRaw / 1000 : yRaw),
    heading: Number.isFinite(headingRaw) ? ((headingRaw % 360) + 360) % 360 : 0,
  };
}

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(cleaned.slice(start, i + 1));
        start = -1;
      }
    }
  }
  for (let i = objects.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(objects[i]) as unknown;
    } catch {
      continue;
    }
  }
  throw new Error("The model did not return JSON. Try again.");
}

export function entityById(map: FloorMap, id: string): Room | MapObject | MapLabel | undefined {
  return map.rooms.find((room) => room.id === id) ?? map.objects.find((object) => object.id === id) ?? map.labels.find((label) => label.id === id);
}

export function replacePolygon(map: FloorMap, id: string, polygon: Point[]): FloorMap {
  return {
    ...map,
    rooms: map.rooms.map((room) => (room.id === id ? { ...room, polygon } : room)),
    objects: map.objects.map((object) => (object.id === id ? { ...object, polygon } : object)),
  };
}

export function moveLabel(map: FloorMap, id: string, x: number, y: number): FloorMap {
  return {
    ...map,
    labels: map.labels.map((label) => (label.id === id ? { ...label, x: clamp(x), y: clamp(y) } : label)),
  };
}

export function deleteEntity(map: FloorMap, id: string): FloorMap {
  return {
    ...map,
    rooms: map.rooms.filter((room) => room.id !== id),
    objects: map.objects.filter((object) => object.id !== id),
    labels: map.labels.filter((label) => label.id !== id),
  };
}

export function withRoom(map: FloorMap, room: Room): FloorMap {
  return { ...map, rooms: [...map.rooms, room] };
}

export function withObject(map: FloorMap, object: MapObject): FloorMap {
  return { ...map, objects: [...map.objects, object] };
}

export function withLabel(map: FloorMap, label: MapLabel): FloorMap {
  return { ...map, labels: [...map.labels, label] };
}

export function patchEntity(
  map: FloorMap,
  id: string,
  patch: { name?: string; kind?: RoomKind | ObjectKind; text?: string },
): FloorMap {
  return {
    ...map,
    rooms: map.rooms.map((room) =>
      room.id === id
        ? {
            ...room,
            name: patch.name ?? room.name,
            kind: (patch.kind as RoomKind | undefined) ?? room.kind,
          }
        : room,
    ),
    objects: map.objects.map((object) =>
      object.id === id
        ? {
            ...object,
            name: patch.name ?? object.name,
            kind: (patch.kind as ObjectKind | undefined) ?? object.kind,
          }
        : object,
    ),
    labels: map.labels.map((label) => (label.id === id ? { ...label, text: patch.text ?? label.text } : label)),
  };
}
