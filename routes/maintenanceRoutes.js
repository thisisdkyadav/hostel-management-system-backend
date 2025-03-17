import express from 'express';
import { getDashboardStats, getRecentComplaints } from '../controllers/maintenanceController.js';

const router = express.Router();

// Dashboard stats route
router.get('/stats', getDashboardStats);

// Recent complaints route
router.get('/recent', getRecentComplaints);

export default router;
