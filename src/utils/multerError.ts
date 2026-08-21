import { Request, Response, NextFunction } from "express";
import { MulterError } from "multer";

/**
 * Shared Express error handler for multer upload failures.
 *
 * Critically, it DRAINS the unread request body before responding. When multer
 * aborts mid-upload (e.g. too many files), the client is still streaming the
 * body; if we respond and close the socket without draining, HTTP clients
 * surface a transport error ("Connection closed by remote server") instead of
 * our JSON 400. Resuming the request lets the client finish sending so the
 * error response is delivered cleanly.
 *
 * @param tooLargeMessage message for LIMIT_FILE_SIZE
 * @param tooManyMessage  message for LIMIT_FILE_COUNT / LIMIT_UNEXPECTED_FILE
 */
export function multerErrorHandler(tooLargeMessage: string, tooManyMessage: string) {
  return (err: unknown, req: Request, res: Response, next: NextFunction): void => {
    if (err instanceof MulterError) {
      // Drain remaining upload bytes so the response isn't cut off mid-stream.
      req.unpipe();
      req.on("error", () => {}); // swallow aborted-socket noise while draining
      req.resume();

      let message = "File upload error";
      if (err.code === "LIMIT_FILE_SIZE") {
        message = tooLargeMessage;
      } else if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
        message = tooManyMessage;
      }

      res.status(400).json({ success: false, message });
      return;
    }
    next(err);
  };
}
