// eslint-disable-next-line @typescript-eslint/no-var-requires
const FileType = require("file-type");

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const ALLOWED_MIME_LABELS = "PDF, JPEG, or PNG";

// Image-only subset — used for cover art such as event banners, where a
// PDF would be accepted by the generic validator but is not renderable.
const ALLOWED_IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

const ALLOWED_IMAGE_MIME_LABELS = "JPEG, PNG, or WebP";


/**
 * Validates a file buffer against its magic bytes using the file-type package.
 * Rejects files whose actual content does not match an allowed MIME type,
 * regardless of the filename extension or Content-Type header sent by the client.
 *
 * This prevents stored XSS via disguised HTML/script file uploads (VUL-010).
 */
export async function validateFileMimeType(
  buffer: Buffer,
  fieldName: string
): Promise<{ valid: boolean; message?: string }> {
  const detected = await FileType.fromBuffer(buffer);

  if (!detected) {
    return {
      valid: false,
      message: `${fieldName}: Could not detect file type. Only ${ALLOWED_MIME_LABELS} files are allowed.`,
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(detected.mime)) {
    return {
      valid: false,
      message: `${fieldName}: Invalid file type (${detected.mime}). Only ${ALLOWED_MIME_LABELS} files are allowed.`,
    };
  }

  return { valid: true };
}

/**
 * Image-only variant of validateFileMimeType.
 *
 * Used for event banners (V2 Flow 1) — the stored URL is rendered directly
 * in an <img> tag, so only real raster images may pass. Magic-byte based
 * for the same reason as validateFileMimeType (VUL-010).
 */
export async function validateImageMimeType(
  buffer: Buffer,
  fieldName: string
): Promise<{ valid: boolean; message?: string }> {
  const detected = await FileType.fromBuffer(buffer);

  if (!detected) {
    return {
      valid: false,
      message: `${fieldName}: Could not detect file type. Only ${ALLOWED_IMAGE_MIME_LABELS} images are allowed.`,
    };
  }

  if (!ALLOWED_IMAGE_MIME_TYPES.includes(detected.mime)) {
    return {
      valid: false,
      message: `${fieldName}: Invalid file type (${detected.mime}). Only ${ALLOWED_IMAGE_MIME_LABELS} images are allowed.`,
    };
  }

  return { valid: true };

}


