/**
 * Authentication Routes
 * Handles user authentication, sessions, and SSO
 * 
 * Base path: /api/auth
 */

import express from 'express';
import {
  loginWithGoogle,
  logout,
  getUser,
  login,
  updatePassword,
  verifySSOToken,
  getUserDevices,
  logoutDevice,
} from '../controllers/authController.js';
import { authenticate, refreshUserData } from '../../../middlewares/auth.middleware.js';
import { validate } from '../../../validations/validate.middleware.js';
import {
  loginSchema,
  googleLoginSchema,
  updatePasswordSchema,
  logoutDeviceSchema,
} from '../../../validations/auth.validation.js';

const router = express.Router();

// User session
router.get('/user', authenticate, getUser);
router.get('/logout', authenticate, logout);
router.get('/refresh', authenticate, refreshUserData, (req, res) => {
  res.json({ user: req.user, message: 'User data refreshed' });
});

// Login methods
router.post('/google', validate(googleLoginSchema), loginWithGoogle);
router.post('/login', validate(loginSchema), login);
router.post('/update-password', authenticate, validate(updatePasswordSchema), updatePassword);
router.post('/verify-sso-token', verifySSOToken);

// User device management
router.get('/user/devices', authenticate, getUserDevices);
router.post('/user/devices/logout/:sessionId', authenticate, validate(logoutDeviceSchema), logoutDevice);

export default router;
