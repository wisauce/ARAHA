import QRCode from "qrcode";
import { doorUrl } from "./doors";
import type { DoorSide } from "./types";

export async function qrDataUrl(doorId: string, side: DoorSide): Promise<string> {
  const url = doorUrl(doorId, side);
  return QRCode.toDataURL(url, { margin: 1, width: 280, errorCorrectionLevel: "M" });
}
