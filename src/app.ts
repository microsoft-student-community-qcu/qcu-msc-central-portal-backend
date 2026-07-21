import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "./config/env";
import { auth } from "./config/auth";
import { prisma } from "./config/database";
import { authMiddleware } from "./routes/authMiddleware";
import * as Sentry from "@sentry/node";
import { initSentry } from "./config/sentry";
import ocrRoutes from "./routes/ocr.routes";
import applicantRoutes from "./routes/applicant.routes";
import { resendSetupLink } from "./controllers/applicant.controller";
import eventRoutes from "./routes/event.routes";
import userRoutes from "./routes/user.routes";

initSentry();

const app = express();

// Middleware
app.use(cors({
  origin: [env.FRONTEND_URL, env.ADMIN_FRONTEND_URL],
  credentials: true,
}));
app.use(express.json());

// Rate limiters for public POST endpoints
const signUpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: "Too many sign-up attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const signInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many sign-in attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth/sign-up/email", signUpLimiter);
app.use("/api/auth/sign-in/email", signInLimiter);

const signUpSchema = z.object({
  email: z.string({ message: "Email is required" }).email({ message: "Invalid email format" }),
  password: z
    .string({ message: "Password is required" })
    .min(8, { message: "Password must be at least 8 characters" }),
  firstName: z.string({ message: "First name is required" }).min(1, "First name cannot be empty"),
  lastName: z.string({ message: "Last name is required" }).min(1, "Last name cannot be empty"),
  middleInitial: z
    .string({ message: "Middle initial must be a single letter" })
    .regex(/^[A-Za-z]\.?$/, "Middle initial must be a single letter, optionally followed by a dot")
    .optional(),
  studentId: z.string({ message: "Student ID is required" }),
});

const signInSchema = z.object({
  email: z.string({ message: "Email is required" }).email({ message: "Invalid email format" }),
  password: z.string({ message: "Password is required" }),
});

// Better Auth handler — manages sign-up, sign-in, OAuth, sessions
// auth.handler is a Web API (Request) => Response function.
// We wrap it for Express since Express cannot use it directly.
app.use("/api/auth", async (req, res, next) => {
  try {
    // Block direct sign-in — each portal must use its dedicated endpoint
    if (req.method === "POST" && req.path === "/sign-in/email") {
      res.status(400).json({
        success: false,
        message: "Direct sign-in is not available. Use /api/v1/auth/student/sign-in or /api/v1/auth/admin/sign-in instead.",
      });
      return;
    }

    if (req.method === "POST") {
      // Pre-validate sign-up body — collect ALL errors at once
      if (req.path === "/sign-up/email") {
        const result = signUpSchema.safeParse(req.body);
        if (!result.success) {
          res.status(400).json({
            success: false,
            message: "Validation error",
            errors: result.error.flatten().fieldErrors,
          });
          return;
        }

        // Check studentId uniqueness
        const existing = await prisma.user.findUnique({
          where: { studentId: result.data.studentId },
          select: { id: true },
        });
        if (existing) {
          res.status(400).json({
            success: false,
            message: "Student ID already taken",
          });
          return;
        }

        // Construct full name server-side from split fields (Better Auth requires `name`)
        req.body.name = `${result.data.firstName} ${result.data.lastName}`.trim();
      }

      // Pre-validate sign-in body
      if (req.path === "/sign-in/email") {
        const result = signInSchema.safeParse(req.body);
        if (!result.success) {
          res.status(400).json({
            success: false,
            message: "Validation error",
            errors: result.error.flatten().fieldErrors,
          });
          return;
        }
      }
    }

    // ── Better Auth Forwarding ──────────────────────────────────────────────
    // Better Auth exposes a single universal handler that accepts the Web API
    // Request/Response standard. Express uses a different request/response
    // model, so we must translate between the two.
    //
    // Steps:
    //   1. Build a full URL  → Better Auth routes requests by URL path
    //      (e.g. /api/auth/sign-up/email → account creation,
    //       /api/auth/sign-in/email    → sign in,
    //       /api/auth/get-session      → session lookup)
    //   2. Wrap the Express request into a Web API Request object
    //   3. Call auth.handler() — it returns a Web API Response
    //   4. Copy the status, headers, and body back to Express res

    // Extract the protocol and host from the incoming request so Better Auth
    // sees the same origin the client sees. In production behind a reverse
    // proxy (NGINX / Azure Web App), x-forwarded-proto and x-forwarded-host
    // are set automatically. Falls back to http + localhost:5000 for dev.
    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host || "localhost:5000";

    // req.originalUrl is the full path Express sees (e.g. /api/auth/sign-up/email).
    // Better Auth internally parses this path to determine the auth operation,
    // extract query params, and generate redirect URLs.
    const url = `${protocol}://${host}${req.originalUrl}`;

    // Convert Express request into a Web API Request. Better Auth only
    // understands this interface. We pass through:
    //   - method:  POST / GET (Better Auth reads this to determine action)
    //   - headers: cookies, content-type, authorization (needed for session
    //              validation, CSRF, and OAuth flows)
    //   - body:    JSON payload; skipped for GET/HEAD (they have no body)
    const webRequest = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: ["GET", "HEAD"].includes(req.method)
        ? undefined
        : JSON.stringify(req.body),
    });

    // Delegate to Better Auth. It handles password hashing, session creation,
    // OAuth token exchange, etc. internally and returns a standard Response.
    const webResponse = await auth.handler(webRequest);

    // Read the response body as text. Must consume it before forwarding
    // headers because Web API Response bodies are single-use streams.
    const bodyText = await webResponse.text();

    // ── Error Translation ───────────────────────────────────────────
    // Better Auth returns a generic "Failed to create user" when account
    // creation fails for various reasons (duplicate email, invalid data).
    // We translate this to a clearer, user-friendly message in our standard
    // JSON format so the frontend can display it consistently.
    if (
      webResponse.status === 422 &&
      bodyText
    ) {
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
        return;
      }
    }

    res.status(webResponse.status);
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.send(bodyText);
  } catch (error) {
    next(error);
  }
});


// Public routes (no auth required)
app.use("/api/v1/ocr", ocrRoutes);

const resendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { success: false, message: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post("/api/v1/applicants/resend-setup-link", resendLimiter, resendSetupLink);

// ── Portal-Specific Sign-In Endpoints ─────────────────────────────────────
// Each portal has a dedicated sign-in endpoint that enforces role boundaries:
//   Student Portal → APPLICANT / MEMBER only
//   Admin Portal   → ADMIN_HR / ADMIN_LOGISTICS only
// The generic /api/auth/sign-in/email is disabled to prevent ambiguous access.

const studentSignInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many sign-in attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const adminSignInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many sign-in attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.post("/api/v1/auth/student/sign-in", studentSignInLimiter, async (req, res) => {
  const result = signInSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      message: "Validation error",
      errors: result.error.flatten().fieldErrors,
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: result.data.email },
    select: { role: true },
  });

  if (user && (user.role === "ADMIN_HR" || user.role === "ADMIN_LOGISTICS")) {
    res.status(403).json({
      success: false,
      message: "Admin accounts cannot sign in through the Student Portal. Please use the Admin Portal.",
    });
    return;
  }

  // ── Better Auth Forwarding ──────────────────────────────────────────────
  // Better Auth is a universal auth library that exposes a single Web API
  // handler: auth.handler(request: Request) => Promise<Response>.
  // It does NOT understand Express's req/res — only the Web API standard.
  //
  // To use it from Express, we must:
  //   1. Reconstruct the full URL  (protocol + host + Better Auth's path)
  //   2. Wrap the request into a Web API Request object
  //   3. Call auth.handler() and send its Response back through Express
  //
  // The target URL path (/api/auth/sign-in/email) must match Better Auth's
  // internal route so it knows to process this as an email/password sign-in.
  // We only change the path — the method, headers, and body pass through.

  // Extract the protocol from the proxy-forwarded header, or default to http.
  // In production behind a reverse proxy (NGINX / Azure), this header is set
  // automatically. Better Auth needs the full scheme to generate correct
  // redirect URLs and validate the origin.
  const protocol = req.headers["x-forwarded-proto"] || "http";

  // Extract the hostname from the incoming request so Better Auth sees the
  // same origin the client sees. Falls back to localhost:5000 for dev.
  const host = req.headers.host || "localhost:5000";

  // Assemble the full URL that Better Auth will internally route.
  // Better Auth parses the URL path to determine which auth operation to
  // run (sign-in, sign-up, get-session, etc.). By pointing at
  // /api/auth/sign-in/email, we tell Better Auth: "this is an email/password
  // sign-in request". The query string is omitted — email sign-in is a
  // simple POST with a JSON body and needs no query parameters.
  const url = `${protocol}://${host}/api/auth/sign-in/email`;

  // Convert the Express request into a Web API Request object.
  // Better Auth's handler only accepts this standard interface. We forward:
  //   - method:  POST (unchanged)
  //   - headers: cookies, content-type, authorization, etc. (Better Auth
  //              needs these for session parsing and CSRF protection)
  //   - body:    the JSON payload containing email + password
  const webRequest = new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: JSON.stringify(req.body),
  });

  // Delegate to Better Auth. It validates the password against the stored
  // hash, creates a session, and returns a Web API Response containing
  // the user + session data (or an error if credentials are wrong).
  const webResponse = await auth.handler(webRequest);

  // Read the response body as text so we can send it through Express.
  // We must read it before setting Express headers because ReadableStream
  // can only be consumed once.
  const bodyText = await webResponse.text();

  // Copy the status code from Better Auth's response (e.g. 200 success,
  // 401 invalid credentials) to Express.
  res.status(webResponse.status);

  // Forward all response headers from Better Auth (set-cookie for session,
  // content-type, etc.) to the client through Express.
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  // Send the response body (user/session JSON or error) back to the client.
  res.send(bodyText);
});

app.post("/api/v1/auth/admin/sign-in", adminSignInLimiter, async (req, res) => {
  const result = signInSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      success: false,
      message: "Validation error",
      errors: result.error.flatten().fieldErrors,
    });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email: result.data.email },
    select: { role: true },
  });

  if (!user || (user.role !== "ADMIN_HR" && user.role !== "ADMIN_LOGISTICS")) {
    res.status(403).json({
      success: false,
      message: "Access denied. Only admin accounts can sign in through the Admin Portal.",
    });
    return;
  }

  // ── Better Auth Forwarding ──────────────────────────────────────────────
  // Same bridging logic as the student sign-in endpoint above.
  // Better Auth's handler expects a Web API Request, not an Express req.
  // See the student endpoint for detailed commentary on each step.
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost:5000";
  const url = `${protocol}://${host}/api/auth/sign-in/email`;

  const webRequest = new Request(url, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: JSON.stringify(req.body),
  });

  const webResponse = await auth.handler(webRequest);
  const bodyText = await webResponse.text();

  res.status(webResponse.status);
  webResponse.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.send(bodyText);
});

/**
 * Authentication middleware — validates the session via Better Auth.
 * Sets req.userId / req.userRole to null for unauthenticated requests.
 * Routes registered after this point can be either public or protected.
 */
app.use(authMiddleware);

// User routes
app.use("/api/v1/users", userRoutes);

// Applicant routes
app.use("/api/v1/applicants", applicantRoutes);
app.use("/api/v1/events", eventRoutes);

/**
 * Base route
 */
app.get("/", (_req, res) => {
  res.json({
    message: "QCU MSC Central Portal API is running.",
    version: "1.2.0",
    endpoints: {
      "auth:sign-in:student": "POST /api/v1/auth/student/sign-in",
      "auth:sign-in:admin": "POST /api/v1/auth/admin/sign-in",
      users: "GET /api/v1/users/me",
      ocr: "POST /api/v1/ocr/verify",
      applicants: "POST /api/v1/applicants (multipart/form-data)",
      "resend-setup-link": "POST /api/v1/applicants/resend-setup-link",
    },
    docs: "/docs/api/",
  });
});

/**
 * API Routes
 * See /docs/api/ for detailed endpoint documentation
 */
// All CRUD API routes have been removed per request.

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "healthy", database: "connected" });
  } catch (error: any) {
    res.status(500).json({ status: "unhealthy", database: "disconnected", error: error.message });
  }
});

/**
 * Sentry error handler — captures unhandled errors and sends reports
 */
Sentry.setupExpressErrorHandler(app);

/**
 * 404 handler for undefined routes
 */
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
  });
});

export default app;
