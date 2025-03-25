import express from "express";
import { triggerAlert, getAlerts, resolveAlert } from "../controllers/alertController.js";

const router = express.Router();

router.post("/trigger/:userId", triggerAlert);

router.get("/warden/:userId", getAlerts);
router.get("/admin/:userId", getAlerts);

router.patch("/resolve/:alertId", resolveAlert);

export default router;
