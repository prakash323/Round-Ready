import { Router } from "express";
import { getPolicy, putPolicy } from "../controllers/policy.controller";
import { requireAuth, requireOfficer } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { batchPolicySchema } from "../lib/schemas";

const router = Router();

router.use(requireAuth);

// Read by anyone in the batch — a student gated by this rule should be able to
// see it. Written only by the officer who sets it.
router.get("/", getPolicy);
router.put("/", requireOfficer, validate(batchPolicySchema), putPolicy);

export default router;
