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

/**
 * Capture database-specific errors in Sentry tagged with category: database.
 */
export function captureDatabaseError(error: unknown, context?: Record<string, any>): void {
  if (env.SENTRY_DSN) {
    Sentry.withScope((scope) => {
      scope.setTag("category", "database");
      scope.setTag("db.system", "mysql");
      if (context) {
        scope.setContext("database_context", context);
      }
      Sentry.captureException(error);
    });
  }
}

