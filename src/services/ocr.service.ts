import { createWorker, PSM } from "tesseract.js";
import sharp from "sharp";

function toTitleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

const STUDENT_ID_REGEX = /^\d{2}-\d{4}$/;
const MIDDLE_INITIAL_REGEX = /^[A-Za-z]\.?$/;

// Characters Tesseract commonly confuses with letters when a name is set in
// a bold/sans-serif card font — most visibly '0' for 'O' in a middle
// initial like "O.", but also seen with these other pairs. Applied only to
// lines already identified as name-block candidates (see isDigitDominant),
// never to the student-ID line, so this can't corrupt "23-1954" parsing.
const HIGH_CONFIDENCE_DIGIT_TO_LETTER: Record<string, string> = {
  "0": "O",
  "1": "I",
  "5": "S",
  "8": "B",
};

// Less common confusions. Kept separate from the map above so that using
// one of these can be tracked (see normalizeNameOcrConfusions) and treated
// as a weaker result in the retry loop below, rather than trusted outright
// the way the high-confidence corrections are.
const LOW_CONFIDENCE_DIGIT_TO_LETTER: Record<string, string> = {
  "2": "Z",
  "3": "B",
  "4": "A",
  "6": "G",
  "7": "T",
  "9": "G",
};

function normalizeNameOcrConfusions(text: string): {
  text: string;
  hadDigitCorrection: boolean;
  usedLowConfidenceCorrection: boolean;
} {
  let hadDigitCorrection = false;
  let usedLowConfidenceCorrection = false;
  const corrected = text.replace(/\d/g, (d) => {
    if (HIGH_CONFIDENCE_DIGIT_TO_LETTER[d]) {
      hadDigitCorrection = true;
      return HIGH_CONFIDENCE_DIGIT_TO_LETTER[d];
    }
    if (LOW_CONFIDENCE_DIGIT_TO_LETTER[d]) {
      hadDigitCorrection = true;
      usedLowConfidenceCorrection = true;
      return LOW_CONFIDENCE_DIGIT_TO_LETTER[d];
    }
    return d;
  });
  return { text: corrected, hadDigitCorrection, usedLowConfidenceCorrection };
}

/**
 * A line is "digit-dominant" (and therefore genuine noise, not a
 * misread name line) when digits make up at least half of its
 * alphanumeric characters — e.g. a stray duplicate of the ID number, a
 * course-code fragment, or background clutter. A name line with a single
 * misread character, like "Mark Darren 0." (one stray '0' among ten
 * letters), is nowhere near this ratio and is kept + corrected instead of
 * discarded.
 */
function isDigitDominant(text: string): boolean {
  const digitCount = (text.match(/\d/g) ?? []).length;
  const letterCount = (text.match(/[A-Za-z]/g) ?? []).length;
  return digitCount > 0 && digitCount >= letterCount;
}

// Lines below this Tesseract confidence (0-100) are treated as noise (logo
// artifacts, background texture, watermark bleed-through, etc.) and
// discarded before field matching. Real card text usually scores 90+, but
// can drop into the 35-45 range when a handwritten signature overlaps
// printed text, so the threshold is kept low enough to still admit that —
// noise is kept out mainly by content/position matching in locateFields,
// not by this threshold alone.
const LINE_CONFIDENCE_THRESHOLD = 35;

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
  // True when at least one digit in the recognized name text (e.g. a "0"
  // in "Mark Darren 0.") had to be reinterpreted as a letter to produce
  // lastName/firstName/middleInitial. The name fields above already
  // reflect the correction — this is purely a signal for the caller to
  // surface a "please double-check this name" notice, since even the
  // high-confidence corrections (0->O, 1->I, ...) are still a guess, not
  // a certainty.
  digitCorrectedInName: boolean;
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
async function prepareVariants(imageBuffer: Buffer): Promise<Buffer[]> {
  const upright = await correctRotation(imageBuffer);
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
 * Runs a single full-page OCR pass with the given page segmentation mode
 * and returns the recognized lines, sorted top-to-bottom, filtered to those
 * Tesseract is at least somewhat confident about.
 */
async function recognizeLines(imageBuffer: Buffer, psm: PSM): Promise<DetectedLine[]> {
  const worker = await createWorker("eng");
  try {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
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
 *  - candidate name lines are those below the ID line that aren't
 *    digit-dominant (see isDigitDominant) — this keeps a line like
 *    "Mark Darren 0." (one misread character) while still discarding
 *    genuine noise like a duplicated ID fragment, and corrects likely
 *    digit/letter misreads (0->O, 1->I, etc.) within the ones that are kept
 *  - among those, prefer a line that looks like "SURNAME," (the card's
 *    actual format) plus the line(s) immediately after it; if no
 *    comma-terminated line is found, falls back to the first couple of
 *    candidate lines below the ID
 */
function locateFields(lines: DetectedLine[]): {
  studentId: string | null;
  fullNameText: string | null;
  hadDigitCorrection: boolean;
  usedLowConfidenceCorrection: boolean;
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
    return {
      studentId: null,
      fullNameText: null,
      hadDigitCorrection: false,
      usedLowConfidenceCorrection: false,
    };
  }

  const belowLines = lines
    .filter((line) => line.y0 > (idBottomY as number) && !isDigitDominant(line.text))
    .map((line) => {
      const normalized = normalizeNameOcrConfusions(line.text);
      return {
        ...line,
        text: normalized.text,
        hadDigitCorrection: normalized.hadDigitCorrection,
        usedLowConfidenceCorrection: normalized.usedLowConfidenceCorrection,
      };
    });

  const surnameIdx = belowLines.findIndex((line) => /,\s*$/.test(line.text));
  let fullNameText: string | null = null;
  let usedLines: typeof belowLines = [];

  if (surnameIdx !== -1) {
    usedLines = belowLines.slice(surnameIdx, surnameIdx + 2);
  } else if (belowLines.length > 0) {
    usedLines = belowLines.slice(0, 2);
  }

  if (usedLines.length > 0) {
    fullNameText = usedLines.map((line) => line.text).join(" ");
  }

  return {
    studentId,
    fullNameText,
    hadDigitCorrection: usedLines.some((line) => line.hadDigitCorrection),
    usedLowConfidenceCorrection: usedLines.some((line) => line.usedLowConfidenceCorrection),
  };
}

async function extractFromVariant(
  imageBuffer: Buffer,
  psm: PSM
): Promise<{ result: OcrResult; usedLowConfidenceCorrection: boolean }> {
  const lines = await recognizeLines(imageBuffer, psm);
  const { studentId, fullNameText, hadDigitCorrection, usedLowConfidenceCorrection } =
    locateFields(lines);
  const parsed = parseFullName(fullNameText ?? "");

  return {
    result: {
      studentId,
      fullName: fullNameText,
      lastName: parsed.lastName,
      firstName: parsed.firstName,
      middleInitial: parsed.middleInitial,
      extracted: studentId !== null,
      digitCorrectedInName: hadDigitCorrection,
    },
    usedLowConfidenceCorrection,
  };
}

/**
 * A result only short-circuits the retry loop if the name looks well-formed
 * (i.e. we actually found a "SURNAME," line, not just leftover fragments)
 * AND didn't need a low-confidence digit/letter guess (2->Z, 3->B, etc.) to
 * get there. Otherwise a pass can find the student ID correctly but
 * silently produce a garbage — or shakily-guessed — name, e.g. SPARSE_TEXT
 * dropping a surname line that overlaps a handwritten signature while
 * still reading the ID fine, or a low-confidence digit substitution that
 * happens to be wrong; we'd rather try the other preprocessing
 * variant/PSM mode first and see if it reads the character cleanly without
 * needing a guess at all.
 */
function isConfidentMatch(result: OcrResult, usedLowConfidenceCorrection: boolean): boolean {
  return (
    result.studentId !== null &&
    result.lastName !== null &&
    !!result.fullName?.includes(",") &&
    !usedLowConfidenceCorrection
  );
}

function isBetter(a: OcrResult, b: OcrResult | null): boolean {
  if (!b) return true;
  const aScore = (a.studentId !== null ? 2 : 0) + (a.lastName !== null ? 1 : 0);
  const bScore = (b.studentId !== null ? 2 : 0) + (b.lastName !== null ? 1 : 0);
  if (aScore !== bScore) return aScore > bScore;
  return (a.fullName?.length ?? 0) > (b.fullName?.length ?? 0);
}

export async function extractFields(
  imageBuffer: Buffer,
  // Not used in extraction logic today — accepted so callers can pass the
  // upload's original filename through for logging/debugging without a
  // signature change later, and to match the (buffer, originalname) call
  // shape used at the call site.
  _originalname?: string
): Promise<OcrResult> {
  const variants = await prepareVariants(imageBuffer);

  let best: OcrResult | null = null;
  for (const variant of variants) {
    for (const psm of PSM_ATTEMPTS) {
      const { result, usedLowConfidenceCorrection } = await extractFromVariant(variant, psm);
      if (isConfidentMatch(result, usedLowConfidenceCorrection)) {
        return result;
      }
      if (isBetter(result, best)) {
        best = result;
      }
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
      digitCorrectedInName: false,
    }
  );
}

export { STUDENT_ID_REGEX };