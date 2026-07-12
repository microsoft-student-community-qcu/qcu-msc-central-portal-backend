import { Request, Response } from "express";
import { MulterError } from "multer";
import { extractFields } from "../services/ocr.service";
import { ocrStore } from "../config/ocrStore";
import { saveImage } from "../utils/imageStorage";
import { env } from "../config/env";

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"];

export async function verifyOcr(req: Request, res: Response): Promise<void> {
  try {
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        message: "No image file provided",
      });
      return;
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      res.status(400).json({
        success: false,
        message: "Image must be JPEG or PNG",
      });
      return;
    }

    const result = await extractFields(file.buffer, file.originalname);

    const imagePath = await saveImage(
      file.buffer,
      `ocr_${Date.now()}_${file.originalname}`
    );

    const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";

    if (result.extracted) {
      ocrStore.resetFailures(clientIp);

      const session = ocrStore.createSession({
        studentId: result.studentId,
        lastName: result.lastName,
        firstName: result.firstName,
        middleInitial: result.middleInitial,
        manualRequired: false,
        attemptsRemaining: env.OCR_MAX_FAILURES,
        imagePath,
        digitCorrectedInName: result.digitCorrectedInName,
      });

      res.status(200).json({
        success: true,
        data: {
          ocrSessionId: session.ocrSessionId,
          studentId: result.studentId,
          fullName: result.fullName,
          lastName: result.lastName,
          firstName: result.firstName,
          middleInitial: result.middleInitial,
          manualRequired: false,
          attemptsRemaining: env.OCR_MAX_FAILURES,
          // Frontend: when true, a digit character in the scanned name had
          // to be reinterpreted as a letter (e.g. "0" -> "O"). The name
          // fields above already reflect that correction, but it's still a
          // guess — show the user a "please confirm your name is correct"
          // prompt rather than silently trusting it.
          digitCorrectedInName: result.digitCorrectedInName,
        },
        message: "Student ID verified successfully",
      });
      return;
    }

    const attemptsUsed = ocrStore.getFailureCount(clientIp) + 1;
    const attemptsRemaining = ocrStore.incrementFailure(
      clientIp,
      env.OCR_MAX_FAILURES
    );

    if (attemptsRemaining > 0) {
      res.status(422).json({
        success: false,
        data: {
          ocrSessionId: null,
          studentId: null,
          fullName: null,
          lastName: null,
          firstName: null,
          middleInitial: null,
          manualRequired: false,
          attemptsRemaining,
          digitCorrectedInName: false,
        },
        message: `Could not read Student ID. Please retake the photo. (${attemptsUsed}/${env.OCR_MAX_FAILURES} attempts used)`,
      });
      return;
    }

    const session = ocrStore.createSession({
      studentId: null,
      lastName: null,
      firstName: null,
      middleInitial: null,
      manualRequired: true,
      attemptsRemaining: 0,
      imagePath,
      digitCorrectedInName: false,
    });

    res.status(422).json({
      success: false,
      data: {
        ocrSessionId: session.ocrSessionId,
        studentId: null,
        fullName: null,
        lastName: null,
        firstName: null,
        middleInitial: null,
        manualRequired: true,
        attemptsRemaining: 0,
        digitCorrectedInName: false,
      },
      message: `Unable to read Student ID after ${env.OCR_MAX_FAILURES} attempts. Please enter your details manually.`,
    });
  } catch (error) {
    if (error instanceof MulterError) {
      res.status(400).json({
        success: false,
        message:
          error.code === "LIMIT_FILE_SIZE"
            ? "Image must not exceed 5MB"
            : "File upload error",
      });
      return;
    }
    console.error("OCR verification failed:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error during OCR processing",
    });
  }
}