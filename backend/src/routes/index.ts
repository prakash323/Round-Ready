import { Router } from "express";
import applicationRoutes from "./application.routes";
import authRoutes from "./auth.routes";
import boardRoutes from "./board.routes";
import calendarRoutes from "./calendar.routes";
import dashboardRoutes from "./dashboard.routes";
import driveRoutes from "./drive.routes";
import jdRoutes from "./jd.routes";
import noteRoutes from "./note.routes";
import policyRoutes from "./policy.routes";
import practiceRoutes from "./practice.routes";
import profileRoutes from "./profile.routes";
import resourceRoutes from "./resources.routes";
import simulateRoutes from "./simulate.routes";
import skillRoutes from "./skills.routes";
import studyTaskRoutes from "./studytask.routes";

/**
 * Everything under /api.
 *
 * The folder is lowercase on purpose: a capitalised `Routes` works on Windows
 * and breaks on a case-sensitive deploy filesystem the first time an import
 * does not match exactly. `forceConsistentCasingInFileNames` in tsconfig.json
 * turns that into a compile error rather than a 3am production surprise.
 */
const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true });
});

router.use("/auth", authRoutes);
router.use("/profile", profileRoutes);
router.use("/policy", policyRoutes);
router.use("/drives", driveRoutes);
router.use("/applications", applicationRoutes);
router.use("/board", boardRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/jd", jdRoutes);
router.use("/skills", skillRoutes);
router.use("/study-tasks", studyTaskRoutes);
router.use("/notes", noteRoutes);
router.use("/practice", practiceRoutes);
router.use("/resources", resourceRoutes);
router.use("/simulate", simulateRoutes);
router.use("/calendar", calendarRoutes);

export default router;
