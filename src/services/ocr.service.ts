import { createWorker } from "tesseract.js";
import * as fs from "node:fs";
import probe from "probe-image-size";

export interface ZoneRectPercent {
  xMin: number;
  yMin: number;
  width: number;
  height: number;
}

export interface OcrZones {
  universityName: ZoneRectPercent;
  studentNumber: ZoneRectPercent;
  lastName: ZoneRectPercent;
  firstName: ZoneRectPercent;
  programCode: ZoneRectPercent;
}

// QCU Student ID layout calibrated from physical card scan (355×550 reference).
// Coordinates are % of image dimensions; converted to absolute
// pixels at runtime via probe-image-size.
const DEFAULT_ZONES: OcrZones = {
  universityName:     { xMin: 38.0, yMin: 2.0,  width: 60.0, height: 14.0 },
  studentNumber:      { xMin: 10.0, yMin: 58.0, width: 55.0, height: 8.0 },
  lastName:           { xMin: 2.0, yMin: 75.0, width: 70.0, height: 5.0 },
  firstName:          { xMin: 2.0, yMin: 80.0, width: 70.0, height: 15.0 },
  programCode:        { xMin: 15.0, yMin: 90.0, width: 80.0, height: 10 },
};

const STUDENT_ID_REGEX = /^\d{2}-\d{4}$/;

export interface OcrResult {
  studentId: string | null;
  lastName: string | null;
  firstName: string | null;
  universityName: string | null;
  programCode: string | null;
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

/**
 * Reads text from a single rectangular zone of the image.
 * Returns null if the extracted text is empty after normalisation.
 */
async function recognizeZone(
  worker: Awaited<ReturnType<typeof createWorker>>,
  imagePath: string,
  rect: { left: number; top: number; width: number; height: number }
): Promise<string | null> {
  const { data } = await worker.recognize(imagePath, { rectangle: rect });
  const text = normalizeText(data.text);
  return text || null;
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

  const textZones = {
    universityName:    toPixels(zones.universityName, width, height),
    studentNumber:     toPixels(zones.studentNumber, width, height),
    lastName:          toPixels(zones.lastName, width, height),
    firstName:         toPixels(zones.firstName, width, height),
    programCode:       toPixels(zones.programCode, width, height),
  };

  const worker = await createWorker("eng");

  try {
    const [
      universityName,
      rawStudentId,
      lastName,
      firstName,
      programCode,
    ] = await Promise.all([
      recognizeZone(worker, imagePath, textZones.universityName),
      recognizeZone(worker, imagePath, textZones.studentNumber),
      recognizeZone(worker, imagePath, textZones.lastName),
      recognizeZone(worker, imagePath, textZones.firstName),
      recognizeZone(worker, imagePath, textZones.programCode),
    ]);

    console.log("[OCR DEBUG] Image:", width, "x", height);
    console.log("[OCR DEBUG] Zone universityName px:", textZones.universityName, "=>", JSON.stringify(universityName));
    console.log("[OCR DEBUG] Zone studentNumber  px:", textZones.studentNumber, "=>", JSON.stringify(rawStudentId));
    console.log("[OCR DEBUG] Zone lastName        px:", textZones.lastName, "=>", JSON.stringify(lastName));
    console.log("[OCR DEBUG] Zone firstName       px:", textZones.firstName, "=>", JSON.stringify(firstName));

    const studentId = rawStudentId
      ? extractStudentId(rawStudentId)
      : null;

    console.log("[OCR DEBUG] extractStudentId from", JSON.stringify(rawStudentId), "=>", studentId);

    return {
      studentId,
      lastName,
      firstName,
      universityName,
      programCode,
      extracted: studentId !== null,
    };
  } finally {
    await worker.terminate();
  }
}

export { STUDENT_ID_REGEX, DEFAULT_ZONES };

