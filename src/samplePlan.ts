import type { EncodedImage } from "./types";

function strokeLine(context: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function label(context: CanvasRenderingContext2D, text: string, x: number, y: number, size = 28) {
  context.font = `600 ${size}px "Segoe UI", sans-serif`;
  context.fillStyle = "#1e2430";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x, y);
}

export function createSampleFloorPlan(): EncodedImage {
  const width = 1000;
  const height = 700;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not draw the sample plan.");

  context.fillStyle = "#f6f1e6";
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "#1e2430";
  context.lineWidth = 7;
  context.lineJoin = "miter";

  strokeLine(context, 48, 48, 952, 48);
  strokeLine(context, 952, 48, 952, 652);
  strokeLine(context, 952, 652, 48, 652);
  strokeLine(context, 48, 652, 48, 430);
  strokeLine(context, 48, 360, 48, 48);

  strokeLine(context, 300, 48, 300, 300);
  strokeLine(context, 300, 400, 300, 652);
  strokeLine(context, 300, 300, 470, 300);
  strokeLine(context, 560, 300, 952, 300);
  strokeLine(context, 300, 400, 952, 400);
  strokeLine(context, 620, 48, 620, 300);
  strokeLine(context, 680, 400, 680, 652);

  context.lineWidth = 4;
  context.strokeStyle = "#5c6b7a";
  for (let step = 0; step < 8; step += 1) {
    const y = 450 + step * 22;
    strokeLine(context, 710, y, 922, y);
  }
  context.strokeStyle = "#1e2430";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(48, 395, 34, -Math.PI / 2, 0);
  context.stroke();

  label(context, "Lobby", 174, 470);
  label(context, "WC", 130, 130, 24);
  context.strokeRect(78, 78, 150, 130);
  label(context, "Office A", 460, 170);
  label(context, "A-101", 460, 206, 18);
  label(context, "Office B", 786, 170);
  label(context, "A-102", 786, 206, 18);
  label(context, "Hall", 626, 350, 22);
  label(context, "Meeting", 490, 520);
  label(context, "Stairs", 816, 500);

  context.font = `500 16px "Segoe UI", sans-serif`;
  context.fillStyle = "#5c6b7a";
  context.textAlign = "left";
  context.fillText("Sample floor", 48, 684);

  return { dataUrl: canvas.toDataURL("image/jpeg", 0.9), width, height };
}
