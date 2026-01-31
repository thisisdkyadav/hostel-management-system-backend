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

// User device management
router.get('/user/devices', authenticate, getUserDevices);
router.post('/user/devices/logout/:sessionId', authenticate, logoutDevice);

export default router;
