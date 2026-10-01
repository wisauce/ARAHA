import type { EncodedImage } from "./types";

function drawFitted(file: File, maxEdge: number): Promise<{ canvas: HTMLCanvasElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!context) {
        reject(new Error("Could not read the image."));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve({ canvas, width, height });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image file."));
    };
    image.src = url;
  });
}

export async function encodeFloorPlan(file: File): Promise<EncodedImage> {
  const { canvas, width, height } = await drawFitted(file, 1800);
  const png = canvas.toDataURL("image/png");
  if (png.length < 3_500_000) return { dataUrl: png, width, height };
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.88), width, height };
}

export async function encodePhoto(file: File): Promise<EncodedImage> {
  const { canvas, width, height } = await drawFitted(file, 1024);
  return { dataUrl: canvas.toDataURL("image/jpeg", 0.76), width, height };
}
