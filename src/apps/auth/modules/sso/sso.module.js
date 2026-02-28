import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../../../config/env.config.js';
import { success, badRequest, unauthorized } from '../../../../services/base/index.js';
import { asyncHandler, sendStandardResponse } from '../../../../utils/index.js';

const signUserData = (userData) => jwt.sign(userData, JWT_SECRET);

const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (_verifyError) {
    return null;
  }
};

const buildRedirectResult = async (req) => {
  const redirectTarget = req.query.redirect_to || req.query.redirectTo;
  if (!redirectTarget) {
    return badRequest('Missing redirect_to parameter');
  }

  let redirectUrl;
  try {
    redirectUrl = new URL(redirectTarget);
  } catch (_urlError) {
    return badRequest('Invalid redirect_to parameter');
  }

  const userData = req.session.userData || {
    email: req.session.email,
    role: req.session.role,
  };

  if (!userData || !Object.keys(userData).length) {
    return unauthorized('No user data in session');
  }

  const token = signUserData(userData);
  redirectUrl.searchParams.append('token', token);

  return success({ redirectUrl: redirectUrl.toString() });
};

const verifySSOTokenResult = async (token) => {
  if (!token) {
    return badRequest('Token is required');
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return unauthorized('Invalid or expired token');
  }

  return success({
    user: {
      _id: decoded._id,
      email: decoded.email,
      role: decoded.role,
      subRole: decoded.subRole,
      hostel: decoded.hostel,
      pinnedTabs: decoded.pinnedTabs,
    },
  });
};

export const redirect = asyncHandler(async (req, res) => {
  const result = await buildRedirectResult(req);

  if (!result.success) {
    return sendStandardResponse(res, result);
  }

  return res.redirect(result.data.redirectUrl);
});

export const verifySSOToken = asyncHandler(async (req, res) => {
  const result = await verifySSOTokenResult(req.body.token);
  return sendStandardResponse(res, result);
});

export const ssoModule = {
  signUserData,
  verifyToken,
  buildRedirectResult,
  verifySSOTokenResult,
};

export default ssoModule;
