import { Router } from "express";
import { registerForEvent } from "../controllers/eventController";
import { getEvents } from "../controllers/eventsFeedController";

const router = Router();

// GET /api/v1/events
router.get("/", getEvents);

// POST /api/v1/events/:eventId/register
router.post("/:eventId/register", registerForEvent);

export default router;