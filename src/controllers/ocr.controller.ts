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

    const imagePath = saveImage(
      file.buffer,
      `ocr_${Date.now()}_${file.originalname}`
    );

    const result = await extractFields(imagePath);

    const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";

    if (result.extracted) {
      ocrStore.resetFailures(clientIp);

      const session = ocrStore.createSession({
        studentId: result.studentId,
        fullName: result.fullName,
        manualRequired: false,
        attemptsRemaining: env.OCR_MAX_FAILURES,
        imagePath,
      });

      res.status(200).json({
        success: true,
        data: {
          ocrSessionId: session.ocrSessionId,
          studentId: result.studentId,
          fullName: result.fullName,
          manualRequired: false,
          attemptsRemaining: env.OCR_MAX_FAILURES,
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
      const session = ocrStore.createSession({
        studentId: null,
        fullName: null,
        manualRequired: false,
        attemptsRemaining,
        imagePath,
      });

      res.status(422).json({
        success: false,
        data: {
          ocrSessionId: session.ocrSessionId,
          studentId: null,
          fullName: null,
          manualRequired: false,
          attemptsRemaining,
        },
        message: `Could not read Student ID. Please retake the photo. (${attemptsUsed}/${env.OCR_MAX_FAILURES} attempts used)`,
      });
      return;
    }

    const session = ocrStore.createSession({
      studentId: null,
      fullName: null,
      manualRequired: true,
      attemptsRemaining: 0,
      imagePath,
    });

    res.status(422).json({
      success: false,
      data: {
        ocrSessionId: session.ocrSessionId,
        studentId: null,
        fullName: null,
        manualRequired: true,
        attemptsRemaining: 0,
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
