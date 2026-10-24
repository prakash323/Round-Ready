import { Router } from "express";
import { getGaps, getPlan, patchPlan } from "../controllers/skills.controller";
import {
  deleteJobDescription,
  getForDrive,
  getJobDescription,
  listJobDescriptions,
  patchJobDescription,
  postAnalyse,
  putJobDescription,
} from "../controllers/jd.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { analyseJdSchema, jobDescriptionSchema, planSettingsSchema } from "../lib/schemas";

const router = Router();

router.use(requireAuth);

// A read-only POST: the body carries the text, nothing is written.
router.post("/analyse", validate(analyseJdSchema), postAnalyse);

router.get("/", listJobDescriptions);
router.put("/", validate(jobDescriptionSchema), putJobDescription);
// Declared before "/:id" so "for-drive" is never read as an id.
router.get("/for-drive/:driveId", getForDrive);
router.get("/:id", getJobDescription);
router.get("/:id/gaps", getGaps);
router.get("/:id/plan", getPlan);
router.patch("/:id/plan", validate(planSettingsSchema), patchPlan);
router.patch("/:id", validate(jobDescriptionSchema), patchJobDescription);
router.delete("/:id", deleteJobDescription);

export default router;
