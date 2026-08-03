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
