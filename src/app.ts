import express from "express";
import cors from "cors";
import { authMiddleware } from "./routes/authMiddleware";
import usersRouter from "./routes/users";
import applicantsRouter from "./routes/applicants";
import eventsRouter from "./routes/events";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

/**
 * Authentication middleware - extracts JWT token from Authorization header.
 * Attaches user info to request for protected endpoints.
 */
app.use(authMiddleware);

/**
 * Base route
 */
app.get("/", (_req, res) => {
  res.json({
    message: "QCU MSC Central Portal API is running.",
    version: "1.0.0",
    endpoints: {
      users: "/api/users",
      applicants: "/api/applicants",
      events: "/api/events",
    },
    docs: "/docs/api/",
  });
});

/**
 * API Routes
 * See /docs/api/ for detailed endpoint documentation
 */
app.use("/api/users", usersRouter);
app.use("/api/applicants", applicantsRouter);
app.use("/api/events", eventsRouter);

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
