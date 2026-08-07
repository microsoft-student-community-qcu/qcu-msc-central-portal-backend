import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env";

const SECRET = new TextEncoder().encode(env.BETTER_AUTH_SECRET);
const EXPIRY = "24h";

interface SetupTokenPayload {
  applicantId: string;
  email: string;
  purpose: "password-setup";
}

interface DraftResumeTokenPayload {
  draftId: string;
  email: string;
  purpose: "resume-draft";
}

interface PasswordResetTokenPayload {
  userId: string;
  email: string;
  purpose: "password-reset";
}

export async function signSetupToken(
  applicantId: string,
  email: string
): Promise<string> {
  return new SignJWT({ applicantId, email, purpose: "password-setup" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(SECRET);
}

export async function verifySetupToken(
  token: string
): Promise<SetupTokenPayload> {
  const { payload } = await jwtVerify(token, SECRET, {
    algorithms: ["HS256"],
  });

  if (payload.purpose !== "password-setup") {
    throw new Error("Invalid token purpose");
  }

  return {
    applicantId: payload.applicantId as string,
    email: payload.email as string,
    purpose: "password-setup",
  };
}

/**
 * Sign a short-lived resume token embedded in the draft resume-link email.
 * Short expiry is fine — the token is only used to load a draft into the form.
 */
export async function signDraftResumeToken(
  draftId: string,
  email: string
): Promise<string> {
  return new SignJWT({ draftId, email, purpose: "resume-draft" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.RESUME_TOKEN_EXPIRY_MINUTES}m`)
    .sign(SECRET);
}

export async function verifyDraftResumeToken(
  token: string
): Promise<DraftResumeTokenPayload> {
  const { payload } = await jwtVerify(token, SECRET, {
    algorithms: ["HS256"],
  });

  if (payload.purpose !== "resume-draft") {
    throw new Error("Invalid token purpose");
  }

  return {
    draftId: payload.draftId as string,
    email: payload.email as string,
    purpose: "resume-draft",
  };
}

/**
 * Sign a short-lived password-reset token embedded in the forgot-password email.
 * The expiry comes from the PASSWORD_RESET_TOKEN_EXPIRY_MINUTES env variable.
 * Single-use is enforced server-side by recording the token (hashed) in the
 * Verification table and consuming it on a successful reset.
 */
export async function signPasswordResetToken(
  userId: string,
  email: string
): Promise<string> {
  return new SignJWT({ userId, email, purpose: "password-reset" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${env.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES}m`)
    .sign(SECRET);
}

export async function verifyPasswordResetToken(
  token: string
): Promise<PasswordResetTokenPayload> {
  const { payload } = await jwtVerify(token, SECRET, {
    algorithms: ["HS256"],
  });

  if (payload.purpose !== "password-reset") {
    throw new Error("Invalid token purpose");
  }

  return {
    userId: payload.userId as string,
    email: payload.email as string,
    purpose: "password-reset",
  };
}
