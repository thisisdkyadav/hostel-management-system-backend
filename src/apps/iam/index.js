/**
 * @fileoverview IAM App Entry Point
 * @description Main router for identity and access management modules
 * @module apps/iam
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /users/*       -> User management routes
 * - /permissions/* -> Permission management routes
 */

import express from 'express';
import usersRoutes from './modules/users/users.routes.js';
import permissionsRoutes from './modules/permissions/permissions.routes.js';

const router = express.Router();

router.use('/users', usersRoutes);
router.use('/permissions', permissionsRoutes);

export default router;

