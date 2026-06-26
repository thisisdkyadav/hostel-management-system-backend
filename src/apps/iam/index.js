/**
 * @fileoverview IAM App Entry Point
 * @description Main router for identity and access management modules
 * @module apps/iam
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /users/*       -> User management routes
 * - /signature/*   -> Self-service signature management + admin signatory directory
 *
 * Note: authz management endpoints (/authz/*) have moved to the Go backend.
 * Express still enforces authz at runtime via src/middlewares/authz.middleware.js
 * and src/core/authz, but no longer serves authz CRUD routes.
 */

import express from 'express';
import usersRoutes from './modules/users/users.routes.js';
import { signatureRoutes } from './modules/signature/index.js';

const router = express.Router();

router.use('/users', usersRoutes);
router.use('/signature', signatureRoutes);

export default router;
