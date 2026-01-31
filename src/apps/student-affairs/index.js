/**
 * @fileoverview Student Affairs App Entry Point
 * @description Main router for the Student Affairs application
 * @module apps/student-affairs
 *
 * @routes
 * All routes are prefixed with /api/v1/student-affairs
 *
 * Modules:
 * - /grievances    - Student grievance management
 * - /scholarships  - Scholarship applications
 * - /counseling    - Counseling appointments
 * - /disciplinary  - Disciplinary actions
 * - /clubs         - Student clubs & organizations
 * - /elections     - Student body elections
 */

import express from 'express';

// Import module routes (uncomment as modules are built)
import grievanceRoutes from './modules/grievance/grievance.routes.js';
// import scholarshipRoutes from './modules/scholarship/scholarship.routes.js';
// import counselingRoutes from './modules/counseling/counseling.routes.js';
// import disciplinaryRoutes from './modules/disciplinary/disciplinary.routes.js';
// import clubRoutes from './modules/clubs/club.routes.js';
// import electionRoutes from './modules/elections/election.routes.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/health', (req, res) => {
  res.json({
    success: true,
    app: 'student-affairs',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MODULE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// Uncomment as modules are implemented:

router.use('/grievances', grievanceRoutes);
// router.use('/scholarships', scholarshipRoutes);
// router.use('/counseling', counselingRoutes);
// router.use('/disciplinary', disciplinaryRoutes);
// router.use('/clubs', clubRoutes);
// router.use('/elections', electionRoutes);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default router;
