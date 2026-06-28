import { createWorker } from "tesseract.js";
import * as fs from "node:fs";
import probe from "probe-image-size";

function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

export interface ZoneRectPercent {
  xMin: number;
  yMin: number;
  width: number;
  height: number;
}

export interface OcrZones {
  studentNumber: ZoneRectPercent;
  fullNameBlock: ZoneRectPercent;
}

// QCU Student ID layout calibrated from physical card scan (355×550 reference).
// Coordinates are % of image dimensions; converted to absolute
// pixels at runtime via probe-image-size.
const DEFAULT_ZONES: OcrZones = {
  studentNumber: { xMin: 15.0, yMin: 58.0, width: 40.0, height: 8.0 },
  fullNameBlock: { xMin: 15.0, yMin: 75.0, width: 50.0, height: 12.0 },
};

const STUDENT_ID_REGEX = /^\d{2}-\d{4}$/;

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

function toPixels(
  zone: ZoneRectPercent,
  imgWidth: number,
  imgHeight: number
): { left: number; top: number; width: number; height: number } {
  return {
    left: Math.round((zone.xMin / 100) * imgWidth),
    top: Math.round((zone.yMin / 100) * imgHeight),
    width: Math.round((zone.width / 100) * imgWidth),
    height: Math.round((zone.height / 100) * imgHeight),
  };
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

const MIDDLE_INITIAL_REGEX = /^[A-Za-z]\.?$/;

/**
 * Parses combined fullNameBlock text into lastName, firstName, and middleInitial.
 *
 * Rule 1: If a comma is present, split on it (left = last, right = first).
 * Rule 2: If no comma, the first word is the last name, everything else is the first name.
 *
 * The middle initial is extracted from the end of the firstName: if the last
 * word is a single letter optionally followed by a dot (e.g. "B" or "B."),
 * it is moved into the middleInitial field.
 *
 * lastName is formatted in Title Case (e.g. "DELA CRUZ" → "Dela Cruz").
 * The raw fullName is preserved in the result so the frontend can display
 * the original combined text even if the automated split is imperfect.
 */
function parseFullName(text: string): {
  lastName: string | null;
  firstName: string | null;
  middleInitial: string | null;
} {
  const cleaned = normalizeText(text);
  if (!cleaned) return { lastName: null, firstName: null, middleInitial: null };

  let lastName: string | null;
  let firstNameBlock: string | null;

  // Rule 1: Comma present — split on comma
  const commaIndex = cleaned.indexOf(",");
  if (commaIndex > -1) {
    lastName = cleaned.substring(0, commaIndex).trim();
    firstNameBlock = cleaned.substring(commaIndex + 1).trim() || null;
  } else {
    // Rule 2: No comma — first word is last name, rest is first name
    const words = cleaned.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    if (words.length === 0) {
      return { lastName: null, firstName: null, middleInitial: null };
    }
    lastName = words[0];
    firstNameBlock = words.slice(1).join(" ") || null;
  }

  // Extract middle initial from the end of firstNameBlock
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

  // Apply Title Case to lastName
  if (lastName) {
    lastName = toTitleCase(lastName);
  }

  return { lastName, firstName, middleInitial };
}

export async function extractFields(
  imagePath: string,
  zones: OcrZones = DEFAULT_ZONES
): Promise<OcrResult> {
  const imageBuffer = fs.readFileSync(imagePath);
  const dimensions = probe.sync(imageBuffer);
  if (!dimensions) {
    throw new Error("Unable to read image dimensions");
  }

  const { width, height } = dimensions;

  const studentNumberRect = toPixels(zones.studentNumber, width, height);
  const fullNameRect = toPixels(zones.fullNameBlock, width, height);

  const worker = await createWorker("eng");

  try {
    const idResult = await worker.recognize(imagePath, {
      rectangle: studentNumberRect,
    });
    const nameResult = await worker.recognize(imagePath, {
      rectangle: fullNameRect,
    });

    const rawStudentId = normalizeText(idResult.data.text);
    const rawFullName = normalizeText(nameResult.data.text);

    const studentId = extractStudentId(rawStudentId);
    const parsed = parseFullName(rawFullName);

    return {
      studentId,
      fullName: rawFullName || null,
      lastName: parsed.lastName,
      firstName: parsed.firstName,
      middleInitial: parsed.middleInitial,
      extracted: studentId !== null,
    };
  } finally {
    await worker.terminate();
  }
}

export { STUDENT_ID_REGEX, DEFAULT_ZONES };
