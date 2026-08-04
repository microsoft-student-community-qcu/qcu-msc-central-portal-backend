// eslint-disable-next-line @typescript-eslint/no-var-requires
const FileType = require("file-type");

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
];

const ALLOWED_MIME_LABELS = "PDF, JPEG, or PNG";

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