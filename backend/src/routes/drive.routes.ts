import { Router } from "express";
import {
  createDrive,
  deleteDrive,
  getDrive,
  listDrives,
  patchDrive,
} from "../controllers/drive.controller";
import { requireAuth, requireOfficer } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { driveSchema } from "../lib/schemas";

const router = Router();

/**
 * Reading is for the batch; writing is for its CDC officer.
 *
 * A drive is a notice published to three hundred people, and its eligibility
 * criteria decide who may sit for it. A student editing the CGPA cutoff on a
 * shared notice changes what every classmate sees, so the write routes carry
 * `requireOfficer` and the read routes do not.
 *
 * The gate is mounted per route rather than by method, so adding a route
 * cannot accidentally inherit the wrong one.
 */
router.use(requireAuth);
router.get("/", listDrives);
router.post("/", requireOfficer, validate(driveSchema), createDrive);
router.get("/:id", getDrive);
router.patch("/:id", requireOfficer, validate(driveSchema), patchDrive);
router.delete("/:id", requireOfficer, deleteDrive);

export default router;
