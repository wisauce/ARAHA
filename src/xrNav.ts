import * as THREE from "three";
import { bearing } from "./pathfind";
import type { PlanPoint } from "./walkable";

export async function xrNavSupported(): Promise<boolean> {
  if (!navigator.xr) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

export function xrErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotSupportedError") {
      return "AR is not supported on this device or browser. Use Chrome on Android over HTTPS.";
    }
    if (error.name === "NotAllowedError") {
      return "AR was blocked. Allow motion sensors and try again from a tap on “Arrow in the room”.";
    }
    if (error.message) return error.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return "Could not start AR.";
}

async function requestArSession(): Promise<XRSession> {
  if (!navigator.xr) throw new Error("WebXR is not available in this browser.");
  const base: XRSessionInit = { requiredFeatures: ["local"] };
  try {
    return await navigator.xr.requestSession("immersive-ar", base);
  } catch (first) {
    try {
      return await navigator.xr.requestSession("immersive-ar", {
        requiredFeatures: ["local-floor"],
      });
    } catch {
      throw first;
    }
  }
}

export async function runNavXr(route: PlanPoint[], pose: PlanPoint): Promise<void> {
  const session = await requestArSession();

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    zIndex: "9999",
    touchAction: "none",
  });
  document.body.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.xr.enabled = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
  scene.add(camera);

  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  scene.add(light);

  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x0b5f5a }),
  );
  shaft.position.z = -0.7;
  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.45, 16),
    new THREE.MeshStandardMaterial({ color: 0x0b5f5a }),
  );
  head.rotation.x = Math.PI / 2;
  head.position.z = -1.35;
  arrow.add(shaft, head);
  arrow.position.set(0, -0.4, -1.6);
  scene.add(arrow);

  const target = routeTarget(route, pose);
  let planHeading = target ? bearing(pose, target) : 0;
  let startYaw: number | null = null;

  function teardown() {
    renderer.setAnimationLoop(null);
    renderer.dispose();
    canvas.remove();
  }

  session.addEventListener("end", teardown, { once: true });

  try {
    await renderer.xr.setSession(session);
    const referenceSpace = await session.requestReferenceSpace("local");

    await new Promise<void>((resolve) => {
      session.addEventListener(
        "end",
        () => resolve(),
        { once: true },
      );

      renderer.setAnimationLoop((_time, frame) => {
        if (frame) {
          const viewer = frame.getViewerPose(referenceSpace);
          if (viewer) {
            const orient = new THREE.Quaternion(
              viewer.transform.orientation.x,
              viewer.transform.orientation.y,
              viewer.transform.orientation.z,
              viewer.transform.orientation.w,
            );
            const euler = new THREE.Euler().setFromQuaternion(orient, "YXZ");
            const yawDeg = (euler.y * 180) / Math.PI;
            if (startYaw == null) startYaw = yawDeg;

            const turn = normalizeDeg(planHeading - normalizeDeg(yawDeg - startYaw));
            arrow.rotation.y = (-turn * Math.PI) / 180;
          }
        }
        renderer.render(scene, camera);
      });
    });
  } catch (error) {
    teardown();
    try {
      await session.end();
    } catch {
      /* already ended */
    }
    throw error;
  }
}

function routeTarget(route: PlanPoint[], pose: PlanPoint): PlanPoint | null {
  for (const point of route) {
    if (Math.hypot(point.x - pose.x, point.y - pose.y) > 0.015) return point;
  }
  return route[route.length - 1] ?? null;
}

function normalizeDeg(value: number): number {
  let deg = value % 360;
  if (deg < 0) deg += 360;
  return deg;
}
