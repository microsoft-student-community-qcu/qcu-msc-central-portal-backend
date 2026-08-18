import type { Request as ExpressRequest, Response as ExpressResponse } from "express";

// Better Auth exposes a single universal handler that accepts the Web API
// Request/Response standard. Express uses a different request/response model,
// so we must translate between the two. This helper is shared by:
//   - the /api/auth universal mount (src/controllers/auth.controller.ts)
//   - the portal-specific sign-in endpoints (/api/v1/auth/student|admin/sign-in)
// Both call auth.handler() and forward status, headers, and body through Express.

/**
 * Build the full URL Better Auth should route on.
 *
 * In production behind a reverse proxy (NGINX / Azure Web App),
 * x-forwarded-proto and x-forwarded-host are set automatically. Falls back
 * to http + localhost:5000 for dev.
 */
function buildAuthUrl(req: ExpressRequest, targetPath: string): string {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost:5000";
  return `${protocol}://${host}${targetPath}`;
}

/**
 * Wrap an Express request as a Web API Request for Better Auth.
 *
 * Passes through the method, headers (cookies, content-type, authorization —
 * needed for session validation, CSRF, and OAuth flows), and the JSON body
 * (skipped for GET/HEAD, which have no body).
 *
 * `targetPath` is the URL path Better Auth internally routes on, e.g.
 * /api/auth/sign-up/email or /api/auth/sign-in/email. The universal mount
 * forwards req.originalUrl so Better Auth can route any auth operation;
 * portal sign-in endpoints pin the path to /api/auth/sign-in/email.
 */
export function toBetterAuthWebRequest(
  req: ExpressRequest,
  targetPath: string,
): globalThis.Request {
  const url = buildAuthUrl(req, targetPath);
  return new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: ["GET", "HEAD"].includes(req.method)
      ? undefined
      : JSON.stringify(req.body),
  });
}

/**
 * Forward a Better Auth Web API Response back through Express and return its
 * body text (Web API Response bodies are single-use streams, so the text must
 * be consumed before the response is forwarded).
 *
 * Also translates Better Auth's generic "Failed to create user" 422 (caused by
 * a variety of account-creation failures) into our standard error contract so
 * the frontend can display a consistent message.
 */
export async function forwardBetterAuthResponse(
  webResponse: globalThis.Response,
  res: ExpressResponse,
): Promise<string> {
  const bodyText = await webResponse.text();

  if (webResponse.status === 422 && bodyText) {
    let errorBody: { message?: string } | null = null;
    try {
      errorBody = JSON.parse(bodyText);
    } catch {
      // ignore parse errors
    }

    if (errorBody?.message === "Failed to create user") {
      res.status(400).json({
        success: false,
        message: "Failed to create user. Please check your input.",
      });
      return bodyText;
    }
  }

  res.status(webResponse.status);
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.send(bodyText);
  return bodyText;
}