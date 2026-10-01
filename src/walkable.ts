export type WalkGrid = {
  width: number;
  height: number;
  walkable: Uint8Array;
  dist: Float32Array;
  core: Int16Array;
  centers: PlanPoint[];
  overlayUrl: string;
};

export type PlanPoint = { x: number; y: number };

const WALL_LUMA = 168;
const WALL_PAD = 1.6;
const DOOR_SEAL = 22;

function luma(r: number, g: number, b: number): number {
  return (r * 3 + g * 4 + b) >> 3;
}

function distanceToWall(wall: Uint8Array, width: number, height: number): Float32Array {
  const dist = new Float32Array(width * height);
  dist.fill(1e6);
  for (let i = 0; i < wall.length; i += 1) {
    if (wall[i]) dist[i] = 0;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      let best = dist[i];
      if (x > 0) best = Math.min(best, dist[i - 1] + 1);
      if (y > 0) best = Math.min(best, dist[i - width] + 1);
      if (x > 0 && y > 0) best = Math.min(best, dist[i - width - 1] + 1.4);
      if (x + 1 < width && y > 0) best = Math.min(best, dist[i - width + 1] + 1.4);
      dist[i] = best;
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      let best = dist[i];
      if (x + 1 < width) best = Math.min(best, dist[i + 1] + 1);
      if (y + 1 < height) best = Math.min(best, dist[i + width] + 1);
      if (x + 1 < width && y + 1 < height) best = Math.min(best, dist[i + width + 1] + 1.4);
      if (x > 0 && y + 1 < height) best = Math.min(best, dist[i + width - 1] + 1.4);
      dist[i] = best;
    }
  }
  return dist;
}

function flood(width: number, height: number, canEnter: (index: number) => boolean): Uint8Array {
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const push = (index: number) => {
    if (index < 0 || index >= seen.length || seen[index] || !canEnter(index)) return;
    seen[index] = 1;
    queue[tail] = index;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head];
    head += 1;
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x + 1 < width) push(i + 1);
    if (i >= width) push(i - width);
    if (i + width < seen.length) push(i + width);
  }
  return seen;
}

function outsideMask(dist: Float32Array, width: number, height: number): Uint8Array {
  const far = flood(width, height, (index) => dist[index] > DOOR_SEAL);
  const outside = new Uint8Array(far);
  const queue = new Int32Array(width * height);
  let tail = 0;
  for (let i = 0; i < far.length; i += 1) {
    if (far[i]) queue[tail++] = i;
  }
  let head = 0;
  while (head < tail) {
    const i = queue[head];
    head += 1;
    const x = i % width;
    const neighbors = [i - 1, i + 1, i - width, i + width];
    for (const n of neighbors) {
      if (n < 0 || n >= outside.length || outside[n]) continue;
      if ((n === i - 1 && x === 0) || (n === i + 1 && x === width - 1)) continue;
      if (dist[n] <= WALL_PAD || dist[n] > DOOR_SEAL) continue;
      outside[n] = 1;
      queue[tail] = n;
      tail += 1;
    }
  }
  return outside;
}

export function buildWalkGrid(image: HTMLImageElement): WalkGrid {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Could not read the floor plan.");
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const wall = new Uint8Array(width * height);
  for (let i = 0; i < wall.length; i += 1) {
    const offset = i * 4;
    if (luma(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < WALL_LUMA) wall[i] = 1;
  }
  const dist = distanceToWall(wall, width, height);
  const outside = outsideMask(dist, width, height);
  const walkable = new Uint8Array(width * height);
  const overlay = context.createImageData(width, height);
  for (let i = 0; i < walkable.length; i += 1) {
    const offset = i * 4;
    const blocked = dist[i] <= WALL_PAD;
    if (!blocked && !outside[i]) {
      walkable[i] = 1;
      overlay.data[offset] = 46;
      overlay.data[offset + 1] = 168;
      overlay.data[offset + 2] = 96;
      overlay.data[offset + 3] = 92;
    } else if (blocked) {
      overlay.data[offset] = 176;
      overlay.data[offset + 1] = 48;
      overlay.data[offset + 2] = 40;
      overlay.data[offset + 3] = 150;
    } else {
      overlay.data[offset] = 72;
      overlay.data[offset + 1] = 64;
      overlay.data[offset + 2] = 58;
      overlay.data[offset + 3] = 70;
    }
  }
  context.putImageData(overlay, 0, 0);
  const { core, centers } = roomCores(wall, dist, outside, width, height);
  return { width, height, walkable, dist, core, centers, overlayUrl: canvas.toDataURL("image/png") };
}

function dropSmallWalls(wall: Uint8Array, width: number, minArea: number): Uint8Array {
  const seen = new Uint8Array(wall.length);
  const kept = new Uint8Array(wall.length);
  const queue = new Int32Array(wall.length);
  for (let start = 0; start < wall.length; start += 1) {
    if (!wall[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      const x = i % width;
      const neighbors = [i - 1, i + 1, i - width, i + width, i - width - 1, i - width + 1, i + width - 1, i + width + 1];
      for (const n of neighbors) {
        if (n < 0 || n >= wall.length || seen[n] || !wall[n]) continue;
        const nx = n % width;
        if (Math.abs(nx - x) > 1) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    if (tail >= minArea) {
      for (let k = 0; k < tail; k += 1) kept[queue[k]] = 1;
    }
  }
  return kept;
}

function roomCores(wall: Uint8Array, fullDist: Float32Array, outside: Uint8Array, width: number, height: number): { core: Int16Array; centers: PlanPoint[] } {
  const structural = dropSmallWalls(wall, width, 220);
  const dist = distanceToWall(structural, width, height);
  const core = new Int16Array(wall.length);
  const centers: PlanPoint[] = [];
  const seen = new Uint8Array(wall.length);
  const queue = new Int32Array(wall.length);
  for (let start = 0; start < wall.length; start += 1) {
    if (seen[start] || outside[start] || dist[start] < 14 || fullDist[start] <= WALL_PAD) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const i = queue[head++];
      const x = i % width;
      const neighbors = [i - 1, i + 1, i - width, i + width];
      for (const n of neighbors) {
        if (n < 0 || n >= wall.length || seen[n] || outside[n] || dist[n] < 14 || fullDist[n] <= WALL_PAD) continue;
        if ((n === i - 1 && x === 0) || (n === i + 1 && x === width - 1)) continue;
        seen[n] = 1;
        queue[tail++] = n;
      }
    }
    if (tail < 400) continue;
    const id = centers.length + 1;
    if (id > 32767) break;
    let peak = 0;
    for (let k = 0; k < tail; k += 1) {
      core[queue[k]] = id;
      if (dist[queue[k]] > peak) peak = dist[queue[k]];
    }
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    for (let k = 0; k < tail; k += 1) {
      const i = queue[k];
      if (dist[i] < peak - 1.5) continue;
      count += 1;
      sumX += i % width;
      sumY += Math.floor(i / width);
    }
    centers.push({ x: sumX / count / width, y: sumY / count / height });
  }
  return { core, centers };
}

function nearestCore(grid: WalkGrid, x: number, y: number, reach: number): number {
  const { width, height, core } = grid;
  const index = y * width + x;
  if (x >= 0 && y >= 0 && x < width && y < height && core[index]) return core[index];
  let best = 0;
  let bestDist = reach * reach + 1;
  const x0 = Math.max(0, x - reach);
  const x1 = Math.min(width - 1, x + reach);
  const y0 = Math.max(0, y - reach);
  const y1 = Math.min(height - 1, y + reach);
  for (let yy = y0; yy <= y1; yy += 1) {
    for (let xx = x0; xx <= x1; xx += 1) {
      const id = core[yy * width + xx];
      if (!id) continue;
      const d = (xx - x) * (xx - x) + (yy - y) * (yy - y);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
  }
  return best;
}

export function roomMiddle(grid: WalkGrid, x: number, y: number): PlanPoint | null {
  const id = nearestCore(grid, Math.round(x * grid.width), Math.round(y * grid.height), 48);
  if (!id) return null;
  return grid.centers[id - 1] ?? null;
}

export function roomMiddles(grid: WalkGrid): PlanPoint[] {
  return grid.centers;
}
