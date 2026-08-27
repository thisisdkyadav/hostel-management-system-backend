/**
 * Express App Loader
 * Configures Express middleware and routes
 */

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuration
import env from '../config/env.config.js';

// Error Handlers
import { errorHandler, notFoundHandler } from '../core/errors/errorHandler.js';

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-APPLICATIONS
// ═══════════════════════════════════════════════════════════════════════════════
import iamApp from '../apps/iam/index.js';
import complaintsApp from '../apps/complaints/index.js';
import administrationApp from '../apps/administration/index.js';
import studentsApp from '../apps/students/index.js';
import studentAffairsApp from '../apps/student-affairs/index.js';
import visitorsApp from '../apps/visitors/index.js';
import operationsApp from '../apps/operations/index.js';
import campusLifeApp from '../apps/campus-life/index.js';
import { createRedisSessionStore } from '../services/session/redisSession.store.js';
import simApp from '../apps/sim/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * CORS Configuration Options
 */
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
  const sessionTtlSeconds = env.SESSION_TTL_SECONDS;
  
  return session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: createRedisSessionStore({
      prefix: env.REDIS_SESSION_PREFIX,
      ttlSeconds: sessionTtlSeconds,
    }),
    cookie: {
      httpOnly: true,
      secure: !isDevelopment,
      sameSite: !isDevelopment ? 'None' : 'Strict',
      maxAge: sessionTtlSeconds * 1000,
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
  app.use((req, res, next) => {
    // Sim routes use a dedicated sim.sid cookie + sim Redis prefix. Skip the
    // live express-session store so a load run cannot mint connect.sid keys.
    if (req.path.startsWith('/api/v1/sim')) return next();
    return sessionMiddleware(req, res, next);
  });

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
  
  // Identity (auth/authz issuance handled by the Go backend; Express only
  // reads the shared session and serves the transitional SSO verify endpoint)
  app.use('/api/v1', iamApp);
  app.use('/api/v1', complaintsApp);
  app.use('/api/v1', visitorsApp);
  app.use('/api/v1', operationsApp);
  app.use('/api/v1', campusLifeApp);
  app.use('/api/v1', administrationApp);

  // Students domain app
  app.use('/api/v1/students', studentsApp);

  if (env.simulation.enabled && String(env.simulation.secret).length >= 16) {
    app.use('/api/v1/sim', simApp);
  } else if (env.simulation.enabled) {
    console.warn('SIMULATION_ENABLED is set but SIMULATION_SECRET is missing or shorter than 16 characters; sim routes not mounted');
  }
  
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
