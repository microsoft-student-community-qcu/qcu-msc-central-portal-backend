import { betterAuth } from "better-auth";
import { env } from "./env";

export const auth = betterAuth({
  database: {
    provider: "mysql",
    url: env.DATABASE_URL
  },
  emailAndPassword: {
    enabled: true
  }
});

export type Auth = typeof auth;
