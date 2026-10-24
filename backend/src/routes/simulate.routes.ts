import { Router } from "express";
import { postSimulate } from "../controllers/simulate.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { simulateSchema } from "../lib/schemas";

const router = Router();

// A read-only POST: the body carries the hypothesis and nothing is written.
router.post("/", requireAuth, validate(simulateSchema), postSimulate);

export default router;
