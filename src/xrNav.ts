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

export async function runNavXr(route: PlanPoint[], pose: PlanPoint): Promise<void> {
  if (!navigator.xr) throw new Error("WebXR is not available in this browser.");
  const session = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["local"],
    optionalFeatures: ["dom-overlay"],
    domOverlay: { root: document.body },
  });

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", { xrCompatible: true });
  if (!gl) throw new Error("Could not start AR rendering.");

  const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true });
  renderer.xr.enabled = true;
  renderer.setAnimationLoop(null);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  scene.add(camera);

  const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  scene.add(light);

  const arrow = new THREE.Group();
  const shaft = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x0b5f5a }),
  );
  shaft.position.z = -0.7;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.45, 16), new THREE.MeshStandardMaterial({ color: 0x0b5f5a }));
  head.rotation.x = Math.PI / 2;
  head.position.z = -1.35;
  arrow.add(shaft, head);
  arrow.position.set(0, -0.4, -1.6);
  scene.add(arrow);

  const target = routeTarget(route, pose);
  let planHeading = target ? bearing(pose, target) : 0;
  let startYaw: number | null = null;

  await new Promise<void>((resolve) => {
    session.addEventListener(
      "end",
      () => {
        renderer.setAnimationLoop(null);
        resolve();
      },
      { once: true },
    );

    renderer.setAnimationLoop((_time, frame) => {
      if (!frame) return;
      const ref = renderer.xr.getReferenceSpace();
      if (!ref) return;
      const viewer = frame.getViewerPose(ref);
      if (!viewer) return;

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

      renderer.render(scene, camera);
    });

    void renderer.xr.setReferenceSpaceType("local");
    void renderer.xr.setSession(session);
  });
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
