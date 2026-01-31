/**
 * @fileoverview Grievance Routes
 * @description API routes for grievance management
 * @module apps/student-affairs/modules/grievance/routes
 *
 * @routes
 * POST   /                  - Create grievance
 * GET    /                  - List grievances
 * GET    /stats             - Get statistics
 * GET    /:id               - Get grievance by ID
 * DELETE /:id               - Delete grievance
 * PATCH  /:id/status        - Update status
 * PATCH  /:id/assign        - Assign to staff
 * PATCH  /:id/resolve       - Resolve grievance
 * POST   /:id/comments      - Add comment
 */

import express from 'express';
import { authorizeRoles as authorize } from '../../../../middlewares/authorize.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import * as grievanceController from './grievance.controller.js';
import * as validation from './grievance.validation.js';
import { SA_ROLE_GROUPS } from '../../constants/index.js';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICS (before /:id to avoid route conflict)
// ═══════════════════════════════════════════════════════════════════════════════

router.get(
  '/stats',
  authorize(...SA_ROLE_GROUPS.ADMINS),
  grievanceController.getStatistics
);

// ═══════════════════════════════════════════════════════════════════════════════
// CRUD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

router
  .route('/')
  .get(
    validate(validation.getGrievancesSchema, 'query'),
    grievanceController.getGrievances
  )
  .post(
    authorize('Student'),
    validate(validation.createGrievanceSchema),
    grievanceController.createGrievance
  );

router
  .route('/:id')
  .get(
    validate(validation.idParamSchema, 'params'),
    grievanceController.getGrievanceById
  )
  .delete(
    validate(validation.idParamSchema, 'params'),
    grievanceController.deleteGrievance
  );

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS & ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════════════

router.patch(
  '/:id/status',
  authorize(...SA_ROLE_GROUPS.GRIEVANCE_HANDLERS),
  validate(validation.idParamSchema, 'params'),
  validate(validation.updateStatusSchema),
  grievanceController.updateStatus
);

router.patch(
  '/:id/assign',
  authorize(...SA_ROLE_GROUPS.ADMINS),
  validate(validation.idParamSchema, 'params'),
  validate(validation.assignGrievanceSchema),
  grievanceController.assignGrievance
);

router.patch(
  '/:id/resolve',
  authorize(...SA_ROLE_GROUPS.GRIEVANCE_HANDLERS),
  validate(validation.idParamSchema, 'params'),
  validate(validation.resolveGrievanceSchema),
  grievanceController.resolveGrievance
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════════════════════════════════════════

router.post(
  '/:id/comments',
  validate(validation.idParamSchema, 'params'),
  validate(validation.addCommentSchema),
  grievanceController.addComment
);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default router;
