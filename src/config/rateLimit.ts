import rateLimit from "express-rate-limit";

// Shared rate limiters for public POST endpoints. All responses use the
// standard `message` field (never `errors`) per the API contract.

const oneMinuteWindow = 60 * 1000;

// Generic fallback message for endpoints without a specific one.
function limiter(max: number, message: string) {
  return rateLimit({
    windowMs: oneMinuteWindow,
    max,
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