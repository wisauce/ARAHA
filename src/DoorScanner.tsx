import jsQR from "jsqr";
import { useEffect, useRef, useState } from "react";
import { parseDoorUrl } from "./doors";
import type { DoorSide } from "./types";

type Props = {
  open: boolean;
  onClose: () => void;
  onScan: (doorId: string, side: DoorSide) => void;
  onUnknown: (reason: "unreadable") => void;
};

export function DoorScanner({ open, onClose, onScan, onUnknown }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setError(null);

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        tick();
      } catch {
        setError("Camera access is needed to scan a door QR code.");
      }
    }

    function tick() {
      if (cancelled) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState >= 2) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w > 0 && h > 0) {
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h);
            const data = ctx.getImageData(0, 0, w, h);
            const code = jsQR(data.data, w, h, { inversionAttempts: "dontInvert" });
            if (code?.data) {
              const parsed = parseDoorUrl(code.data);
              if (parsed) {
                onScan(parsed.doorId, parsed.side);
                onClose();
                return;
              }
              onUnknown("unreadable");
            }
          }
        }
      }
      rafRef.current = window.requestAnimationFrame(tick);
    }

    void start();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onClose, onScan, onUnknown]);

  if (!open) return null;

  return (
    <div className="scanner-backdrop" role="dialog" aria-label="Scan door QR">
      <div className="scanner-card">
        <p className="scanner-title">Point the camera at the door QR code</p>
        {error ? (
          <p className="banner">{error}</p>
        ) : (
          <video ref={videoRef} className="scanner-video" playsInline muted />
        )}
        <canvas ref={canvasRef} className="hidden-file" aria-hidden />
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
