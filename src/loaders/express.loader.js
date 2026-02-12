/**
 * Express App Loader
 * Configures Express middleware and routes
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuration
import env from '../config/env.config.js';

// Error Handlers
import { errorHandler, notFoundHandler } from '../core/errors/errorHandler.js';

// Controllers for special routes (SSO verify needs special CORS handling)
import { verifySSOToken } from '../apps/auth/modules/sso/sso.controller.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-APPLICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
import authApp from '../apps/auth/index.js';
import iamApp from '../apps/iam/index.js';
import hostelApp from '../apps/hostel/index.js';
import studentsApp from '../apps/students/index.js';
import studentAffairsApp from '../apps/student-affairs/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CORS Configuration Options
 */
const ssoCorsOptions = {
  origin: '*',
  credentials: false,
};

const scannerCorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

const regularCorsOptions = {
  origin: env.ALLOWED_ORIGINS, // Already an array from env.config.js
  credentials: true,
};

/**
 * Create session middleware
 * @returns {Function} Session middleware
 */
export const createSessionMiddleware = () => {
  const isDevelopment = env.NODE_ENV === 'development';
  
  return session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: env.MONGO_URI,
      ttl: 7 * 24 * 60 * 60, // 7 days
      autoRemove: 'native',
      touchAfter: 24 * 3600, // 24 hours
      crypto: {
        secret: env.SESSION_SECRET,
      },
    }),
    cookie: {
      httpOnly: true,
      secure: !isDevelopment,
      sameSite: !isDevelopment ? 'None' : 'Strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  });
};

/**
 * Initialize Express application
 * @param {Express} app - Express application instance
 * @returns {Object} Object containing app and sessionMiddleware
 */
export const initializeExpress = (app) => {
  // Trust proxy for secure cookies behind load balancer
  app.set('trust proxy', 1);

  // Request parsing (before routes)
  app.use(express.urlencoded({ limit: '1mb', extended: true }));
  app.use(cookieParser());

  // ============================================
  // Special CORS Routes (before session/regular CORS)
  // ============================================
  
  // SSO verify route with special CORS
  app.use('/api/sso/verify', cors(ssoCorsOptions), express.json(), verifySSOToken);

  // Scanner routes with special CORS
  app.use('/api/face-scanner/ping', cors(scannerCorsOptions));
  app.use('/api/face-scanner/scan', cors(scannerCorsOptions));
  app.use('/api/face-scanner/test-auth', cors(scannerCorsOptions));

  // ============================================
  // Regular CORS
  // ============================================
  app.use(cors(regularCorsOptions));

  // ============================================
  // Session Middleware
  // ============================================
  const sessionMiddleware = createSessionMiddleware();
  app.use(sessionMiddleware);

  // ============================================
  // Static Files
  // ============================================
  if (env.USE_LOCAL_STORAGE) {
    app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
  }

  // JSON parser for remaining routes
  app.use(express.json({ limit: '1mb' }));

  // ═══════════════════════════════════════════════════════════════════════════
  // SUB-APPLICATIONS (API v1)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Auth and Identity
  app.use('/api/v1', authApp);
  app.use('/api/v1', iamApp);

  // Hostel Management System (main app)
  app.use('/api/v1', hostelApp);

  // Students domain app
  app.use('/api/v1/students', studentsApp);
  
  // Student Affairs System (modular app)
  app.use('/api/v1/student-affairs', studentAffairsApp);
  
  // Future sub-applications:
  // app.use('/api/v1/academics', academicsApp);
  // app.use('/api/v1/library', libraryApp);
  // app.use('/api/v1/placement', placementApp);

  // ============================================
  // Health Check / Root
  // ============================================
  app.get('/', (req, res) => {
    res.send('Hello World!!');
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // ============================================
  // Error Handling (must be LAST)
  // ============================================
  
  // 404 handler for undefined routes
  app.use(notFoundHandler);
  
  // Global error handler
  app.use(errorHandler);

  return { app, sessionMiddleware };
};

export default initializeExpress;
