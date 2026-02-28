/**
 * Authentication Routes
 * Handles user authentication, sessions, and password reset.
 *
 * Base path: /api/v1/auth
 */

import express from 'express';
import { loginWithGoogle, logout, login, verifySSOToken, getUserDevices, logoutDevice } from './auth.session.module.js';
import { updatePassword, forgotPassword, verifyResetToken, resetPassword } from './auth.password.module.js';
import { getUser, updatePinnedTabs } from './auth.profile.module.js';
import { authenticate, refreshUserData } from '../../../../middlewares/auth.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { sendStandardResponse } from '../../../../utils/index.js';
import { success } from '../../../../services/base/index.js';
import * as authValidation from '../../../../validations/auth.validation.js';

const router = express.Router();

// User session
router.get('/user', authenticate, getUser);
router.patch(
  '/user/pinned-tabs',
  authenticate,
  validate(authValidation.updatePinnedTabsSchema),
  updatePinnedTabs
);
router.get('/logout', authenticate, logout);
router.get('/refresh', authenticate, refreshUserData, (req, res) => {
  return sendStandardResponse(res, success({ user: req.user }, 200, 'User data refreshed'));
});

// Login methods
router.post('/google', validate(authValidation.googleLoginSchema), loginWithGoogle);
router.post('/login', validate(authValidation.loginSchema), login);
router.post(
  '/update-password',
  authenticate,
  validate(authValidation.updatePasswordSchema),
  updatePassword
);
router.post('/verify-sso-token', validate(authValidation.verifySSOTokenSchema), verifySSOToken);

// Password reset (public - no auth required)
router.post('/forgot-password', validate(authValidation.forgotPasswordSchema), forgotPassword);
router.get(
  '/reset-password/:token',
  validate(authValidation.verifyResetTokenSchema, 'params'),
  verifyResetToken
);
router.post('/reset-password', validate(authValidation.resetPasswordSchema), resetPassword);

// User device management
router.get('/user/devices', authenticate, getUserDevices);
router.post(
  '/user/devices/logout/:sessionId',
  authenticate,
  validate(authValidation.logoutDeviceSchema, 'params'),
  logoutDevice
);

export default router;
