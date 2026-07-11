import { createWorker, PSM } from "tesseract.js";
import sharp from "sharp";

function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

const STUDENT_ID_REGEX = /^\d{2}-\d{4}$/;
const MIDDLE_INITIAL_REGEX = /^[A-Za-z]\.?$/;

// Lines below this Tesseract confidence (0-100) are treated as noise (logo
// artifacts, background texture, watermark bleed-through, etc.) and
// discarded before field matching. Real card text usually scores 90+, but
// can drop into the 35-45 range when a handwritten signature overlaps
// printed text, so the threshold is kept low enough to still admit that —
// noise is kept out mainly by content/position matching in locateFields,
// not by this threshold alone.
const LINE_CONFIDENCE_THRESHOLD = 35;

// Per-field minimum confidence. Individual fields whose OCR confidence
// falls below this threshold are set to null rather than returned with
// garbled text. The raw fullName text is still preserved in the result
// for reference, but lastName/middleInitial aren't trusted enough to use.
const FIELD_CONFIDENCE_THRESHOLD = 70;

// Page segmentation modes to try, in order, per preprocessed image variant.
// SPARSE_TEXT looks for text anywhere without assuming a uniform layout,
// which handles a card that doesn't fill the frame well — but it will
// discard a text region entirely (not just score it low) if something like
// a handwritten signature overlaps it, since that no longer looks like
// "sparse, isolated text" to Tesseract's layout analysis. AUTO assumes more
// of a single coherent page/block layout, which recovers signature-overlap
// cases, but is more easily thrown off by a card that's a small part of a
// larger, cluttered photo. Trying both and keeping the first one that
// yields a valid match covers both failure modes.
const PSM_ATTEMPTS = [PSM.SPARSE_TEXT, PSM.AUTO];

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
      middleInitial = lastWord.replace(".", "");
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
async function correctRotation(inputBuffer: Buffer, filename?: string): Promise<Buffer> {
  const worker = await createWorker("eng", 1, { legacyCore: true } as any);
  let working = inputBuffer;
  let coarseAngle = 0;
  try {
    try {
      const { data } = await (worker as any).detect(working);
      coarseAngle = data?.orientation_degrees ?? 0;
      if (coarseAngle && coarseAngle % 360 !== 0) {
        working = await sharp(working).rotate(360 - coarseAngle).toBuffer();
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

  const cleanLabel = filename ? filename.split(/[/\\]/).pop() : "in-memory";
  console.log(`[OCR-DEBUG] ${cleanLabel} rotation: coarse=${coarseAngle}° fine=${bestAngle}° (score=${bestScore.toFixed(0)})`);

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
async function prepareVariants(imageBuffer: Buffer, filename?: string): Promise<Buffer[]> {
  const upright = await correctRotation(imageBuffer, filename);
  const base = sharp(upright).rotate(); // normalize any remaining EXIF orientation

  const variantA = await base.clone().grayscale().normalize().sharpen().toBuffer();
  const variantB = await base.clone().grayscale().normalize().threshold(160).toBuffer();

  const cleanLabel = filename ? filename.split(/[/\\]/).pop() : "in-memory";
  console.log(`[OCR-DEBUG] ${cleanLabel} variants prepared: A=sharpen (${variantA.length} bytes), B=threshold (${variantB.length} bytes)`);

  return [variantA, variantB];
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

interface DetectedLine {
  text: string;
  y0: number;
  y1: number;
  confidence: number;
}

/**
 * Runs a single full-page OCR pass with the given page segmentation mode
 * and returns the recognized lines, sorted top-to-bottom, filtered to those
 * Tesseract is at least somewhat confident about.
 */
async function recognizeLines(imageBuffer: Buffer, psm: PSM, label?: string): Promise<DetectedLine[]> {
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(imageBuffer);

    const allLines = data.lines
      .filter((line) => line.text.trim().length > 0)
      .sort((a, b) => a.bbox.y0 - b.bbox.y0);

    const tag = label ?? "?";
    if (allLines.length === 0) {
      console.log(`[OCR-DEBUG] ${tag} PSM=${psm}: 0 lines`);
      return [];
    }

    const avgConf = allLines.reduce((s, l) => s + l.confidence, 0) / allLines.length;
    const maxConf = Math.max(...allLines.map((l) => l.confidence));
    const minConf = Math.min(...allLines.map((l) => l.confidence));
    console.log(`[OCR-DEBUG] ${tag} PSM=${psm}: ${allLines.length} lines, conf avg=${avgConf.toFixed(1)} min=${minConf.toFixed(1)} max=${maxConf.toFixed(1)}`);

    for (const line of allLines) {
      console.log(`[OCR-DEBUG] ${tag} PSM=${psm}:  y=${line.bbox.y0}-${line.bbox.y1} conf=${line.confidence.toFixed(1)} text="${line.text.trim()}"`);
    }

    return allLines
      .filter((line) => line.confidence >= LINE_CONFIDENCE_THRESHOLD && line.text.trim().length > 0)
      .map((line) => ({
        text: line.text.trim(),
        y0: line.bbox.y0,
        y1: line.bbox.y1,
        confidence: line.confidence,
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
  studentIdConfidence: number | null;
  fullNameText: string | null;
  surnameConfidence: number | null;
  givenNameConfidence: number | null;
} {
  let studentId: string | null = null;
  let studentIdConfidence: number | null = null;
  let idBottomY: number | null = null;

  for (const line of lines) {
    const candidate = extractStudentId(line.text);
    if (candidate) {
      studentId = candidate;
      studentIdConfidence = line.confidence;
      idBottomY = line.y1;
      break;
    }
  }

  if (studentId === null) {
    return { studentId: null, studentIdConfidence: null, fullNameText: null, surnameConfidence: null, givenNameConfidence: null };
  }

  const belowLines = lines.filter(
    (line) => line.y0 > (idBottomY as number) && !/\d/.test(line.text)
  );

  const surnameIdx = belowLines.findIndex((line) => /,\s*$/.test(line.text));
  let fullNameText: string | null = null;
  let surnameConfidence: number | null = null;
  let givenNameConfidence: number | null = null;

  if (surnameIdx !== -1) {
    surnameConfidence = belowLines[surnameIdx].confidence;
    const givenLine = belowLines[surnameIdx + 1];
    givenNameConfidence = givenLine?.confidence ?? null;
    fullNameText = belowLines
      .slice(surnameIdx, surnameIdx + 2)
      .map((line) => line.text)
      .join(" ");
  } else if (belowLines.length > 0) {
    surnameConfidence = belowLines[0].confidence;
    const givenLine = belowLines[1];
    givenNameConfidence = givenLine?.confidence ?? null;
    fullNameText = belowLines
      .slice(0, 2)
      .map((line) => line.text)
      .join(" ");
  }

  return { studentId, studentIdConfidence, fullNameText, surnameConfidence, givenNameConfidence };
}

async function extractFromVariant(imageBuffer: Buffer, psm: PSM, label?: string): Promise<OcrResult> {
  const lines = await recognizeLines(imageBuffer, psm, label);
  const { studentId, studentIdConfidence, fullNameText, surnameConfidence, givenNameConfidence } = locateFields(lines);
  const parsed = parseFullName(fullNameText ?? "");

  let lastName = parsed.lastName;
  let firstName = parsed.firstName;
  let middleInitial = parsed.middleInitial;

  if (surnameConfidence !== null && surnameConfidence < FIELD_CONFIDENCE_THRESHOLD) {
    lastName = null;
  }
  if (givenNameConfidence !== null && givenNameConfidence < FIELD_CONFIDENCE_THRESHOLD) {
    firstName = null;
    middleInitial = null;
  }

  const resolvedStudentId =
    studentIdConfidence !== null && studentIdConfidence < FIELD_CONFIDENCE_THRESHOLD ? null : studentId;

  const result = {
    studentId: resolvedStudentId,
    fullName: fullNameText,
    lastName,
    firstName,
    middleInitial,
    extracted: resolvedStudentId !== null,
  };

  console.log(
    `[OCR-DEBUG] ${label} PSM=${psm}: extracted=${result.extracted} ` +
    `studentId=${result.studentId} (conf=${studentIdConfidence ?? "?"}) ` +
    `lastName=${result.lastName} (conf=${surnameConfidence ?? "?"}) ` +
    `firstName=${result.firstName} (conf=${givenNameConfidence ?? "?"}) ` +
    `fullName="${result.fullName}"`
  );

  return result;
}

/**
 * A result only short-circuits the retry loop if the name looks well-formed
 * (i.e. we actually found a "SURNAME," line, not just leftover fragments).
 * Otherwise a pass can find the student ID correctly but silently produce a
 * garbage name — e.g. SPARSE_TEXT dropping a surname line that overlaps a
 * handwritten signature while still reading the ID fine — and we'd stop
 * before trying the mode that would have recovered the name too.
 */
function isConfidentMatch(result: OcrResult): boolean {
  return result.studentId !== null && result.lastName !== null && !!result.fullName?.includes(",");
}

function isBetter(a: OcrResult, b: OcrResult | null): boolean {
  if (!b) return true;
  const aScore = (a.studentId !== null ? 2 : 0) + (a.lastName !== null ? 1 : 0);
  const bScore = (b.studentId !== null ? 2 : 0) + (b.lastName !== null ? 1 : 0);
  if (aScore !== bScore) return aScore > bScore;
  return (a.fullName?.length ?? 0) > (b.fullName?.length ?? 0);
}

export async function extractFields(imageBuffer: Buffer, filename?: string): Promise<OcrResult> {
  const labels = ["A", "B"];
  const variants = await prepareVariants(imageBuffer, filename);

  let best: OcrResult | null = null;
  for (let vi = 0; vi < variants.length; vi++) {
    for (const psm of PSM_ATTEMPTS) {
      const result = await extractFromVariant(variants[vi], psm, labels[vi]);
      if (isConfidentMatch(result)) {
        const cleanLabel = filename ? filename.split(/[/\\]/).pop() : "in-memory";
        console.log(`[OCR-DEBUG] ${cleanLabel}: CONFIRMED on variant ${labels[vi]} PSM=${psm} → returning early`);
        return result;
      }
      if (isBetter(result, best)) {
        best = result;
      }
    }
  }

  const excerpt = (s: string | null) => (s ? `"${s.substring(0, 40)}"` : "null");
  const cleanLabel = filename ? filename.split(/[/\\]/).pop() : "in-memory";
  console.log(
    `[OCR-DEBUG] ${cleanLabel}: no confident match, best=` +
    `studentId=${best?.studentId ?? "null"} lastName=${best?.lastName ?? "null"} fullName=${excerpt(best?.fullName ?? null)}`
  );

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