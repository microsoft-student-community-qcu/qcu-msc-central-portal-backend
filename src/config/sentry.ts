import * as Sentry from "@sentry/node";
import { env } from "./env";

/**
 * Initialize Sentry SDK for error tracking and performance monitoring.
 */
export function initSentry(): void {
  if (env.SENTRY_DSN) {
    Sentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      tracesSampleRate: env.NODE_ENV === "production" ? 0.2 : 1.0,
    });
    console.log("[Sentry] Backend monitoring initialized.");
  }
}
