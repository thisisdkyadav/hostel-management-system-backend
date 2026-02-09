/**
 * Auth Service
 * Contains business logic extracted from authController
 * 
 * IMPORTANT: All logic copied exactly from controller
 * Only HTTP-specific code (req, res) removed
 * 
 * @module services/auth.service
 */

import crypto from 'crypto';
import { User } from '../../../models/index.js';
import { Session } from '../../../models/index.js';
import { PasswordResetToken } from '../../../models/index.js';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { generateKey } from '../../../utils/qrUtils.js';
import { emailService } from '../../../services/email/index.js';

/**
 * Helper function to extract device name from user agent
 * @param {string} userAgent - Browser user agent string
 * @returns {string} Device name
 */
export function getDeviceNameFromUserAgent(userAgent) {
  if (!userAgent) return 'Unknown device';

  // Mobile detection
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android device';

  // Browser detection
  if (/Chrome/.test(userAgent) && !/Chromium|Edge/.test(userAgent)) return 'Chrome browser';
  if (/Firefox/.test(userAgent)) return 'Firefox browser';
  if (/Safari/.test(userAgent) && !/Chrome|Chromium/.test(userAgent)) return 'Safari browser';
  if (/Edge|Edg/.test(userAgent)) return 'Edge browser';
  if (/MSIE|Trident/.test(userAgent)) return 'Internet Explorer';

  // OS detection for desktop
  if (/Windows/.test(userAgent)) return 'Windows device';
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac device';
  if (/Linux/.test(userAgent)) return 'Linux device';

  return 'Unknown device';
}

/**
 * Helper function to check if a session exists in the session store
 * @param {Object} store - Session store
 * @param {string} sessionId - Session ID to check
 * @returns {Promise<boolean>}
 */
export async function sessionExistsInStore(store, sessionId) {
  return new Promise((resolve) => {
    store.get(sessionId, (err, session) => {
      if (err || !session) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

class AuthService {
  /**
   * Validate user credentials
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<{success: boolean, user?: Object, error?: string, statusCode?: number}>}
   */
  async validateCredentials(email, password) {
    // EXACT SAME LOGIC AS CONTROLLER
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
    })
      .select('+password')
      .exec();

    if (!user) {
      return { 
        success: false, 
        error: 'Invalid email or password', 
        statusCode: 401 
      };
    }

    if (!user.password) {
      return { 
        success: false, 
        error: 'Password not set for this account', 
        statusCode: 401 
      };
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return { 
        success: false, 
        error: 'Invalid email or password', 
        statusCode: 401 
      };
    }

    return { success: true, user };
  }

  /**
   * Setup user session data after authentication
   * @param {Object} user - User document
   * @returns {Promise<{userResponse: Object, essentialData: Object}>}
   */
  async setupUserSession(user) {
    const aesKey = user.aesKey ? user.aesKey : await generateKey(user.email);
    const userResponse = await User.findByIdAndUpdate(
      user._id,
      { aesKey },
      { new: true }
    );

    const essentialData = {
      _id: userResponse._id,
      email: userResponse.email,
      role: userResponse.role,
      subRole: userResponse.subRole,
      permissions: Object.fromEntries(userResponse.permissions || new Map()),
      hostel: userResponse.hostel,
    };

    // Prepare user response object
    const userResponseObj = userResponse.toObject();
    delete userResponseObj.password;
    if (userResponseObj.permissions instanceof Map) {
      userResponseObj.permissions = Object.fromEntries(userResponseObj.permissions);
    }

    return { userResponse: userResponseObj, essentialData };
  }

  /**
   * Create device session record
   * @param {Object} options - Session options
   * @param {string} options.userId - User ID
   * @param {string} options.sessionId - Session ID
   * @param {string} options.userAgent - User agent string
   * @param {string} options.ip - IP address
   * @returns {Promise<Object>} Created session
   */
  async createDeviceSession({ userId, sessionId, userAgent, ip }) {
    const deviceName = getDeviceNameFromUserAgent(userAgent);

    return Session.create({
      userId,
      sessionId,
      userAgent,
      ip,
      deviceName,
      loginTime: new Date(),
      lastActive: new Date(),
    });
  }

  /**
   * Validate Google token and find user
   * @param {string} token - Google ID token
   * @returns {Promise<{success: boolean, user?: Object, error?: string, statusCode?: number}>}
   */
  async validateGoogleToken(token) {
    try {
      const googleResponse = await axios.get(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`
      );

      const { email } = googleResponse.data;

      const user = await User.findOne({ 
        email: { $regex: new RegExp(`^${email}$`, 'i') } 
      });

      if (!user) {
        return { 
          success: false, 
          error: 'User not found', 
          statusCode: 401 
        };
      }

      return { success: true, user };
    } catch (error) {
      return { 
        success: false, 
        error: 'Invalid Google Token', 
        statusCode: 401 
      };
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<{success: boolean, user?: Object, error?: string, statusCode?: number}>}
   */
  async getUserById(userId) {
    const user = await User.findById(userId).select('-password').exec();
    
    if (!user) {
      return { 
        success: false, 
        error: 'User not found', 
        statusCode: 404 
      };
    }

    return { success: true, user };
  }

  /**
   * Update user password
   * @param {string} userId - User ID
   * @param {string} oldPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<{success: boolean, error?: string, statusCode?: number}>}
   */
  async updatePassword(userId, oldPassword, newPassword) {
    const user = await User.findById(userId).select('+password').exec();
    
    if (!user) {
      return { 
        success: false, 
        error: 'User not found', 
        statusCode: 404 
      };
    }

    if (!user.password) {
      return { 
        success: false, 
        error: 'No password is currently set for this account', 
        statusCode: 401 
      };
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return { 
        success: false, 
        error: 'Old password is incorrect', 
        statusCode: 401 
      };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    await user.save();

    return { success: true };
  }

  /**
   * Get user devices/sessions
   * @param {string} userId - User ID
   * @param {string} currentSessionId - Current session ID
   * @param {Object} sessionStore - Session store
   * @returns {Promise<Array>} Array of valid sessions
   */
  async getUserDevices(userId, currentSessionId, sessionStore) {
    const sessions = await Session.find({ userId }).sort({ lastActive: -1 });
    const validSessions = [];

    for (const session of sessions) {
      const isCurrent = session.sessionId === currentSessionId;

      if (isCurrent || (await sessionExistsInStore(sessionStore, session.sessionId))) {
        validSessions.push({
          ...session.toObject(),
          isCurrent,
        });
      } else {
        // Clean up orphaned session records
        await Session.deleteOne({ _id: session._id });
      }
    }

    return validSessions;
  }

  /**
   * Logout device by session ID
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID to logout
   * @param {string} currentSessionId - Current session ID
   * @returns {Promise<{success: boolean, isCurrentSession?: boolean, error?: string, statusCode?: number}>}
   */
  async logoutDevice(userId, sessionId, currentSessionId) {
    const session = await Session.findOne({
      sessionId: sessionId,
      userId: userId,
    });

    if (!session) {
      return { 
        success: false, 
        error: 'Session not found or unauthorized', 
        statusCode: 404 
      };
    }

    // If trying to logout current session, signal to use regular logout
    if (sessionId === currentSessionId) {
      return { success: true, isCurrentSession: true };
    }

    // Delete the session from tracking database
    await Session.deleteOne({ sessionId: sessionId });

    return { success: true, isCurrentSession: false };
  }

  /**
   * Verify SSO token and find user
   * @param {string} token - SSO token
   * @returns {Promise<{success: boolean, user?: Object, error?: string, statusCode?: number}>}
   */
  async verifySSOToken(token) {
    try {
      const response = await axios.post(
        'https://hms-sso.andiindia.in/api/auth/verify-sso-token', 
        { token }
      );

      if (!response.data.success) {
        return { 
          success: false, 
          error: 'Invalid or expired SSO token', 
          statusCode: 401 
        };
      }

      const email = response.data.user.email;
      const user = await User.findOne({ 
        email: { $regex: new RegExp(`^${email}$`, 'i') } 
      }).exec();

      if (!user) {
        return { 
          success: false, 
          error: 'User not found in system', 
          statusCode: 404 
        };
      }

      return { success: true, user };
    } catch (error) {
      return { 
        success: false, 
        error: 'Failed to verify SSO token', 
        statusCode: 500 
      };
    }
  }

  /**
   * Delete session by ID
   * @param {string} sessionId - Session ID
   * @returns {Promise<void>}
   */
  async deleteSession(sessionId) {
    await Session.deleteOne({ sessionId });
  }

  // ==================== Password Reset Methods ====================

  /**
   * Request password reset - generates token and sends email
   * @param {string} email - User email
   * @returns {Promise<{success: boolean, message?: string, error?: string, statusCode?: number}>}
   */
  async requestPasswordReset(email) {
    // Find user by email (case-insensitive)
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
    });

    // Always return success to prevent email enumeration attacks
    if (!user) {
      return { 
        success: true, 
        message: 'If an account with that email exists, a password reset link has been sent.' 
      };
    }

    // Invalidate any existing tokens for this user
    await PasswordResetToken.invalidateUserTokens(user._id);

    // Generate secure random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash the token for storage (more secure)
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Create token with 1 hour expiry
    await PasswordResetToken.create({
      userId: user._id,
      token: hashedToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    });

    // Send password reset email
    await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);

    return { 
      success: true, 
      message: 'If an account with that email exists, a password reset link has been sent.' 
    };
  }

  /**
   * Verify password reset token
   * @param {string} token - Reset token from URL
   * @returns {Promise<{success: boolean, user?: Object, error?: string, statusCode?: number}>}
   */
  async verifyResetToken(token) {
    // Hash the token to match stored version
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid token
    const resetToken = await PasswordResetToken.findValidToken(hashedToken);

    if (!resetToken) {
      return { 
        success: false, 
        error: 'Invalid or expired reset token', 
        statusCode: 400 
      };
    }

    return { 
      success: true, 
      user: {
        _id: resetToken.userId._id,
        name: resetToken.userId.name,
        email: resetToken.userId.email,
      }
    };
  }

  /**
   * Reset password with token
   * @param {string} token - Reset token
   * @param {string} newPassword - New password
   * @returns {Promise<{success: boolean, message?: string, error?: string, statusCode?: number}>}
   */
  async resetPasswordWithToken(token, newPassword) {
    // Hash the token to match stored version
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid token
    const resetToken = await PasswordResetToken.findValidToken(hashedToken);

    if (!resetToken) {
      return { 
        success: false, 
        error: 'Invalid or expired reset token', 
        statusCode: 400 
      };
    }

    // Get user
    const user = await User.findById(resetToken.userId._id);
    if (!user) {
      return { 
        success: false, 
        error: 'User not found', 
        statusCode: 404 
      };
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user password
    user.password = hashedPassword;
    await user.save();

    // Mark token as used
    await resetToken.markAsUsed();

    // Invalidate all other tokens for this user
    await PasswordResetToken.invalidateUserTokens(user._id);

    // Send confirmation email
    await emailService.sendPasswordResetSuccessEmail(user.email, user.name);

    return { 
      success: true, 
      message: 'Password has been reset successfully' 
    };
  }
}

export const authService = new AuthService();
export default AuthService;

