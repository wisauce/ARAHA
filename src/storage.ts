import type { DoorFix, DoorLandmark, EncodedImage, FloorMap, NavDestination } from "./types";
import { emptyMap } from "./types";

const DB_NAME = "araha-indoor";
const STORE = "kv";
const PROJECT_KEY = "project-nav";

export type SavedProject = {
  floorPlan: EncodedImage | null;
  map: FloorMap;
  doors: DoorLandmark[];
  doorFix: DoorFix | null;
  destination: NavDestination | null;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open saved work."));
  });
}

export async function loadProject(): Promise<SavedProject | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).get(PROJECT_KEY);
    request.onsuccess = () => {
      const value = request.result as SavedProject | undefined;
      if (!value?.floorPlan) {
        resolve(null);
        return;
      }
      resolve({
        floorPlan: value.floorPlan,
        map: value.map ?? emptyMap(),
        doors: value.doors ?? [],
        doorFix: value.doorFix ?? null,
        destination: value.destination ?? null,
      });
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: SavedProject): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(project, PROJECT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearStoredProject(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(PROJECT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
