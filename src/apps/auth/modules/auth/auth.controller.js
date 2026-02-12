/**
 * Auth Controller
 * Handles HTTP layer for authentication operations.
 *
 * Business logic delegated to authService.
 */

import { authService } from './auth.service.js';
import { asyncHandler } from '../../../../utils/index.js';

/**
 * Login with email and password
 * POST /api/v1/auth/login
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const result = await authService.validateCredentials(email, password);
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  const user = result.user;
  const { userResponse, essentialData } = await authService.setupUserSession(user);

  req.session.userId = user._id;
  req.session.userData = essentialData;
  req.session.role = user.role;
  req.session.email = user.email;

  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress;

  await authService.createDeviceSession({
    userId: user._id,
    sessionId: req.sessionID,
    userAgent,
    ip,
  });

  req.session.save((err) => {
    if (err) {
      return res.status(500).json({
        message: 'Failed to create session. Please try again.',
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse,
    });
  });
});

/**
 * Login with Google OAuth
 * POST /api/v1/auth/google
 */
export const loginWithGoogle = asyncHandler(async (req, res) => {
  const { token } = req.body;

  const result = await authService.validateGoogleToken(token);
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  const user = result.user;

  req.session.userId = user._id;
  req.session.role = user.role;
  req.session.email = user.email;

  const { userResponse, essentialData } = await authService.setupUserSession(user);
  req.session.userData = essentialData;

  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress;

  await authService.createDeviceSession({
    userId: user._id,
    sessionId: req.sessionID,
    userAgent,
    ip,
  });

  res.json({
    user: userResponse,
    message: 'Login successful',
  });
});

/**
 * Logout current session
 * GET /api/v1/auth/logout
 */
export const logout = asyncHandler(async (req, res) => {
  if (req.sessionID) {
    await authService.deleteSession(req.sessionID);

    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: 'Logout failed' });
      }
      res.clearCookie('connect.sid');
      res.json({ message: 'Logged out successfully' });
    });
  } else {
    res.json({ message: 'No active session' });
  }
});

/**
 * Get current user
 * GET /api/v1/auth/user
 */
export const getUser = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const result = await authService.getUserById(userId);

  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  res.json(result.user);
});

/**
 * Update user password
 * POST /api/v1/auth/update-password
 */
export const updatePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const userId = req.user._id;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({
      message: 'Old password and new password are required',
    });
  }

  const result = await authService.updatePassword(userId, oldPassword, newPassword);
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  res.json({ message: 'Password updated successfully' });
});

/**
 * Get user devices/sessions
 * GET /api/v1/auth/user/devices
 */
export const getUserDevices = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const devices = await authService.getUserDevices(userId, req.sessionID, req.sessionStore);
  res.json({ devices });
});

/**
 * Logout specific device
 * POST /api/v1/auth/user/devices/logout/:sessionId
 */
export const logoutDevice = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { sessionId } = req.params;

  const result = await authService.logoutDevice(userId, sessionId, req.sessionID);
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  if (result.isCurrentSession) {
    return logout(req, res);
  }

  req.sessionStore.destroy(sessionId, () => {
    // Ignore errors - session may already be destroyed.
  });

  res.json({ message: 'Device logged out successfully' });
});

/**
 * Verify SSO token and login
 * POST /api/v1/auth/verify-sso-token
 */
export const verifySSOToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ message: 'Token is required' });
  }

  const result = await authService.verifySSOToken(token);
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  const user = result.user;

  req.session.userId = user._id;
  req.session.role = user.role;
  req.session.email = user.email;

  const { userResponse, essentialData } = await authService.setupUserSession(user);
  req.session.userData = essentialData;

  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ip = req.ip || req.connection.remoteAddress;

  await authService.createDeviceSession({
    userId: user._id,
    sessionId: req.sessionID,
    userAgent,
    ip,
  });

  res.json({
    user: userResponse,
    message: 'SSO authentication successful',
  });
});

/**
 * Request password reset
 * POST /api/v1/auth/forgot-password
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const result = await authService.requestPasswordReset(email);

  res.json({
    success: true,
    message: result.message,
  });
});

/**
 * Verify password reset token
 * GET /api/v1/auth/reset-password/:token
 */
export const verifyResetToken = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ message: 'Reset token is required' });
  }

  const result = await authService.verifyResetToken(token);
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  res.json({
    success: true,
    message: 'Token is valid',
    user: result.user,
  });
});

/**
 * Reset password with token
 * POST /api/v1/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and password are required' });
  }

  const result = await authService.resetPasswordWithToken(token, password);
  if (!result.success) {
    return res.status(result.statusCode).json({ message: result.error });
  }

  res.json({
    success: true,
    message: result.message,
  });
});

