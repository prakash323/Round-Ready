import { Router } from "express";
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
} from "../controllers/note.controller";
import { requireAuth } from "../middleware/requireAuth";
import { validate } from "../middleware/validate";
import { noteSchema } from "../lib/schemas";

const router = Router();

/** A student's own notes. Every handler filters by the session's user. */
router.use(requireAuth);
router.get("/", listNotes);
router.post("/", validate(noteSchema), createNote);
router.get("/:id", getNote);
router.put("/:id", validate(noteSchema), updateNote);
router.delete("/:id", deleteNote);

export default router;
