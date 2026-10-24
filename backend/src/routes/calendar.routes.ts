import { Router } from "express";
import { getCalendar } from "../controllers/calendar.controller";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.get("/", requireAuth, getCalendar);

export default router;
