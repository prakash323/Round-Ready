import { Router } from "express";
import {
  commitPlan,
  createTask,
  deleteTask,
  listMonth,
  previewPlan,
  setCompletion,
  updateTask,
} from "../controllers/studytask.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import {
  planCommitSchema,
  planPreviewSchema,
  studyTaskSchema,
  taskCompletionSchema,
} from "../lib/schemas";

const router = Router();

/**
 * A student's own study tasks. No officer involvement at any point: a planner
 * is personal, and every query is scoped to the session's user.
 */
router.use(requireAuth);
router.get("/", listMonth);

// Static segments before the dynamic ones, so "plan" is never read as an id.
router.post("/plan/preview", validate(planPreviewSchema), previewPlan);
router.post("/plan/commit", validate(planCommitSchema), commitPlan);

router.post("/", validate(studyTaskSchema), createTask);
router.put("/:id", validate(studyTaskSchema), updateTask);
router.patch("/:id/completion", validate(taskCompletionSchema), setCompletion);
router.delete("/:id", deleteTask);

export default router;
