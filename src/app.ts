import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { auth } from "./config/auth";
import { prisma } from "./config/database";
import { authMiddleware } from "./routes/authMiddleware";
import ocrRoutes from "./routes/ocr.routes";
import applicantRoutes from "./routes/applicant.routes";
import eventRoutes from "./routes/event.routes";
import userRoutes from "./routes/user.routes";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiters for public POST endpoints
const signUpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, errors: ["Too many sign-up attempts. Please try again later."] },
  standardHeaders: true,
  legacyHeaders: false,
});

const signInLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, errors: ["Too many sign-in attempts. Please try again later."] },
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
  name: z.string({ message: "Name is required" }),
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
    if (req.method === "POST") {
      // Pre-validate sign-up body — collect ALL errors at once
      if (req.path === "/sign-up/email") {
        const result = signUpSchema.safeParse(req.body);
        if (!result.success) {
          res.status(400).json({
            success: false,
            errors: result.error.issues.map((e: z.ZodIssue) => e.message),
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
            errors: ["Student ID already taken"],
          });
          return;
        }
      }

      // Pre-validate sign-in body
      if (req.path === "/sign-in/email") {
        const result = signInSchema.safeParse(req.body);
        if (!result.success) {
          res.status(400).json({
            success: false,
            errors: result.error.issues.map((e: z.ZodIssue) => e.message),
          });
          return;
        }
      }
    }

    const protocol = req.headers["x-forwarded-proto"] || "http";
    const host = req.headers.host || "localhost:5000";
    const url = `${protocol}://${host}${req.originalUrl}`;

    const webRequest = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: ["GET", "HEAD"].includes(req.method)
        ? undefined
        : JSON.stringify(req.body),
    });

    const webResponse = await auth.handler(webRequest);
    const bodyText = await webResponse.text();

    // Translate Better Auth "Failed to create user" fallback
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
          errors: ["Failed to create user. Please check your input."],
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

app.use("/api/v1/events", eventRoutes);

// Public routes (no auth required)
app.use("/api/v1/ocr", ocrRoutes);

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

/**
 * Base route
 */
app.get("/", (_req, res) => {
  res.json({
    message: "QCU MSC Central Portal API is running.",
    version: "1.2.0",
    endpoints: {
      auth: "/api/auth/*",
      users: "GET /api/v1/users/me",
      ocr: "POST /api/v1/ocr/verify",
      applicants: "POST /api/v1/applicants (multipart/form-data)",
    },
    docs: "/docs/api/",
  });
});

/**
 * API Routes
 * See /docs/api/ for detailed endpoint documentation
 */
// All CRUD API routes have been removed per request.

/**
 * Health check endpoint
 */
app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

/**
 * 404 handler for undefined routes
 */
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

export default app;
