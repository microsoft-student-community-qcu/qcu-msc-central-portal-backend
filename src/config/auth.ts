import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "./database";
import { env } from "./env";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "mysql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    google: env.GOOGLE_CLIENT_ID
      ? {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET!,
        }
      : undefined,
    github: env.GITHUB_CLIENT_ID
      ? {
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET!,
        }
      : undefined,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "APPLICANT",
      },
      studentId: {
        type: "string",
        required: true,
      },
      firstName: {
        type: "string",
        required: false,
      },
      lastName: {
        type: "string",
        required: false,
      },
    },
  },
  // Vercel preview for the migrated (frontend-next) portal is a separate
  // origin that must be trusted for credential-bearing requests.
  trustedOrigins: [
    env.FRONTEND_URL,
    env.ADMIN_FRONTEND_URL,
    "https://qcu-msc-central-portal-frontend-nex.vercel.app",
  ],
  plugins: [bearer()],
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
});

export type Auth = typeof auth;
