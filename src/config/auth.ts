import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { PrismaClient } from "@prisma/client";
import { env } from "./env";

const prisma = new PrismaClient();

/**
 * Better Auth instance configured with the Prisma adapter.
 * Uses a shared PrismaClient for a unified connection pool.
 * The custom `role` field is declared so Better Auth includes
 * it in session and user responses with full type inference.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "mysql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "STUDENT",
      },
    },
  },
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
});

export type Auth = typeof auth;
