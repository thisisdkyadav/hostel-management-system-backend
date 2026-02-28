import axios from 'axios';
import bcrypt from 'bcrypt';
import { unauthorized, notFound, success, error } from '../../../../services/base/index.js';
import { asyncHandler, sendStandardResponse } from '../../../../utils/index.js';
import {
  getSessionMeta,
  listUserSessions,
  touchSessionMeta,
  deleteSessionMeta,
} from '../../../../services/session/redisSessionMeta.service.js';
import {
  GOOGLE_TOKEN_VERIFY_URL,
  SSO_VERIFY_URL,
  findUserByEmail,
  persistUserSession,
  sessionExistsInStore,
  setupUserSession,
  executeLogout,
} from './auth.shared.js';

const authenticateWithGoogleToken = async (token) => {
  try {
    const response = await axios.get(`${GOOGLE_TOKEN_VERIFY_URL}?id_token=${token}`);
    const email = response?.data?.email;

    if (!email) {
      return { status: 'invalid_token' };
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return { status: 'not_found' };
    }

    return { status: 'ok', user };
  } catch (_googleError) {
    return { status: 'invalid_token' };
  }
};

const authenticateWithSsoToken = async (token) => {
  try {
    const response = await axios.post(SSO_VERIFY_URL, { token });

    if (!response?.data?.success) {
      return { status: 'unauthorized' };
    }

    const email = response?.data?.user?.email;
    if (!email) {
      return { status: 'unauthorized' };
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return { status: 'not_found' };
    }

    return { status: 'ok', user };
  } catch (_ssoError) {
    return { status: 'error' };
  }
};

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await findUserByEmail(email, { includePassword: true });

  if (!user) {
    return sendStandardResponse(res, unauthorized('Invalid email or password'));
  }

  if (!user.password) {
    return sendStandardResponse(res, unauthorized('Password not set for this account'));
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return sendStandardResponse(res, unauthorized('Invalid email or password'));
  }

  const sessionData = await setupUserSession(user);
  if (!sessionData) {
    return sendStandardResponse(res, notFound('User'));
  }

  const sessionResult = await persistUserSession(req, user, sessionData.essentialData);
  if (!sessionResult.success) {
    return sendStandardResponse(res, sessionResult);
  }

  return sendStandardResponse(
    res,
    success({ user: sessionData.userResponse }, 200, 'Login successful')
  );
});

export const loginWithGoogle = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const authResult = await authenticateWithGoogleToken(token);

  if (authResult.status === 'invalid_token') {
    return sendStandardResponse(res, unauthorized('Invalid Google Token'));
  }

  if (authResult.status === 'not_found') {
    return sendStandardResponse(res, unauthorized('User not found'));
  }

  const user = authResult.user;
  const sessionData = await setupUserSession(user);
  if (!sessionData) {
    return sendStandardResponse(res, notFound('User'));
  }

  const sessionResult = await persistUserSession(req, user, sessionData.essentialData);
  if (!sessionResult.success) {
    return sendStandardResponse(res, sessionResult);
  }

  return sendStandardResponse(
    res,
    success({ user: sessionData.userResponse }, 200, 'Login successful')
  );
});

export const verifySSOToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const authResult = await authenticateWithSsoToken(token);

  if (authResult.status === 'unauthorized') {
    return sendStandardResponse(res, unauthorized('Invalid or expired SSO token'));
  }

  if (authResult.status === 'not_found') {
    return sendStandardResponse(res, error('User not found in system', 404));
  }

  if (authResult.status === 'error') {
    return sendStandardResponse(res, error('Failed to verify SSO token', 500));
  }

  const user = authResult.user;
  const sessionData = await setupUserSession(user);
  if (!sessionData) {
    return sendStandardResponse(res, notFound('User'));
  }

  const sessionResult = await persistUserSession(req, user, sessionData.essentialData);
  if (!sessionResult.success) {
    return sendStandardResponse(res, sessionResult);
  }

  return sendStandardResponse(
    res,
    success({ user: sessionData.userResponse }, 200, 'SSO authentication successful')
  );
});

export const logout = asyncHandler(async (req, res) => {
  const result = await executeLogout(req);

  if (result.success && req.sessionID) {
    res.clearCookie('connect.sid');
  }

  return sendStandardResponse(res, result);
});

export const getUserDevices = asyncHandler(async (req, res) => {
  const sessions = await listUserSessions(req.user._id);
  const validSessions = [];

  for (const deviceSession of sessions) {
    const isCurrent = deviceSession.sessionId === req.sessionID;

    if (isCurrent || (await sessionExistsInStore(req.sessionStore, deviceSession.sessionId))) {
      if (isCurrent) {
        await touchSessionMeta(deviceSession.sessionId, new Date());
        deviceSession.lastActive = new Date().toISOString();
      }

      validSessions.push({
        ...deviceSession,
        isCurrent,
      });
      continue;
    }

    await deleteSessionMeta(deviceSession.sessionId, req.user._id);
  }

  return sendStandardResponse(res, success({ devices: validSessions }));
});

export const logoutDevice = asyncHandler(async (req, res) => {
  const { sessionId } = req.params;
  const sessionMeta = await getSessionMeta(sessionId);

  if (!sessionMeta || String(sessionMeta.userId) !== String(req.user._id)) {
    return sendStandardResponse(res, error('Session not found or unauthorized', 404));
  }

  if (sessionId === req.sessionID) {
    const result = await executeLogout(req);
    if (result.success) {
      res.clearCookie('connect.sid');
    }
    return sendStandardResponse(res, result);
  }

  await deleteSessionMeta(sessionId, req.user._id);

  req.sessionStore.destroy(sessionId, () => {
    // Ignore session store errors; session may already be gone.
  });

  return sendStandardResponse(res, success(null, 200, 'Device logged out successfully'));
});

export default {
  login,
  loginWithGoogle,
  verifySSOToken,
  logout,
  getUserDevices,
  logoutDevice,
};
