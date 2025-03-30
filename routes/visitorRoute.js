import express from "express";
import { submitVisitorRequest, getVisitorRequests, updateVisitorStatus } from "../controllers/visitorController.js";
import { authenticate } from "../middlewares/auth.js";

const router = express.Router();
router.use(authenticate);

router.post("/submit", submitVisitorRequest);
router.get("/all/:hostelId", getVisitorRequests);
router.put("/update-status/:requestId", updateVisitorStatus);

export default router;
