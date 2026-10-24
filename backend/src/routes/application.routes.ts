import { Router } from "express";
import {
  deleteApplication,
  listApplications,
  putApplication,
} from "../controllers/application.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { applicationSchema } from "../lib/schemas";

const router = Router();

router.use(requireAuth);
router.get("/", listApplications);
router.put("/", validate(applicationSchema), putApplication);
router.delete("/", deleteApplication);

export default router;
