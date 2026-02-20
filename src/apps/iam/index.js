/**
 * @fileoverview IAM App Entry Point
 * @description Main router for identity and access management modules
 * @module apps/iam
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /users/*       -> User management routes
 * - /authz/*       -> Layer-3 authz routes
 */

import express from 'express';
import usersRoutes from './modules/users/users.routes.js';
import authzRoutes from './modules/authz/authz.routes.js';

const router = express.Router();

router.use('/users', usersRoutes);
router.use('/authz', authzRoutes);

export default router;
