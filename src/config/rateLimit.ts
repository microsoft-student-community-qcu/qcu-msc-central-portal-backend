import rateLimit from "express-rate-limit";

// Shared rate limiters for public POST endpoints. All responses use the
// standard `message` field (never `errors`) per the API contract.

const oneMinuteWindow = 60 * 1000;

// Generic fallback message for endpoints without a specific one.
// In the test environment the ceiling is lifted so a suite that exercises many
// endpoints against one in-memory store can't trip the limiter (the OCR limiter,
// which has a dedicated 429 test, is defined separately and unaffected).
function limiter(max: number, message: string) {
  return rateLimit({
    windowMs: oneMinuteWindow,
    max: process.env.NODE_ENV === "test" ? 100000 : max,
    message: { success: false, message },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

export const signUpLimiter = limiter(5, "Too many sign-up attempts. Please try again later.");

export const signInLimiter = limiter(10, "Too many sign-in attempts. Please try again later.");

export const studentSignInLimiter = limiter(10, "Too many sign-in attempts. Please try again later.");

export const adminSignInLimiter = limiter(10, "Too many sign-in attempts. Please try again later.");

export const resendSetupLinkLimiter = limiter(3, "Too many requests. Please try again later.");

// Defense-in-depth on top of session auth for SUPERADMIN-only mutations.
export const adminMutationLimiter = limiter(20, "Too many admin requests. Please try again later.");

// ── Merch pre-orders (Module 04) — public endpoints ─────────────────────────
export const merchOrderLimiter = limiter(10, "Too many pre-order attempts. Please try again later.");

export const merchPaymentProofLimiter = limiter(10, "Too many payment-proof submissions. Please try again later.");

// Order tracking is a public GET keyed by orderRef+email — limit to blunt
// enumeration attempts.
export const merchTrackingLimiter = limiter(30, "Too many requests. Please try again later.");

// Self-service resolution links (§8d) — public, keyed by an unguessable token.
// Slightly tighter than tracking since each action mutates an order.
export const merchResolutionLimiter = limiter(20, "Too many requests. Please try again later.");