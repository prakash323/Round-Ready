import { Router } from "express";
import { getSkills, putSkills } from "../controllers/skills.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { skillProfileSchema } from "../lib/schemas";

const router = Router();

router.use(requireAuth);
router.get("/", getSkills);
router.put("/", validate(skillProfileSchema), putSkills);

export default router;
