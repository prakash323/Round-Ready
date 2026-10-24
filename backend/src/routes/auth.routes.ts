import { Router } from "express";
import { login, logout, me, register } from "../controllers/auth.controller";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/requireAuth";
import { loginSchema, registerSchema } from "../lib/schemas";

const router = Router();

// Validation runs before the controller, so a malformed body is a 422 whether
// or not Mongo is reachable.
router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

export default router;
