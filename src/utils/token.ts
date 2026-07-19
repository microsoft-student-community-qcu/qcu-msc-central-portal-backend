import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env";

const SECRET = new TextEncoder().encode(env.BETTER_AUTH_SECRET);
const EXPIRY = "24h";

interface SetupTokenPayload {
  applicantId: string;
  email: string;
  purpose: "password-setup";
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
