import type { PlanPoint } from "./walkable";
import type { WalkGrid } from "./walkable";

function index(grid: WalkGrid, x: number, y: number): number {
  return y * grid.width + x;
}

function pixel(grid: WalkGrid, nx: number, ny: number): { x: number; y: number } | null {
  const x = Math.round(nx * grid.width);
  const y = Math.round(ny * grid.height);
  if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) return null;
  if (!grid.walkable[index(grid, x, y)]) return null;
  return { x, y };
}

export function nearestWalkablePixel(grid: WalkGrid, nx: number, ny: number, reach = 32): PlanPoint | null {
  const cx = Math.round(nx * grid.width);
  const cy = Math.round(ny * grid.height);
  if (cx >= 0 && cy >= 0 && cx < grid.width && cy < grid.height && grid.walkable[index(grid, cx, cy)]) {
    return { x: cx / grid.width, y: cy / grid.height };
  }
  let best: PlanPoint | null = null;
  let bestD = reach * reach + 1;
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
      if (!grid.walkable[index(grid, x, y)]) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = { x: x / grid.width, y: y / grid.height };
      }
    }
  }
  return best;
}

type Node = { x: number; y: number; g: number; f: number; parent: Node | null };

export function findPath(grid: WalkGrid, from: PlanPoint, to: PlanPoint): PlanPoint[] | null {
  const start = pixel(grid, from.x, from.y);
  const goal = pixel(grid, to.x, to.y);
  if (!start || !goal) return null;

  const w = grid.width;
  const h = grid.height;
  const goalI = index(grid, goal.x, goal.y);
  const open = new Map<number, Node>();
  const closed = new Uint8Array(w * h);

  const startNode: Node = { x: start.x, y: start.y, g: 0, f: 0, parent: null };
  startNode.f = Math.hypot(start.x - goal.x, start.y - goal.y);
  open.set(index(grid, start.x, start.y), startNode);

  const neighbors = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, 1.4],
    [1, -1, 1.4],
    [-1, 1, 1.4],
    [-1, -1, 1.4],
  ] as const;

  while (open.size > 0) {
    let current: Node | null = null;
    let currentKey = -1;
    for (const [key, node] of open) {
      if (!current || node.f < current.f) {
        current = node;
        currentKey = key;
      }
    }
    if (!current) break;
    open.delete(currentKey);
    const ci = index(grid, current.x, current.y);
    if (ci === goalI) {
      const path: PlanPoint[] = [];
      let walk: Node | null = current;
      while (walk) {
        path.push({ x: walk.x / w, y: walk.y / h });
        walk = walk.parent;
      }
      path.reverse();
      return simplifyPath(path);
    }
    closed[ci] = 1;
    for (const [dx, dy, cost] of neighbors) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = index(grid, nx, ny);
      if (closed[ni] || !grid.walkable[ni]) continue;
      const g = current.g + cost;
      const existing = open.get(ni);
      if (existing && g >= existing.g) continue;
      const node: Node = {
        x: nx,
        y: ny,
        g,
        f: g + Math.hypot(nx - goal.x, ny - goal.y),
        parent: current,
      };
      open.set(ni, node);
    }
  }
  return null;
}

function simplifyPath(path: PlanPoint[]): PlanPoint[] {
  if (path.length <= 2) return path;
  const out: PlanPoint[] = [path[0]];
  for (let i = 1; i < path.length - 1; i += 1) {
    const a = out[out.length - 1];
    const b = path[i];
    const c = path[i + 1];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const bcx = c.x - b.x;
    const bcy = c.y - b.y;
    const cross = Math.abs(abx * bcy - aby * bcx);
    if (cross > 1e-5) out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}

export function nextRoutePoint(route: PlanPoint[], pose: PlanPoint, minAhead = 0.02): PlanPoint | null {
  if (route.length === 0) return null;
  let best: PlanPoint | null = null;
  let bestDist = Infinity;
  for (const point of route) {
    const d = Math.hypot(point.x - pose.x, point.y - pose.y);
    if (d >= minAhead && d < bestDist) {
      bestDist = d;
      best = point;
    }
  }
  return best ?? route[route.length - 1];
}

export function bearing(from: PlanPoint, to: PlanPoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (deg < 0) deg += 360;
  return deg;
}
