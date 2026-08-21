/**
 * @file express.d.ts
 * @description Global augmentation of the Express `Request` interface.
 *
 * `authMiddleware` runs on every request and populates `userId` / `userRole`
 * from the Better Auth session (both `null` for guests). Declaring them here
 * lets controllers read `req.userId` / `req.userRole` type-safely instead of
 * casting through `any`. They are optional to reflect requests that never pass
 * through `authMiddleware` (e.g. isolated unit tests).
 */

import "express";

declare global {
  namespace Express {
    interface Request {
      /** Authenticated user's id; `null` for guests. Set by `authMiddleware`. */
      userId?: string | null;
      /** Authenticated user's role; `null` for guests. Set by `authMiddleware`. */
      userRole?: string | null;
    }
  }
}
