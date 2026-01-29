/**
 * SSO Routes
 * Handles Single Sign-On integration
 * 
 * Base path: /api/sso
 */

import express from 'express';
import { redirect, verifySSOToken } from '../../../controllers/ssoController.js';

const router = express.Router();

// SSO redirect - creates JWT token and redirects
router.get('/redirect', redirect);

// SSO token verification
router.post('/verify', verifySSOToken);

// Note: /api/sso/verify with special CORS is handled directly in server.js

export default router;
