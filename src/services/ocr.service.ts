import { createWorker, PSM } from "tesseract.js";
import sharp from "sharp";
import * as fs from "node:fs";

function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

const STUDENT_ID_REGEX = /^\d{2}-\d{4}$/;
const MIDDLE_INITIAL_REGEX = /^[A-Za-z]\.?$/;

// Lines below this Tesseract confidence (0-100) are treated as noise (logo
// artifacts, background texture, watermark bleed-through, etc.) and
// discarded before field matching. Empirically, real card text on real
// photos scores 90+, while background/texture false-positives score well
// under 50.
const LINE_CONFIDENCE_THRESHOLD = 50;

export interface OcrResult {
  studentId: string | null;
  fullName: string | null;
  lastName: string | null;
  firstName: string | null;
  middleInitial: string | null;
  extracted: boolean;
}

function normalizeText(text: string): string {
  return text.replace(/[\s\n\r]+/g, " ").trim();
}

function extractStudentId(text: string): string | null {
  const cleaned = text.replace(/[^0-9\s-]/g, "");
  const match = cleaned.match(/(\d{2})\s*-?\s*(\d{4})/);
  if (match) {
    const candidate = `${match[1]}-${match[2]}`;
    if (STUDENT_ID_REGEX.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

function parseFullName(text: string): {
  lastName: string | null;
  firstName: string | null;
  middleInitial: string | null;
} {
  const cleaned = normalizeText(text);
  if (!cleaned) return { lastName: null, firstName: null, middleInitial: null };

  let lastName: string | null;
  let firstNameBlock: string | null;

  const commaIndex = cleaned.indexOf(",");
  if (commaIndex > -1) {
    lastName = cleaned.substring(0, commaIndex).trim();
    firstNameBlock = cleaned.substring(commaIndex + 1).trim() || null;
  } else {
    const words = cleaned.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    if (words.length === 0) {
      return { lastName: null, firstName: null, middleInitial: null };
    }
    lastName = words[0];
    firstNameBlock = words.slice(1).join(" ") || null;
  }

  let firstName: string | null;
  let middleInitial: string | null = null;

  if (firstNameBlock) {
    const nameWords = firstNameBlock.split(/\s+/);
    const lastWord = nameWords[nameWords.length - 1];
    if (MIDDLE_INITIAL_REGEX.test(lastWord)) {
      middleInitial = lastWord;
      firstName = nameWords.slice(0, -1).join(" ") || null;
    } else {
      firstName = firstNameBlock;
    }
  } else {
    firstName = null;
  }

  if (lastName) {
    lastName = toTitleCase(lastName);
  }

  return { lastName, firstName, middleInitial };
}

// ---------------------------------------------------------------------------
// Preprocessing
// ---------------------------------------------------------------------------

/**
 * Coarse + fine rotation correction.
 *
 * 1. Tesseract's OSD gives us 0/90/180/270 orientation, which handles a
 *    photo taken sideways or upside down.
 * 2. A small projection-profile search (-7..+7 degrees) then corrects the
 *    residual skew from a hand-held, not-quite-level photo. Text rows create
 *    a strong periodic signal in the row-sum profile of a binarized image
 *    when the rotation is correct, so we pick the angle that maximizes the
 *    variance of that profile.
 *
 * Note: this is a resilience improvement, not a strict requirement for
 * extraction to work — the field-location step below tolerates a fair
 * amount of residual skew because it locates text by content/position
 * rather than by fixed geometry. But sharper OCR input still improves
 * character-level accuracy on the ID number and name, so we keep it.
 */
async function correctRotation(inputBuffer: Buffer): Promise<Buffer> {
  const worker = await createWorker("eng", 1, { legacyCore: true } as any);
  let working = inputBuffer;
  try {
    try {
      const { data } = await (worker as any).detect(working);
      const angle = data?.orientation_degrees ?? 0;
      if (angle && angle % 360 !== 0) {
        working = await sharp(working).rotate(360 - angle).toBuffer();
      }
    } catch {
      // OSD can fail on very small/blank crops — non-fatal, skip coarse step.
    }
  } finally {
    await worker.terminate();
  }

  const small = await sharp(working)
    .resize({ width: 500, withoutEnlargement: true })
    .grayscale()
    .toBuffer();

  let bestAngle = 0;
  let bestScore = -Infinity;
  for (let angle = -7; angle <= 7; angle += 1) {
    const rotated = await sharp(small)
      .rotate(angle, { background: "#ffffff" })
      .threshold(150)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = rotated;
    const rowSums = new Float64Array(info.height);
    for (let y = 0; y < info.height; y++) {
      let sum = 0;
      const rowStart = y * info.width * info.channels;
      for (let x = 0; x < info.width; x++) {
        sum += data[rowStart + x * info.channels] === 0 ? 1 : 0;
      }
      rowSums[y] = sum;
    }
    const mean = rowSums.reduce((a, b) => a + b, 0) / rowSums.length;
    const variance =
      rowSums.reduce((a, b) => a + (b - mean) ** 2, 0) / rowSums.length;

    if (variance > bestScore) {
      bestScore = variance;
      bestAngle = angle;
    }
  }

  if (bestAngle === 0) return working;
  return sharp(working).rotate(bestAngle, { background: "#ffffff" }).toBuffer();
}

/**
 * Produces preprocessed variants of the source image to try OCR against.
 * Different contrast/threshold settings recover different photo conditions
 * (glare, low light, low-contrast or textured backgrounds).
 *
 * Earlier versions of this pipeline also tried to geometrically locate the
 * card's edges (via background trimming / brightness-blob detection) so
 * that extraction zones could be expressed relative to the card instead of
 * the raw photo. That approach was dropped: on real photos with textured or
 * patterned backgrounds (e.g. a marbled desk surface), bright regions in the
 * background are indistinguishable from the card by color/brightness alone,
 * so the detected "card" boundary silently included background and threw
 * off every zone. Card-edge detection that's actually robust to arbitrary
 * backgrounds needs real edge/contour geometry (e.g. Hough line detection),
 * which isn't practical without a CV library like OpenCV.
 *
 * Full-page OCR + content-based field matching (below) sidesteps the
 * problem entirely — it doesn't need to know where the card is at all.
 */
async function prepareVariants(imagePath: string): Promise<Buffer[]> {
  const rawBuffer = fs.readFileSync(imagePath);
  const upright = await correctRotation(rawBuffer);
  const base = sharp(upright).rotate(); // normalize any remaining EXIF orientation

  const variantA = await base.clone().grayscale().normalize().sharpen().toBuffer();
  const variantB = await base.clone().grayscale().normalize().threshold(160).toBuffer();

  return [variantA, variantB];
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface DetectedLine {
  text: string;
  y0: number;
  y1: number;
}

/**
 * Runs a single full-page OCR pass and returns the recognized lines, sorted
 * top-to-bottom, filtered to those Tesseract is actually confident about.
 * PSM.SPARSE_TEXT is used because it looks for text anywhere in the image
 * without assuming a single uniform block/column layout — appropriate when
 * we don't know exactly where the card sits in the frame.
 */
async function recognizeLines(imageBuffer: Buffer): Promise<DetectedLine[]> {
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const { data } = await worker.recognize(imageBuffer);
    return data.lines
      .filter(
        (line) =>
          line.confidence >= LINE_CONFIDENCE_THRESHOLD && line.text.trim().length > 0
      )
      .map((line) => ({
        text: line.text.trim(),
        y0: line.bbox.y0,
        y1: line.bbox.y1,
      }))
      .sort((a, b) => a.y0 - b.y0);
  } finally {
    await worker.terminate();
  }
}

/**
 * Locates the student ID and full-name fields within a set of recognized
 * lines, using content and relative vertical position rather than fixed
 * coordinates:
 *  - the student ID is whichever line matches the ##-#### pattern
 *  - the name block is the text found below the ID line, preferring a line
 *    that looks like "SURNAME," (the card's actual format) plus the line(s)
 *    immediately after it; if no comma-terminated line is found, falls back
 *    to the first couple of non-numeric lines below the ID.
 */
function locateFields(lines: DetectedLine[]): {
  studentId: string | null;
  fullNameText: string | null;
} {
  let studentId: string | null = null;
  let idBottomY: number | null = null;

  for (const line of lines) {
    const candidate = extractStudentId(line.text);
    if (candidate) {
      studentId = candidate;
      idBottomY = line.y1;
      break;
    }
  }

  if (studentId === null) {
    return { studentId: null, fullNameText: null };
  }

  const belowLines = lines.filter(
    (line) => line.y0 > (idBottomY as number) && !/\d/.test(line.text)
  );

  const surnameIdx = belowLines.findIndex((line) => /,\s*$/.test(line.text));
  let fullNameText: string | null = null;

  if (surnameIdx !== -1) {
    fullNameText = belowLines
      .slice(surnameIdx, surnameIdx + 2)
      .map((line) => line.text)
      .join(" ");
  } else if (belowLines.length > 0) {
    fullNameText = belowLines
      .slice(0, 2)
      .map((line) => line.text)
      .join(" ");
  }

  return { studentId, fullNameText };
}

async function extractFromVariant(imageBuffer: Buffer): Promise<OcrResult> {
  const lines = await recognizeLines(imageBuffer);
  const { studentId, fullNameText } = locateFields(lines);
  const parsed = parseFullName(fullNameText ?? "");

  return {
    studentId,
    fullName: fullNameText,
    lastName: parsed.lastName,
    firstName: parsed.firstName,
    middleInitial: parsed.middleInitial,
    extracted: studentId !== null,
  };
}

export async function extractFields(imagePath: string): Promise<OcrResult> {
  const variants = await prepareVariants(imagePath);

  let best: OcrResult | null = null;
  for (const variant of variants) {
    const result = await extractFromVariant(variant);
    if (result.extracted) {
      return result;
    }
    if (!best || (result.fullName?.length ?? 0) > (best.fullName?.length ?? 0)) {
      best = result;
    }
  }

  return (
    best ?? {
      studentId: null,
      fullName: null,
      lastName: null,
      firstName: null,
      middleInitial: null,
      extracted: false,
    }
  );
}

export { STUDENT_ID_REGEX };