/**
 * @fileoverview Auth App Entry Point
 * @description Main router for authentication and SSO modules
 * @module apps/auth
 *
 * @routes
 * All routes are mounted at /api/v1
 * - /auth/*  -> Authentication routes
 * - /sso/*   -> SSO bridge routes
 */

import express from 'express';
import authRoutes from './modules/auth/auth.routes.js';
import ssoRoutes from './modules/sso/sso.routes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/sso', ssoRoutes);

export default router;

