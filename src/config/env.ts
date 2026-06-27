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
  JWT_SECRET: z.string().min(8),
  JWT_EXPIRES_IN: z.string().default("7d"),
  BETTER_AUTH_SECRET: z.string().min(8),
  BETTER_AUTH_URL: z.string().url(),
  IMAGE_STORAGE_PATH: z.string().default("./uploads/ocr"),
  OCR_MAX_FAILURES: z.coerce.number().int().positive().default(3),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", JSON.stringify(parsedEnv.error.format(), null, 2));
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
