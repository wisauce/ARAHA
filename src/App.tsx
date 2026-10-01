import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { DoorScanner } from "./DoorScanner";
import {
  createDoorAt,
  destinationPoint,
  fixFromDoor,
  parseDoorUrl,
  normalizeDoors,
  suggestDoors,
} from "./doors";
import { encodeFloorPlan } from "./image";
import { MapStage } from "./MapStage";
import { findPath, nearestWalkablePixel } from "./pathfind";
import { qrDataUrl } from "./qr";
import { createSampleFloorPlan } from "./samplePlan";
import { createJisikFloorMap, JISIK_PLAN_IMAGE } from "./tracedPlan";
import { clearStoredProject, loadProject, saveProject } from "./storage";
import { emptyMap } from "./types";
import type {
  DoorFix,
  DoorLandmark,
  DoorSide,
  EncodedImage,
  FloorMap,
  NavDestination,
  StepId,
} from "./types";
import { useNavPose } from "./useNavPose";
import { buildWalkGrid } from "./walkable";
import type { WalkGrid } from "./walkable";
import { xrNavSupported, runNavXr } from "./xrNav";

export function App() {
  const [step, setStep] = useState<StepId>("plan");
  const [floorPlan, setFloorPlan] = useState<EncodedImage | null>(null);
  const [map, setMap] = useState<FloorMap>(emptyMap);
  const [doors, setDoors] = useState<DoorLandmark[]>([]);
  const [doorFix, setDoorFix] = useState<DoorFix | null>(null);
  const [destination, setDestination] = useState<NavDestination | null>(null);
  const [selectedDoorId, setSelectedDoorId] = useState<string | null>(null);
  const [showWalk, setShowWalk] = useState(true);
  const [walk, setWalk] = useState<WalkGrid | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [xrReady, setXrReady] = useState(false);
  const [addingDoor, setAddingDoor] = useState(false);

  const planInput = useRef<HTMLInputElement>(null);
  const navPose = useNavPose(doorFix);

  useEffect(() => {
    let cancelled = false;
    loadProject()
      .then((project) => {
        if (cancelled) return;
        if (project?.floorPlan) {
          setFloorPlan(project.floorPlan);
          setMap(project.map ?? emptyMap());
          setDoors(project.doors ?? []);
          setDoorFix(project.doorFix);
          setDestination(project.destination);
        } else {
          setFloorPlan(JISIK_PLAN_IMAGE);
          setMap(createJisikFloorMap());
        }
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!floorPlan) {
      setWalk(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setWalk(buildWalkGrid(image));
    };
    image.onerror = () => {
      if (!cancelled) setWalk(null);
    };
    image.src = floorPlan.dataUrl;
    return () => {
      cancelled = true;
    };
  }, [floorPlan]);

  useEffect(() => {
    if (!hydrated || !walk || doors.length > 0) return;
    setDoors(suggestDoors(walk));
  }, [hydrated, walk, doors.length]);

  useEffect(() => {
    if (!hydrated || !walk || doors.length === 0) return;
    if (!doors.some((d) => !/^gap-\d+-\d+$/.test(d.id))) return;
    setDoors(normalizeDoors(walk, doors));
  }, [hydrated, walk, doors]);



  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      saveProject({ floorPlan, map, doors, doorFix, destination }).catch(() => undefined);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [hydrated, floorPlan, map, doors, doorFix, destination]);

  useEffect(() => {
    void xrNavSupported().then(setXrReady);
  }, []);

  useEffect(() => {
    if (!hydrated || doors.length === 0) return;
    const parsed = parseDoorUrl(window.location.href);
    if (!parsed) return;
    const door = doors.find((item) => item.id === parsed.doorId);
    if (!door) {
      setError("No matching door on this plan. Open this site at your live URL, go to Doors, and print a new QR (old codes used random ids).");
      return;
    }
    applyDoorFix(door, parsed.side);
    window.history.replaceState({}, "", window.location.pathname.replace(/\/door\/[^/]+\/?$/, "") || "/");
  }, [hydrated, doors]);

  const route = useMemo(() => {
    if (!walk || !doorFix || !destination) return null;
    const goal = destinationPoint(walk, destination, doors);
    if (!goal) return null;
    return findPath(walk, { x: doorFix.x, y: doorFix.y }, goal);
  }, [walk, doorFix, destination, doors]);

  useEffect(() => {
    if (destination && route === null && walk && doorFix) {
      setError("No walkable route to that destination from this door.");
    }
  }, [route, destination, walk, doorFix]);

  function applyDoorFix(door: DoorLandmark, side: DoorSide) {
    const fix = fixFromDoor(door, side);
    setDoorFix(fix);
    setError(null);
    setStep("navigate");
  }

  function onDoorScan(doorId: string, side: DoorSide) {
    const door = doors.find((item) => item.id === doorId);
    if (!door) {
      setError("No matching door on this plan. Open this site at your live URL, go to Doors, and print a new QR (old codes used random ids).");
      return;
    }
    applyDoorFix(door, side);
  }

  function replacePlan(encoded: EncodedImage, nextMap: FloorMap) {
    if (floorPlan && !window.confirm("Replace the floor plan? Doors and navigation will be cleared.")) return;
    setFloorPlan(encoded);
    setMap(nextMap);
    setDoors([]);
    setDoorFix(null);
    setDestination(null);
    setSelectedDoorId(null);
    setError(null);
  }

  function loadTracedPlan() {
    replacePlan(JISIK_PLAN_IMAGE, createJisikFloorMap());
  }

  async function onFloorFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      replacePlan(await encodeFloorPlan(file), emptyMap());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read the floor plan.");
    }
  }

  async function showQr(doorId: string, side: DoorSide) {
    try {
      setQrPreview(await qrDataUrl(doorId, side));
    } catch {
      setError("Could not render the QR code.");
    }
  }

  async function clearWork() {
    if (!window.confirm("Clear the saved floor plan, doors, and navigation from this browser?")) return;
    await clearStoredProject().catch(() => undefined);
    setFloorPlan(null);
    setMap(emptyMap());
    setDoors([]);
    setDoorFix(null);
    setDestination(null);
    setStep("navigate");
  }

  function onNavigateTap(x: number, y: number) {
    if (!walk) return;
    const point = nearestWalkablePixel(walk, x, y);
    if (!point) {
      setError("Tap walkable floor to set a destination.");
      return;
    }
    setDestination({ kind: "point", x: point.x, y: point.y });
    setError(null);
  }

  function onAddDoorTap(x: number, y: number) {
    if (!walk) return;
    const door = createDoorAt(walk, x, y, `Door ${doors.length + 1}`);
    if (!door) {
      setError("Tap a doorway gap on the plan.");
      return;
    }
    setDoors((current) => [...current, door]);
    setSelectedDoorId(door.id);
    setError(null);
  }

  const activeDoor = doors.find((door) => door.id === selectedDoorId) ?? null;
  const pose = navPose ?? (doorFix ? { x: doorFix.x, y: doorFix.y, heading: doorFix.heading } : null);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <p className="brand-mark">ARAHA</p>
          <p className="brand-sub">Indoor navigation</p>
        </div>
      </header>

      <nav className="steps" aria-label="Steps">
        {(
          [
            ["plan", "Floor plan"],
            ["doors", "Doors"],
            ["navigate", "Navigate"],
          ] as const
        ).map(([id, label], index) => (
          <button
            key={id}
            type="button"
            className={step === id ? "step active" : "step"}
            aria-current={step === id ? "step" : undefined}
            disabled={id !== "plan" && !floorPlan}
            onClick={() => setStep(id)}
          >
            <span>{index + 1}</span>
            {label}
          </button>
        ))}
      </nav>

      {error && (
        <p className="banner" role="alert">
          {error}
        </p>
      )}

      <div className="layout">
        <section className="map-column">
          <div className="map-card">
            {floorPlan ? (
              <MapStage
                image={floorPlan}
                map={map}
                mode={step === "doors" ? "doors" : step === "navigate" ? "navigate" : "view"}
                walkOverlay={showWalk ? walk?.overlayUrl ?? null : null}
                doors={doors}
                selectedDoorId={selectedDoorId}
                route={route}
                navPose={pose}
                destination={
                  destination?.kind === "point" ? { x: destination.x, y: destination.y } : null
                }
                onSelectDoor={setSelectedDoorId}
                onAddDoor={addingDoor ? onAddDoorTap : undefined}
                onNavigateTap={step === "navigate" ? onNavigateTap : undefined}
              />
            ) : (
              <div className="empty">
                <p>Load the cleaned 2층 plan to start.</p>
                <div className="actions">
                  <button type="button" className="primary" onClick={loadTracedPlan}>
                    Load cleaned 2F plan
                  </button>
                  <button type="button" className="ghost" onClick={() => planInput.current?.click()}>
                    Upload floor plan
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="legend">
            <span><i className="swatch door" /> Door</span>
            <span><i className="swatch route" /> Route</span>
            <span><i className="swatch you" /> You</span>
            <span><i className="swatch walk" /> Walkable</span>
            <span><i className="swatch wall" /> Wall</span>
          </div>
        </section>

        <aside className="panel">
          {step === "plan" && (
            <>
              <h2>Floor plan</h2>
              <p className="lead">Walls block movement. A gap between lines is walkable floor, including a door opening.</p>
              <div className="actions">
                <button type="button" className="primary" onClick={loadTracedPlan}>
                  Load cleaned 2F plan
                </button>
                <button type="button" className="ghost" onClick={() => planInput.current?.click()}>
                  {floorPlan ? "Replace floor plan" : "Upload floor plan"}
                </button>
                {!floorPlan && (
                  <button type="button" className="ghost" onClick={() => replacePlan(createSampleFloorPlan(), emptyMap())}>
                    Load sample plan
                  </button>
                )}
              </div>
              {floorPlan && (
                <button
                  type="button"
                  className={showWalk ? "tool active" : "tool"}
                  aria-pressed={showWalk}
                  onClick={() => setShowWalk((value) => !value)}
                >
                  {showWalk ? "Hide walkable layer" : "Show walkable layer"}
                </button>
              )}
            </>
          )}

          {step === "doors" && floorPlan && (
            <>
              <h2>Doors</h2>
              <p className="lead">Each door gets a QR code on each side that needs a scan. Print the code and stick it on the door.</p>
              <div className="actions inline">
                <button
                  type="button"
                  className={addingDoor ? "tool active" : "tool"}
                  aria-pressed={addingDoor}
                  onClick={() => setAddingDoor((value) => !value)}
                >
                  {addingDoor ? "Cancel add door" : "Add door on plan"}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={!walk}
                  onClick={() => walk && setDoors(suggestDoors(walk))}
                >
                  Auto-detect doors
                </button>
              </div>
              <p className="meta">{doors.length} doors</p>
              <ul className="photo-list">
                {doors.map((door) => (
                  <li key={door.id}>
                    <button
                      type="button"
                      className={door.id === selectedDoorId ? "photo-row active" : "photo-row"}
                      onClick={() => setSelectedDoorId(door.id)}
                    >
                      <span>
                        <strong>{door.name}</strong>
                        <small>Door landmark</small>
                      </span>
                    </button>
                    <button type="button" className="danger tiny" onClick={() => setDoors((list) => list.filter((d) => d.id !== door.id))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              {activeDoor && (
                <div className="fields">
                  <label>
                    Name
                    <input
                      value={activeDoor.name}
                      onChange={(event) =>
                        setDoors((list) =>
                          list.map((door) => (door.id === activeDoor.id ? { ...door, name: event.target.value } : door)),
                        )
                      }
                    />
                  </label>
                  <div className="actions inline">
                    <button type="button" className="tool" onClick={() => void showQr(activeDoor.id, "a")}>
                      QR side A
                    </button>
                    <button type="button" className="tool" onClick={() => void showQr(activeDoor.id, "b")}>
                      QR side B
                    </button>
                  </div>
                </div>
              )}
              {qrPreview && (
                <div className="qr-preview">
                  <img src={qrPreview} alt="Door QR code" />
                  <button type="button" className="ghost" onClick={() => setQrPreview(null)}>
                    Close
                  </button>
                </div>
              )}
            </>
          )}

          {step === "navigate" && floorPlan && (
            <>
              <h2>Navigate</h2>
              <p className="lead">Scan a door QR to save your place, then tap a destination on walkable floor.</p>
              <button type="button" className="primary" onClick={() => setScannerOpen(true)}>
                Scan door
              </button>
              {doorFix && (
                <p className="meta">
                  Fixed at {doors.find((d) => d.id === doorFix.doorId)?.name ?? "door"} · side {doorFix.side.toUpperCase()}
                </p>
              )}
              <div className="actions inline">
                <button
                  type="button"
                  className="ghost"
                  disabled={!route || !pose || !xrReady}
                  onClick={() => route && pose && void runNavXr(route, pose).catch(() => setError("Could not start AR."))}
                >
                  Arrow in the room
                </button>
              </div>
              {!xrReady && <p className="hint">Arrow in the room needs Chrome on Android with WebXR.</p>}
              <h3>Or pick a door</h3>
              <ul className="photo-list">
                {doors.map((door) => (
                  <li key={door.id}>
                    <button
                      type="button"
                      className="entity"
                      onClick={() => setDestination({ kind: "door", doorId: door.id, side: "a" })}
                    >
                      <strong>{door.name}</strong>
                      <small>Go to this door</small>
                    </button>
                  </li>
                ))}
              </ul>
              {route && destination && (
                <p className="summary">Route ready · {route.length} segments on walkable floor.</p>
              )}
            </>
          )}

          <button type="button" className="danger tiny" onClick={() => void clearWork()}>
            Clear saved work
          </button>
        </aside>
      </div>

      <DoorScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={onDoorScan}
        onUnknown={(reason) =>
          setError(
            reason === "unreadable"
              ? "That scan is not a door link. Use a QR from the Doors step on this site."
              : "No matching door on this plan. Regenerate the QR from Doors on this URL.",
          )
        }
      />

      <input ref={planInput} className="hidden-file" type="file" accept="image/*" onChange={(event) => void onFloorFile(event)} />
    </div>
  );
}
