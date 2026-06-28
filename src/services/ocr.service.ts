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
  studentNumber: ZoneRectPercent;
  fullNameBlock: ZoneRectPercent;
}

// QCU Student ID layout calibrated from physical card scan (355×550 reference).
// Coordinates are % of image dimensions; converted to absolute
// pixels at runtime via probe-image-size.
const DEFAULT_ZONES: OcrZones = {
  studentNumber: { xMin: 15.0, yMin: 58.0, width: 40.0, height: 8.0 },
  fullNameBlock:  { xMin: 15.0, yMin: 75.0, width: 50.0, height: 12.0 },
};

const STUDENT_ID_REGEX = /^\d{2}-\d{4}$/;

export interface OcrResult {
  studentId: string | null;
  fullName: string | null;
  extracted: boolean;
}

function normalizeText(text: string): string {
  return text.replace(/[\s\n\r]+/g, " ").trim();
}

function toPixels(zone: ZoneRectPercent, imgWidth: number, imgHeight: number): { left: number; top: number; width: number; height: number } {
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

    return {
      studentId,
      fullName: rawFullName || null,
      extracted: studentId !== null,
    };
  } finally {
    await worker.terminate();
  }
}

export { STUDENT_ID_REGEX, DEFAULT_ZONES };
