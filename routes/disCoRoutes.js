import express from "express";
import { addDisCoAction,getDisCoActionsByStudent } from "../controllers/disCoController.js";
import { authenticate } from "../middlewares/auth.js";
const router = express.Router()
router.use(authenticate)
router.post("/add", authenticate, addDisCoAction);
router.get("/:studentId", authenticate, getDisCoActionsByStudent);
export default router