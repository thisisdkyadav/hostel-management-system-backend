import { User } from '../../../../models/index.js';
import { generateKey } from '../../../../utils/qrUtils.js';
import { buildEffectiveAuthzForUser, extractUserAuthzOverride } from '../../../../core/authz/index.js';
import { createSessionMeta, deleteSessionMeta } from '../../../../services/session/redisSessionMeta.service.js';
import { success, error } from '../../../../services/base/index.js';

export const SSO_VERIFY_URL = 'https://hms-sso.andiindia.in/api/auth/verify-sso-token';
export const GOOGLE_TOKEN_VERIFY_URL = 'https://www.googleapis.com/oauth2/v3/tokeninfo';
export const PASSWORD_RESET_GENERIC_MESSAGE =
  'If an account with that email exists, a password reset link has been sent.';

const getDeviceNameFromUserAgent = (userAgent) => {
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
};

const saveSession = async (session) => {
  return new Promise((resolve, reject) => {
    session.save((saveError) => {
      if (saveError) {
        reject(saveError);
        return;
      }
      resolve();
    });
  });
};

const destroySession = async (session) => {
  return new Promise((resolve, reject) => {
    session.destroy((destroyError) => {
      if (destroyError) {
        reject(destroyError);
        return;
      }
      resolve();
    });
  });
};

export const sessionExistsInStore = async (store, sessionId) => {
  return new Promise((resolve) => {
    store.get(sessionId, (storeError, session) => {
      if (storeError || !session) {
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
};

export const findUserByEmail = async (email, { includePassword = false } = {}) => {
  const query = User.findOne({
    email: { $regex: new RegExp(`^${email}$`, 'i') },
  });

  if (includePassword) {
    query.select('+password');
  }

  return query.exec();
};

export const setupUserSession = async (user) => {
  const aesKey = user.aesKey || (await generateKey(user.email));
  const userResponse = await User.findByIdAndUpdate(user._id, { aesKey }, { new: true }).exec();

  if (!userResponse) {
    return null;
  }

  const authzOverride = extractUserAuthzOverride(userResponse);
  const authzEffective = buildEffectiveAuthzForUser({
    role: userResponse.role,
    authz: { override: authzOverride },
  });

  const essentialData = {
    _id: userResponse._id,
    email: userResponse.email,
    role: userResponse.role,
    subRole: userResponse.subRole,
    authz: {
      override: authzOverride,
      effective: authzEffective,
    },
    hostel: userResponse.hostel,
    pinnedTabs: Array.isArray(userResponse.pinnedTabs) ? userResponse.pinnedTabs : [],
  };

  const userResponseObj = userResponse.toObject();
  delete userResponseObj.password;
  delete userResponseObj.permissions;

  userResponseObj.authz = {
    override: authzOverride,
    effective: authzEffective,
    meta: userResponse.authz?.meta || null,
  };

  return { userResponse: userResponseObj, essentialData };
};

export const persistUserSession = async (req, user, essentialData) => {
  req.session.userId = user._id;
  req.session.userData = essentialData;
  req.session.role = user.role;
  req.session.email = user.email;

  const userAgent = req.headers['user-agent'] || 'Unknown';
  const ip = req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress;

  try {
    await createSessionMeta({
      userId: user._id,
      sessionId: req.sessionID,
      userAgent,
      ip,
      deviceName: getDeviceNameFromUserAgent(userAgent),
      loginTime: new Date(),
      lastActive: new Date(),
    });

    await saveSession(req.session);
    return success(null);
  } catch (_persistError) {
    return error('Failed to create session. Please try again.', 500);
  }
};

export const executeLogout = async (req) => {
  if (!req.sessionID) {
    return success(null, 200, 'No active session');
  }

  try {
    await deleteSessionMeta(req.sessionID);
    await destroySession(req.session);
    return success(null, 200, 'Logged out successfully');
  } catch (_logoutError) {
    return error('Logout failed', 500);
  }
};

export default {
  sessionExistsInStore,
  findUserByEmail,
  setupUserSession,
  persistUserSession,
  executeLogout,
};
