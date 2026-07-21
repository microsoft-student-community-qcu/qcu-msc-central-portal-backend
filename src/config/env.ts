import dotenv from "dotenv";
import { expand } from "dotenv-expand";
import { z } from "zod";

// Load environment variables from .env file and expand variables
const rawEnv = dotenv.config();
expand(rawEnv);

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(8),
  BETTER_AUTH_URL: z.string().url(),
  OCR_MAX_FAILURES: z.coerce.number().int().positive().default(3),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  ADMIN_FRONTEND_URL: z.string().url().default("http://localhost:8081"),
  AZURE_STORAGE_ACCOUNT_NAME: z.string().min(1),
  SENTRY_DSN: z.string().optional(),

  // Email provider selection
  EMAIL_PROVIDER: z.enum(["RESEND", "SMTP"]).default("RESEND"),

  // Resend (production)
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().email().default("no-reply@anonimi.cloud"),

  // SMTP (development)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_SECURE: z.coerce.boolean().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_NAME: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().optional(),
}).refine(
  (data) => data.EMAIL_PROVIDER !== "RESEND" || (data.RESEND_API_KEY && data.RESEND_API_KEY.length > 0),
  { message: "RESEND_API_KEY is required when EMAIL_PROVIDER=RESEND", path: ["RESEND_API_KEY"] }
).refine(
  (data) => data.EMAIL_PROVIDER !== "SMTP" || (data.SMTP_HOST && data.SMTP_PORT),
  { message: "SMTP_HOST and SMTP_PORT are required when EMAIL_PROVIDER=SMTP", path: ["SMTP_HOST"] }
);

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", JSON.stringify(parsedEnv.error.format(), null, 2));
}

export const env = (parsedEnv.success ? parsedEnv.data : process.env) as unknown as z.infer<typeof envSchema>;
export type Env = z.infer<typeof envSchema>;
