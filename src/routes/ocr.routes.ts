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

function uploadImage(req: Request, res: Response, next: NextFunction): void {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("multipart/form-data")) {
    res.status(400).json({
      success: false,
      message: "Content-Type must be multipart/form-data with an 'image' field",
    });
    return;
  }

  let responded = false;

  const timeout = setTimeout(() => {
    if (responded) return;
    responded = true;

    // Stop feeding busboy any further data
    req.unpipe();
    req.pause();

    if (!res.headersSent) {
      res.status(400).json({
        success: false,
        message: "File upload timed out. Ensure the 'image' field is attached.",
      });
    }

    // Only close the socket AFTER the response has actually been flushed,
    // so the client gets the JSON before the connection drops.
    res.on("finish", () => {
      req.destroy();
    });
  }, 10000);

  upload.single("image")(req, res, (err?: unknown) => {
    clearTimeout(timeout);
    if (responded) return;
    responded = true;

    if (err) {
      handleMulterError(err as Error, req, res, next);
      return;
    }
    next();
  });
}

const router = Router();

router.post("/verify", ocrLimiter, uploadImage, verifyOcr);

export default router;
