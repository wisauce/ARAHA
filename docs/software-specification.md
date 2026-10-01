# ARAHA software specification

Web app for indoor guidance. A QR code on a door fixes where you are. The walkable floor plan computes a route through empty space. Chrome on Android draws the next step as an arrow in the room.

This document specifies that product. The implementation stays in the existing Vite + React web app. There is no Android application.

## 1. Purpose

People get lost indoors because GPS is unreliable inside a building. ARAHA uses a floor-plan drawing as the map. Dark wall lines are blocked. Empty floor is walkable, and a gap between wall lines is a door, which is also walkable.

A printed QR code is stuck on a real door. Scanning it tells the phone which door this is and which way the person is facing. From that saved pose, the app finds a path across the walkable floor to a chosen destination and points along it.

Drift between doors is accepted. The next door scan replaces the saved pose. The uncorrected stretch is one room or one corridor, which is short enough for phone motion tracking.

## 2. Platform

| Item | Decision |
| --- | --- |
| Product form | One web app, served over HTTPS |
| Stack | The current app: Vite, React, TypeScript, no separate backend |
| Map and route | Any current desktop or phone browser |
| Camera QR scan | A phone browser with camera permission |
| Arrow locked in the room | WebXR immersive AR in Chrome on Android |
| Native Android app | Out of scope |
| iPhone world-locked arrow | Out of scope. The same site still shows the route on the plan |

Chrome on an iPhone uses the Apple browser engine, so it cannot hold an arrow in the room. Desktop Chrome has no room tracking. Those sessions use the on-plan route.

## 3. What already exists

The repository already does the map half:

- Loads `public/plans/jisik-2f-clean.jpg` as the 2층 plan (1024×1024).
- Builds a walkable grid from the image pixels. Ink darker than luma 168 is a wall. Pixels within 1.6px of a wall are blocked. Empty floor is walkable, including gaps. The page margin outside the building is not walkable.
- Draws that grid as a layer: green floor, red walls, gray outside.
- Can place a 360 photo on the middle of a detected room and match another photo to it. That photo flow is no longer the way a person fixes their position. Door QR codes replace it for guidance.

Room names are not required. Guidance uses doors and walkable pixels.

## 4. Concepts

**Wall.** A dark stroke on the plan. The walker cannot pass through it.

**Walkable floor.** Every other pixel inside the building, including a gap in a wall.

**Door.** A gap that has a QR landmark. The gap is already walkable. The QR gives the gap a stable id and a pose.

**Pose.** A position on the plan, in normalized coordinates (origin top-left, y downward), plus a heading in degrees (0 toward the top of the plan, 90 to the right).

**Fix.** The pose saved at the moment a door QR is scanned.

**Route.** A polyline of walkable pixels from the current pose to the destination.

**Arrow.** The direction from the current pose toward the next point on the route, a short distance ahead. In Chrome on Android this direction is drawn in the camera view and stays in the room. On other browsers it is drawn on the plan.

## 5. Users

**Author.** Prepares one building floor: confirms the plan image, marks each door gap, and prints the QR codes.

**Walker.** Opens the site on a phone, scans a door, picks where to go, and follows the arrow. Scanning another door on the way replaces the fix.

Both roles use the same site. Author tools can sit behind the existing editor. The walker view is a phone page.

## 6. Walker flow

1. Open the site on a phone. The 2층 plan is loaded. The walkable layer is on.
2. Tap **Scan door**. The camera opens. A QR library reads the code.
3. The app resolves the code to a door on this plan. It saves the fix: the point just inside the gap, on the side facing the camera, and the heading facing through the door into the building.
4. The walker taps a destination on walkable floor, or picks another door from a list.
5. The app runs pathfinding on the walkable grid and stores the route.
6. The plan shows the route. Chrome on Android also offers **Arrow in the room**, which starts a WebXR AR session and draws the arrow along the route.
7. While the walker moves, the phone updates the pose from the motion since the last fix. The route is reused until the pose leaves it or a new destination is chosen. A new door scan replaces the fix and the route is computed again.
8. Arrival is when the pose is within a small radius of the destination on the plan.

If the camera cannot see a QR, or the code is not one of this floor’s doors, the app leaves the previous fix in place and says the code was not recognized.

## 7. Author flow

1. Load the cleaned plan.
2. On each door gap, place one door landmark. The landmark stores an id, the gap’s center in plan coordinates, and the two approach points (one on each side of the wall).
3. The site renders a QR image for that id. The author prints it and sticks it on the physical door, on the face that matches one approach side. A door with two faces that both need a scan gets one code per face, each with its own side.
4. Saving the project stores the landmarks with the plan in IndexedDB, same as the current project save.

The author does not trace rooms and does not assign a photo per room for this guidance mode.

## 8. QR code

Each code payload is a URL on this site:

`https://<host>/door/<doorId>?side=<a|b>`

`doorId` matches a landmark on the loaded plan. `side` selects which approach point is the fix. Opening that URL on a phone that already has the plan skips typing an id: the page reads the path and applies the fix. The camera scanner accepts the same payload when it reads the code in the viewfinder.

The code is a landmark. It does not contain the route. The route is computed on the phone from the walkable grid.

## 9. Pose after the scan

At the scan, position is the approach point for that side. Heading is the direction from that point through the gap, into the walkable floor on the far side.

After the scan:

- In a WebXR AR session, the current pose is the fix composed with the XR pose delta since the session aligned to that fix.
- Outside WebXR, the current pose is the fix composed with device orientation for heading and a simple step displacement along that heading. This is only a guide on the plan.

The app does not run a second correction for drift between doors. The next successful door scan is the correction.

## 10. Pathfinding

The search space is the walkable grid already produced for the plan.

- Start: the walkable pixel nearest the current position.
- Goal: the walkable pixel nearest the destination.
- Blocked: wall pixels and outside pixels.
- Cost: distance in the plane. Diagonal steps are allowed.
- Result: a polyline simplified so the arrow does not twitch on every pixel.

If no path exists, the app says the destination cannot be reached from this door and leaves the walker at the current fix.

The route is recomputed when the fix changes or the destination changes. It is not recomputed on every small pose update.

## 11. Arrow

**On the plan.** A line follows the route. A mark shows the current pose and heading. This view exists in every browser.

**In the room.** Available when `navigator.xr` offers `immersive-ar`, which on phones means Chrome on Android. The session shows the camera. An arrow is placed in front of the walker, on the floor plane, pointing at a target point a few meters along the route. As WebXR updates the viewer pose, the arrow stays aimed along the route. Ending the session returns to the plan.

The arrow never passes through a wall: its target is always the next route point that is still ahead of the current pose.

## 12. Functional requirements

1. The walker can load the cleaned 2층 plan and see walls, walkable floor, and outside.
2. The author can place a door landmark on a gap and export a QR image for each side that needs a scan.
3. The walker can scan that QR with the phone camera, or open the door URL, and get a saved fix.
4. An unknown code does not move the fix.
5. The walker can choose a destination on walkable floor.
6. The app computes a route that stays on walkable pixels and shows it on the plan.
7. Chrome on Android can show the same route as an arrow in the camera view via WebXR.
8. A later scan of another door on this floor replaces the fix and refreshes the route.
9. The plan, landmarks, and last fix persist in the browser.
10. The site remains a web app. It does not install an Android package.

## 13. Data kept in the browser

IndexedDB keeps the project, extended with door landmarks and the last fix. No account server is required for this version.

**Door landmark**

- `id`
- `name` (short label for the list, such as “North door”)
- `gap`: point on the plan at the middle of the opening
- `sideA`, `sideB`: approach points on the walkable floor
- `headingA`, `headingB`: heading into the floor from that side

**Fix**

- `doorId`
- `side`
- `x`, `y`, `heading`
- `scannedAt`

**Destination**

- `x`, `y` on the plan, or a `doorId` plus `side` whose approach point is the goal

Photos and room polygons are not part of this guidance model.

## 14. Acceptance

- On the cleaned plan, a gap reads as walkable and the wall strokes read as blocked.
- A QR generated for a marked door, when scanned, places the walker on that door’s approach point with a heading into the floor.
- A route from that point to a tapped walkable destination does not cross a wall.
- In Chrome on Android, the AR session shows an arrow aimed along that route, and leaving the session returns to the plan with the same route.
- In a browser without WebXR, the route is still visible on the plan.
- Scanning a second door moves the fix to that door.

## 15. Out of scope

- A native Android or iOS app
- A world-locked arrow on iPhone
- Room names, room polygons, and 360 photos as the location method
- Correcting drift in the middle of a corridor
- GPS, Wi-Fi, or Bluetooth beacons
- Multi-floor routing
- Accounts, cloud sync, and sharing a building with other people
