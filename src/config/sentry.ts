import * as Sentry from "@sentry/node";
import { env } from "./env";

/**
 * Initialize Sentry SDK for error tracking and performance monitoring.
 */
export function initSentry(): void {
  const dsn = env.SENTRY_DSN || process.env.SENTRY_DSN;
  if (dsn) {
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENV || env.NODE_ENV,
      release: process.env.APP_VERSION || "unknown",
      tracesSampleRate: env.NODE_ENV === "production" ? 0.2 : 1.0,
      integrations: [
        Sentry.httpIntegration(),
        Sentry.expressIntegration(),
        Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
      ],
      enableLogs: true,
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

