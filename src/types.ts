export type Point = [number, number];

export const ROOM_KINDS = [
  ["room", "Room"],
  ["corridor", "Corridor"],
  ["lobby", "Lobby"],
  ["restroom", "Restroom"],
  ["stairs", "Stairs"],
  ["elevator", "Elevator"],
  ["outdoor", "Outdoor"],
  ["other", "Other"],
] as const;

export const OBJECT_KINDS = [
  ["door", "Door"],
  ["window", "Window"],
  ["stairs", "Stairs"],
  ["elevator", "Elevator"],
  ["furniture", "Furniture"],
  ["column", "Column"],
  ["fixture", "Fixture"],
  ["other", "Other"],
] as const;

export type RoomKind = (typeof ROOM_KINDS)[number][0];
export type ObjectKind = (typeof OBJECT_KINDS)[number][0];

export type Room = {
  id: string;
  name: string;
  kind: RoomKind;
  polygon: Point[];
  uncertain: boolean;
};

export type MapObject = {
  id: string;
  name: string;
  kind: ObjectKind;
  polygon: Point[];
  uncertain: boolean;
};

export type MapLabel = {
  id: string;
  text: string;
  x: number;
  y: number;
};

export type FloorMap = {
  summary: string;
  rooms: Room[];
  objects: MapObject[];
  labels: MapLabel[];
};

export type EncodedImage = {
  dataUrl: string;
  width: number;
  height: number;
};

export type ReferencePhoto = {
  id: string;
  name: string;
  imageDataUrl: string;
  x: number | null;
  y: number | null;
  heading: number;
};

export type LocateResult = {
  referenceId: string | null;
  referenceName: string;
  confidence: number;
  reason: string;
  x: number;
  y: number;
  heading: number;
  weak: boolean;
};

export type Tool = "select" | "door";
export type StepId = "plan" | "doors" | "navigate";

export type DoorSide = "a" | "b";

export type DoorLandmark = {
  id: string;
  name: string;
  gap: { x: number; y: number };
  sideA: { x: number; y: number };
  sideB: { x: number; y: number };
  headingA: number;
  headingB: number;
};

export type DoorFix = {
  doorId: string;
  side: DoorSide;
  x: number;
  y: number;
  heading: number;
  scannedAt: number;
};

export type NavDestination =
  | { kind: "point"; x: number; y: number }
  | { kind: "door"; doorId: string; side: DoorSide };

export function emptyMap(): FloorMap {
  return { summary: "", rooms: [], objects: [], labels: [] };
}

export const MODEL_NAME = "glm-5.3-flash";
