import express from "express";
import cors from "cors";
import { auth } from "./config/auth";
import { authMiddleware } from "./routes/authMiddleware";
import ocrRoutes from "./routes/ocr.routes";
import applicantRoutes from "./routes/applicant.routes";
import eventRoutes from "./routes/event.routes";
import userRoutes from "./routes/user.routes";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Better Auth handler — manages sign-up, sign-in, OAuth, sessions
app.use("/api/auth", auth.handler);

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
