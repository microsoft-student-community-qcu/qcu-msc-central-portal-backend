/**
 * QR image generation (shared V2 utility).
 *
 * Renders an arbitrary payload string to a PNG QR code, uploads it to Azure
 * Blob Storage (merch container), and returns the public URL. Email clients
 * (Gmail in particular) strip inline base64 `data:` image URIs, so tickets and
 * receipts must reference a hosted URL rather than an embedded data URI.
 *
 * Introduced for Module 04 (merch) but written generically so Module 02
 * (event QR tickets, assigned to @Sanik0) can import it instead of adding a
 * second QR implementation. If Module 02 needs a dedicated container, add a
 * `container` parameter rather than forking this helper.
 */

import QRCode from "qrcode";
import { randomUUID } from "node:crypto";
import { saveMerchImage, getMerchImagePath } from "./imageStorage";

export interface QrImageOptions {
  /** Blob filename (without extension). Defaults to a random UUID. */
  filenameHint?: string;
  /** QR module size in pixels. Defaults to 320. */
  width?: number;
}

/**
 * Render `payload` to a PNG QR code and return a `{ url, filename }` pair.
 * The PNG is stored in the merch Blob container.
 */
export async function generateQrImage(
  payload: string,
  options: QrImageOptions = {}
): Promise<{ url: string; filename: string }> {
  const width = options.width ?? 320;

  // toBuffer with type "png" yields a raw PNG we can push straight to Blob.
  const buffer = await QRCode.toBuffer(payload, {
    type: "png",
    width,
    margin: 2,
    errorCorrectionLevel: "M",
  });

  const safeHint = (options.filenameHint ?? randomUUID())
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .slice(0, 80);
  const filename = `qr-${safeHint}.png`;

  const url = await saveMerchImage(buffer, filename, "image/png");
  return { url, filename };
}

/** Resolve the public URL of a previously generated QR image by filename. */
export function getQrImageUrl(filename: string): string {
  return getMerchImagePath(filename);
}

/** Render a QR code as a base64 data URI (useful for synchronous API responses). */
export async function generateQrDataUri(payload: string, width = 320): Promise<string> {
  return QRCode.toDataURL(payload, {
    width,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
