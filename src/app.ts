import express from "express";
import cors from "cors";
import { authMiddleware } from "./routes/authMiddleware";
import ocrRoutes from "./routes/ocr.routes";
import applicantRoutes from "./routes/applicant.routes";
import eventRoutes from "./routes/event.routes";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/v1/events", eventRoutes);

// Public routes (no auth required)
app.use("/api/v1/ocr", ocrRoutes);

/**
 * Authentication middleware - extracts JWT token from Authorization header.
 * Attaches user info to request for protected endpoints.
 *
 * Note: This middleware does NOT block unauthenticated requests — it sets
 * req.userId / req.userRole to null and continues. Routes registered after
 * this point can be either public (no guard) or protected (use require* guard).
 */
app.use(authMiddleware);

// Applicant routes — registered after auth middleware.
// POST /api/v1/applicants is public (no requireAuth guard used in the route).
// Future GET/PATCH routes can use requireAdminHR for admin-only access.
app.use("/api/v1/applicants", applicantRoutes);

/**
 * Base route
 */
app.get("/", (_req, res) => {
  res.json({
    message: "QCU MSC Central Portal API is running.",
    version: "1.0.0",
    endpoints: {
      ocr: "POST /api/v1/ocr/verify",
      applicants: "POST /api/v1/applicants",
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
