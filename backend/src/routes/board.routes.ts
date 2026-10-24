import { Router } from "express";
import { getAgenda, getBoard } from "../controllers/board.controller";
import { requireAuth } from "../middleware/requireAuth";

const router = Router();

router.use(requireAuth);
router.get("/", getBoard);
router.get("/agenda", getAgenda);

export default router;
