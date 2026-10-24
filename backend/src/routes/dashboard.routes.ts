import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

/** The overview page, assembled server-side from the student's own data. */
router.use(requireAuth);
router.get("/", getDashboard);

export default router;
