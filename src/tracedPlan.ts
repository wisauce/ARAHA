import type { FloorMap } from "./types";

export const JISIK_PLAN_IMAGE = {
  dataUrl: "/plans/jisik-2f-clean.jpg?v=3",
  width: 1024,
  height: 1024,
};

export function createJisikFloorMap(): FloorMap {
  return {
    summary: "Walls block movement. Empty floor, including a gap between lines, is walkable.",
    rooms: [],
    objects: [],
    labels: [],
  };
}
