import { Router, Request, Response, NextFunction } from "express";
import multer, { MulterError } from "multer";
import rateLimit from "express-rate-limit";
import { verifyOcr } from "../controllers/ocr.controller";

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 },
});

const ocrLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: "Too many OCR requests. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

function handleMulterError(err: Error, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        success: false,
        message: "Image must not exceed 5MB",
      });
      return;
    }
    res.status(400).json({
      success: false,
      message: "File upload error",
    });
    return;
  }
  next(err);
}

const router = Router();

router.post("/verify", ocrLimiter, upload.single("image"), handleMulterError, verifyOcr);

export default router;
