import express from 'express';
import { requireSimSecret, requireSimStudent, simAuthenticate } from './simAuth.middleware.js';
import {
  getBilling,
  getDashboard,
  getPortal,
  getRebates,
  getStats,
  resetSimulation,
  seedDining,
  selectCaterer,
} from './sim.controller.js';

const router = express.Router();

router.use(requireSimSecret);

router.post('/dining/seed', seedDining);
router.post('/dining/reset', resetSimulation);
router.get('/stats', getStats);

router.use(simAuthenticate);
router.use(requireSimStudent);

router.get('/students/dashboard', getDashboard);
router.get('/dining/portal', getPortal);
router.get('/dining/rebates', getRebates);
router.get('/dining/billing', getBilling);
router.post('/dining/select', selectCaterer);

export default router;
