import express from "express";
import { triggerAlert, getAlerts, resolveAlert, deleteAlert } from "../controllers/alertController.js";

const router = express.Router();

router.post("/alert/:userId", triggerAlert);
router.get("/alerts", getAlerts); 
router.put("/alert/:alertId/resolve", resolveAlert); 
router.delete("/alert/:alertId", deleteAlert); 

export default router;
