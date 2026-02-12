/**
 * SSO Routes
 * Handles Single Sign-On integration.
 *
 * Base path: /api/v1/sso
 */

import express from 'express';
import { redirect, verifySSOToken } from './sso.controller.js';

const router = express.Router();

router.get('/redirect', redirect);
router.post('/verify', verifySSOToken);

export default router;

