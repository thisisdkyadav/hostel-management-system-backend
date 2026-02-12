import { asyncHandler } from '../../../../utils/index.js';
import { ssoService } from './sso.service.js';

export const redirect = asyncHandler(async (req, res) => {
  const redirectTo = req.query.redirect_to;

  if (!redirectTo) {
    return res.status(400).json({ error: 'Missing redirect_to parameter' });
  }

  const userData = req.session.userData || {
    email: req.session.email,
    role: req.session.role,
  };

  if (!userData || !Object.keys(userData).length) {
    return res.status(401).json({ error: 'No user data in session' });
  }

  const token = ssoService.signUserData(userData);

  const redirectUrl = new URL(redirectTo);
  redirectUrl.searchParams.append('token', token);

  res.redirect(redirectUrl.toString());
});

export const verifySSOToken = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({
      success: false,
      error: 'Token is required',
    });
  }

  const decoded = ssoService.verifyToken(token);

  if (!decoded) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token',
    });
  }

  return res.json({
    success: true,
    user: { email: decoded.email },
  });
});

