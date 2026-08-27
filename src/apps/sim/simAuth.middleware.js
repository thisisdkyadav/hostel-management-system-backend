import crypto from 'crypto';
import env from '../../config/env.config.js';
import { getSessionRedisClient } from '../../services/session/redisSessionClient.js';

const unsignSessionID = (rawValue, secret) => {
  let value = String(rawValue || '').trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }
  try {
    value = decodeURIComponent(value);
  } catch {
    // already decoded
  }

  if (!value.startsWith('s:')) return null;
  const signedValue = value.slice(2);
  const index = signedValue.lastIndexOf('.');
  if (index <= 0) return null;

  const sessionID = signedValue.slice(0, index);
  const signature = signedValue.slice(index + 1);
  const expected = crypto
    .createHmac('sha256', secret)
    .update(sessionID)
    .digest('base64')
    .replace(/=+$/g, '');

  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return null;
  if (!crypto.timingSafeEqual(left, right)) return null;
  return sessionID;
};

export const requireSimSecret = (req, res, next) => {
  const expected = env.simulation.secret;
  const provided = String(req.get('x-sim-key') || '').trim();
  if (!expected || provided.length !== expected.length) {
    return res.status(401).json({ success: false, message: 'Invalid simulation key', data: null, errors: null });
  }

  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (!crypto.timingSafeEqual(left, right)) {
    return res.status(401).json({ success: false, message: 'Invalid simulation key', data: null, errors: null });
  }

  return next();
};

export const simAuthenticate = async (req, res, next) => {
  try {
    const cookieName = env.simulation.cookieName;
    const rawCookie = req.cookies?.[cookieName];
    const sessionID = unsignSessionID(rawCookie, env.SESSION_SECRET);
    if (!sessionID) {
      return res.status(401).json({ success: false, message: 'Authentication required', data: null, errors: null });
    }

    const client = getSessionRedisClient();
    const raw = await client.get(`${env.simulation.sessionPrefix}${sessionID}`);
    if (!raw) {
      return res.status(401).json({ success: false, message: 'Authentication required', data: null, errors: null });
    }

    const record = JSON.parse(raw);
    const userData = record?.userData || {};
    const userId = userData._id || record.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required', data: null, errors: null });
    }

    req.user = {
      _id: userId,
      email: userData.email || record.email,
      role: userData.role || record.role,
      subRole: userData.subRole || null,
      authz: userData.authz || {},
      hostel: userData.hostel || null,
      pinnedTabs: Array.isArray(userData.pinnedTabs) ? userData.pinnedTabs : [],
    };
    req.simSessionID = sessionID;

    await client.expire(`${env.simulation.sessionPrefix}${sessionID}`, env.SESSION_TTL_SECONDS);
    return next();
  } catch (error) {
    console.error('Sim authentication error:', error);
    return res.status(401).json({ success: false, message: 'Authentication failed', data: null, errors: null });
  }
};

export const requireSimStudent = (req, res, next) => {
  if (req.user?.role !== 'Student') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Required role: Student',
      data: null,
      errors: null,
    });
  }
  return next();
};
