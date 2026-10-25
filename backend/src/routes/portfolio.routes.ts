import { Router } from "express";
import { getPortfolio, putPortfolio } from "../controllers/portfolio.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { portfolioSchema } from "../lib/schemas";

const router = Router();

/** A student's own portfolio. Never readable by anyone else. */
router.use(requireAuth);
router.get("/", getPortfolio);
router.put("/", validate(portfolioSchema), putPortfolio);

export default router;
