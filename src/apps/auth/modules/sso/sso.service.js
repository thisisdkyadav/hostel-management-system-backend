import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../../../config/env.config.js';

class SSOService {
  signUserData(userData) {
    return jwt.sign(userData, JWT_SECRET);
  }

  verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
  }
}

export const ssoService = new SSOService();
export default SSOService;

