import { Router } from "express";
import {
  listAttempts,
  listTopics,
  startAttempt,
  submitAttempt,
} from "../controllers/practice.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { startAssessmentSchema, submitAssessmentSchema } from "../lib/schemas";

const router = Router();

/** A student's own practice. Every handler is scoped to the session's user. */
router.use(requireAuth);
// Static segments before the dynamic one, so "topics" is never read as an id.
router.get("/topics", listTopics);
router.get("/attempts", listAttempts);
router.post("/attempts", validate(startAssessmentSchema), startAttempt);
router.post("/attempts/:id/submit", validate(submitAssessmentSchema), submitAttempt);

export default router;
