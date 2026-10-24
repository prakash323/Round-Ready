import { Router } from "express";
import {
  deleteResource,
  getSkillResources,
  listLibrary,
  saveResource,
} from "../controllers/resources.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { savedResourceSchema } from "../lib/schemas";

const router = Router();

router.use(requireAuth);
router.get("/", listLibrary);
router.post("/", validate(savedResourceSchema), saveResource);
// Declared after "/" so a skill id is never read as the collection itself.
router.get("/skill/:skillId", getSkillResources);
router.delete("/:id", deleteResource);

export default router;
