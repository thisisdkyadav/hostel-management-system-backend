/**
 * Auth Service
 * Contains business logic for authentication and password reset flows.
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import axios from 'axios';
import { User, Session, PasswordResetToken } from '../../../../models/index.js';
import { generateKey } from '../../../../utils/qrUtils.js';
import { emailService } from '../../../../services/email/index.js';

/**
 * Helper function to extract device name from user agent.
 * @param {string} userAgent - Browser user agent string
 * @returns {string} Device name
 */
export function getDeviceNameFromUserAgent(userAgent) {
  if (!userAgent) return 'Unknown device';

  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android device';

  if (/Chrome/.test(userAgent) && !/Chromium|Edge/.test(userAgent)) return 'Chrome browser';
  if (/Firefox/.test(userAgent)) return 'Firefox browser';
  if (/Safari/.test(userAgent) && !/Chrome|Chromium/.test(userAgent)) return 'Safari browser';
  if (/Edge|Edg/.test(userAgent)) return 'Edge browser';
  if (/MSIE|Trident/.test(userAgent)) return 'Internet Explorer';

  if (/Windows/.test(userAgent)) return 'Windows device';
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac device';
  if (/Linux/.test(userAgent)) return 'Linux device';

  return 'Unknown device';
}

/**
 * Check if a session exists in the session store.
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
  async validateCredentials(email, password) {
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
    })
      .select('+password')
      .exec();

    if (!user) {
      return {
        success: false,
        error: 'Invalid email or password',
        statusCode: 401,
      };
    }

    if (!user.password) {
      return {
        success: false,
        error: 'Password not set for this account',
        statusCode: 401,
      };
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return {
        success: false,
        error: 'Invalid email or password',
        statusCode: 401,
      };
    }

    return { success: true, user };
  }

  async setupUserSession(user) {
    const aesKey = user.aesKey ? user.aesKey : await generateKey(user.email);
    const userResponse = await User.findByIdAndUpdate(user._id, { aesKey }, { new: true });

    const essentialData = {
      _id: userResponse._id,
      email: userResponse.email,
      role: userResponse.role,
      subRole: userResponse.subRole,
      permissions: Object.fromEntries(userResponse.permissions || new Map()),
      hostel: userResponse.hostel,
      pinnedTabs: Array.isArray(userResponse.pinnedTabs) ? userResponse.pinnedTabs : [],
    };

    const userResponseObj = userResponse.toObject();
    delete userResponseObj.password;
    if (userResponseObj.permissions instanceof Map) {
      userResponseObj.permissions = Object.fromEntries(userResponseObj.permissions);
    }

    return { userResponse: userResponseObj, essentialData };
  }

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

  async validateGoogleToken(token) {
    try {
      const googleResponse = await axios.get(
        `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${token}`
      );

      const { email } = googleResponse.data;

      const user = await User.findOne({
        email: { $regex: new RegExp(`^${email}$`, 'i') },
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          statusCode: 401,
        };
      }

      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        error: 'Invalid Google Token',
        statusCode: 401,
      };
    }
  }

  async getUserById(userId) {
    const user = await User.findById(userId).select('-password').exec();

    if (!user) {
      return {
        success: false,
        error: 'User not found',
        statusCode: 404,
      };
    }

    return { success: true, user };
  }

  async updatePinnedTabs(userId, pinnedTabs) {
    if (!Array.isArray(pinnedTabs)) {
      return {
        success: false,
        error: 'pinnedTabs must be an array',
        statusCode: 400,
      };
    }

    const normalizedPinnedTabs = [...new Set(
      pinnedTabs
        .filter((tab) => typeof tab === 'string')
        .map((tab) => tab.trim())
        .filter((tab) => tab.length > 0)
    )];

    if (normalizedPinnedTabs.length > 30) {
      return {
        success: false,
        error: 'Too many pinned tabs',
        statusCode: 400,
      };
    }

    const hasInvalidPath = normalizedPinnedTabs.some((tabPath) => !tabPath.startsWith('/admin'));
    if (hasInvalidPath) {
      return {
        success: false,
        error: 'Invalid pinned tab path',
        statusCode: 400,
      };
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { pinnedTabs: normalizedPinnedTabs },
      { new: true, runValidators: true }
    )
      .select('pinnedTabs')
      .exec();

    if (!user) {
      return {
        success: false,
        error: 'User not found',
        statusCode: 404,
      };
    }

    return {
      success: true,
      pinnedTabs: Array.isArray(user.pinnedTabs) ? user.pinnedTabs : [],
    };
  }

  async updatePassword(userId, oldPassword, newPassword) {
    const user = await User.findById(userId).select('+password').exec();

    if (!user) {
      return {
        success: false,
        error: 'User not found',
        statusCode: 404,
      };
    }

    if (!user.password) {
      return {
        success: false,
        error: 'No password is currently set for this account',
        statusCode: 401,
      };
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      return {
        success: false,
        error: 'Old password is incorrect',
        statusCode: 401,
      };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    user.password = hashedPassword;
    await user.save();

    return { success: true };
  }

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
        await Session.deleteOne({ _id: session._id });
      }
    }

    return validSessions;
  }

  async logoutDevice(userId, sessionId, currentSessionId) {
    const session = await Session.findOne({
      sessionId,
      userId,
    });

    if (!session) {
      return {
        success: false,
        error: 'Session not found or unauthorized',
        statusCode: 404,
      };
    }

    if (sessionId === currentSessionId) {
      return { success: true, isCurrentSession: true };
    }

    await Session.deleteOne({ sessionId });

    return { success: true, isCurrentSession: false };
  }

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
          statusCode: 401,
        };
      }

      const email = response.data.user.email;
      const user = await User.findOne({
        email: { $regex: new RegExp(`^${email}$`, 'i') },
      }).exec();

      if (!user) {
        return {
          success: false,
          error: 'User not found in system',
          statusCode: 404,
        };
      }

      return { success: true, user };
    } catch (error) {
      return {
        success: false,
        error: 'Failed to verify SSO token',
        statusCode: 500,
      };
    }
  }

  async deleteSession(sessionId) {
    await Session.deleteOne({ sessionId });
  }

  async requestPasswordReset(email) {
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
    });

    if (!user) {
      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.',
      };
    }

    await PasswordResetToken.invalidateUserTokens(user._id);

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    await PasswordResetToken.create({
      userId: user._id,
      token: hashedToken,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    await emailService.sendPasswordResetEmail(user.email, resetToken, user.name);

    return {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    };
  }

  async verifyResetToken(token) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const resetToken = await PasswordResetToken.findValidToken(hashedToken);

    if (!resetToken) {
      return {
        success: false,
        error: 'Invalid or expired reset token',
        statusCode: 400,
      };
    }

    return {
      success: true,
      user: {
        _id: resetToken.userId._id,
        name: resetToken.userId.name,
        email: resetToken.userId.email,
      },
    };
  }

  async resetPasswordWithToken(token, newPassword) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const resetToken = await PasswordResetToken.findValidToken(hashedToken);

    if (!resetToken) {
      return {
        success: false,
        error: 'Invalid or expired reset token',
        statusCode: 400,
      };
    }

    const user = await User.findById(resetToken.userId._id);
    if (!user) {
      return {
        success: false,
        error: 'User not found',
        statusCode: 404,
      };
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    await resetToken.markAsUsed();
    await PasswordResetToken.invalidateUserTokens(user._id);
    await emailService.sendPasswordResetSuccessEmail(user.email, user.name);

    return {
      success: true,
      message: 'Password has been reset successfully',
    };
  }
}

export const authService = new AuthService();
export default AuthService;
