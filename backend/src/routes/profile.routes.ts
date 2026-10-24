import { Router } from "express";
import { getProfile, putProfile } from "../controllers/profile.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { profileSchema } from "../lib/schemas";

const router = Router();

router.use(requireAuth);
router.get("/", getProfile);
router.put("/", validate(profileSchema), putProfile);

export default router;
