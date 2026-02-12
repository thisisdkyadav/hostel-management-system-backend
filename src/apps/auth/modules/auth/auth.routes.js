/**
 * Authentication Routes
 * Handles user authentication, sessions, and password reset.
 *
 * Base path: /api/v1/auth
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
  forgotPassword,
  verifyResetToken,
  resetPassword,
} from './auth.controller.js';
import { authenticate, refreshUserData } from '../../../../middlewares/auth.middleware.js';

const router = express.Router();

// User session
router.get('/user', authenticate, getUser);
router.get('/logout', authenticate, logout);
router.get('/refresh', authenticate, refreshUserData, (req, res) => {
  res.json({ user: req.user, message: 'User data refreshed' });
});

// Login methods
router.post('/google', loginWithGoogle);
router.post('/login', login);
router.post('/update-password', authenticate, updatePassword);
router.post('/verify-sso-token', verifySSOToken);

// Password reset (public - no auth required)
router.post('/forgot-password', forgotPassword);
router.get('/reset-password/:token', verifyResetToken);
router.post('/reset-password', resetPassword);

// User device management
router.get('/user/devices', authenticate, getUserDevices);
router.post('/user/devices/logout/:sessionId', authenticate, logoutDevice);

export default router;

