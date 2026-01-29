# Backend Restructuring Plan - Hostel Management System

> **CRITICAL RULE**: No API endpoint logic changes. No frontend changes required.
> **Last Updated**: January 29, 2026
> **Status**: ✅ Complete (All 10 Phases Done)

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Restructuring Checklist](#pre-restructuring-checklist)
3. [Phase 0: Foundation Setup](#phase-0-foundation-setup)
4. [Phase 1: Core Utilities](#phase-1-core-utilities)
5. [Phase 2: Configuration Restructuring](#phase-2-configuration-restructuring)
6. [Phase 3: Models Reorganization](#phase-3-models-reorganization)
7. [Phase 4: Middleware Enhancement](#phase-4-middleware-enhancement)
8. [Phase 5: Services Layer](#phase-5-services-layer)
9. [Phase 6: Module-wise Route Migration](#phase-6-module-wise-route-migration)
10. [Phase 7: External API Restructuring](#phase-7-external-api-restructuring)
11. [Phase 8: Server.js Cleanup](#phase-8-serverjs-cleanup)
12. [Phase 9: Final Cleanup](#phase-9-final-cleanup)
13. [Testing Checklist](#testing-checklist)
14. [Rollback Plan](#rollback-plan)

---

## Overview

### Current Structure
```
backend/
├── config/           (3 files)
├── controllers/      (43 files - FLAT)
├── middlewares/      (3 files)
├── models/           (42 files - FLAT)
├── routes/           (34 files - FLAT)
├── services/         (3 files)
├── utils/            (6 files)
├── externalApi/      (separate mini-app)
├── scripts/
├── uploads/
├── logs/
└── server.js
```

### Target Structure
```
backend/
├── src/
│   ├── api/
│   │   └── v1/
│   │       ├── auth/
│   │       ├── complaints/
│   │       ├── ... (feature modules)
│   │       └── index.js
│   ├── config/
│   ├── core/
│   │   ├── errors/
│   │   ├── responses/
│   │   └── constants/
│   ├── middlewares/
│   ├── models/
│   ├── services/
│   ├── external/
│   ├── utils/
│   ├── loaders/
│   └── app.js
├── scripts/
├── uploads/
├── logs/
├── docs/
├── server.js (minimal entry point)
└── legacy_remain.md
```

### Migration Approach
- **Incremental**: One module at a time
- **Backward Compatible**: Old imports continue to work via re-exports
- **Testable**: Each phase has verification steps
- **Reversible**: Can rollback any phase

---

## Pre-Restructuring Checklist

- [ ] Create git branch: `git checkout -b refactor/restructure`
- [ ] Ensure all tests pass (if any)
- [ ] Document current working endpoints
- [ ] Backup current state

---

## Phase 0: Foundation Setup

**Status**: ⬜ Not Started  
**Estimated Files**: 5 new files  
**Breaking Changes**: None

### Task 0.1: Create Directory Structure
Create empty directory structure without moving any files.

```bash
# Commands to run
mkdir -p src/api/v1
mkdir -p src/config
mkdir -p src/core/errors
mkdir -p src/core/responses
mkdir -p src/core/constants
mkdir -p src/middlewares
mkdir -p src/models
mkdir -p src/services
mkdir -p src/external
mkdir -p src/utils
mkdir -p src/loaders
```

**Verification**: Directories exist

### Task 0.2: Create legacy_remain.md
Track all legacy support code for future cleanup.

```markdown
# Legacy Support Code - To Be Removed After Frontend Update

This file tracks temporary backward-compatibility code.
After frontend is updated, remove these.

## Format
| File | Line(s) | Description | Frontend File to Update |

## Entries
(will be populated during migration)
```

### Task 0.3: Create src/index.js (Main Export)
```javascript
// src/index.js
// Main entry point for src module
export * from './app.js';
```

**Verification**: File created

---

## Phase 1: Core Utilities

**Status**: ⬜ Not Started  
**Estimated Files**: 8 new files  
**Breaking Changes**: None  
**Dependencies**: Phase 0

### Task 1.1: Create ApiResponse Class

**File**: `src/core/responses/ApiResponse.js`

```javascript
/**
 * Standardized API Response Handler
 * Provides consistent response format across all endpoints
 */
export class ApiResponse {
  /**
   * Success response
   * @param {Response} res - Express response object
   * @param {any} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Error response
   * @param {Response} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {any} errors - Additional error details
   */
  static error(res, message = 'Error', statusCode = 500, errors = null) {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Paginated response
   * @param {Response} res - Express response object
   * @param {any} data - Response data array
   * @param {Object} pagination - Pagination details
   * @param {string} message - Success message
   */
  static paginated(res, data, pagination, message = 'Success') {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
        hasPrev: pagination.page > 1
      },
      timestamp: new Date().toISOString()
    });
  }

  // ========================================
  // LEGACY SUPPORT METHODS
  // These maintain backward compatibility
  // ========================================

  /**
   * Legacy: Return only { message } format
   * DEPRECATED: Use success() instead
   */
  static legacyMessage(res, message, statusCode = 200) {
    return res.status(statusCode).json({ message });
  }

  /**
   * Legacy: Return { success, message } format
   * DEPRECATED: Use success() instead
   */
  static legacySuccess(res, message, statusCode = 200) {
    return res.status(statusCode).json({ success: true, message });
  }
}

export default ApiResponse;
```

**Verification**: Import works in test file

### Task 1.2: Create AppError Classes

**File**: `src/core/errors/AppError.js`

```javascript
/**
 * Base Application Error
 * All custom errors extend this class
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational; // Operational errors vs programming errors
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp
    };
  }
}

/**
 * 400 Bad Request
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

/**
 * 403 Forbidden
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403);
  }
}

/**
 * 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404);
  }
}

/**
 * 409 Conflict
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409);
  }
}

/**
 * 422 Validation Error
 */
export class ValidationError extends AppError {
  constructor(message = 'Validation failed', errors = []) {
    super(message, 422);
    this.errors = errors;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      errors: this.errors
    };
  }
}

/**
 * 429 Too Many Requests
 */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429);
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(message, 500, false);
  }
}

export default AppError;
```

**Verification**: All error classes can be instantiated

### Task 1.3: Create Global Error Handler

**File**: `src/core/errors/errorHandler.js`

```javascript
import { AppError } from './AppError.js';

/**
 * Global Error Handler Middleware
 * Catches all errors and returns consistent response
 */
export const errorHandler = (err, req, res, next) => {
  // Log error (will be replaced with proper logger later)
  console.error('Error:', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // If headers already sent, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
      timestamp: new Date().toISOString()
    });
  }

  // Handle Mongoose Duplicate Key Error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0];
    return res.status(409).json({
      success: false,
      message: `${field ? `${field} already exists` : 'Duplicate entry'}`,
      timestamp: new Date().toISOString()
    });
  }

  // Handle Mongoose Validation Error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors || {}).map(e => ({
      field: e.path,
      message: e.message
    }));
    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      errors,
      timestamp: new Date().toISOString()
    });
  }

  // Handle JWT Errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      timestamp: new Date().toISOString()
    });
  }

  // Unknown errors - don't expose details in production
  const isDev = process.env.NODE_ENV === 'development';
  return res.status(500).json({
    success: false,
    message: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
};

/**
 * 404 Not Found Handler
 * For undefined routes
 */
export const notFoundHandler = (req, res) => {
  return res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
};

export default errorHandler;
```

**Verification**: Errors are caught and formatted correctly

### Task 1.4: Create Async Handler Utility

**File**: `src/utils/asyncHandler.js`

```javascript
/**
 * Async Handler Wrapper
 * Wraps async route handlers to catch errors automatically
 * Eliminates need for try-catch in every controller
 * 
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 * 
 * @example
 * // Instead of:
 * const getUser = async (req, res) => {
 *   try {
 *     const user = await User.findById(req.params.id);
 *     res.json(user);
 *   } catch (error) {
 *     res.status(500).json({ message: error.message });
 *   }
 * };
 * 
 * // Use:
 * const getUser = asyncHandler(async (req, res) => {
 *   const user = await User.findById(req.params.id);
 *   res.json(user);
 * });
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
```

**Verification**: Async errors are caught

### Task 1.5: Create Constants

**File**: `src/core/constants/roles.constants.js`

```javascript
/**
 * User Roles Constants
 * Single source of truth for all role values
 */
export const ROLES = {
  STUDENT: 'Student',
  WARDEN: 'Warden',
  ASSOCIATE_WARDEN: 'Associate Warden',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
  SECURITY: 'Security',
  MAINTENANCE_STAFF: 'Maintenance Staff',
  HOSTEL_SUPERVISOR: 'Hostel Supervisor',
  HOSTEL_GATE: 'Hostel Gate'
};

/**
 * Role hierarchy (higher index = more privileges)
 */
export const ROLE_HIERARCHY = [
  ROLES.STUDENT,
  ROLES.SECURITY,
  ROLES.MAINTENANCE_STAFF,
  ROLES.HOSTEL_GATE,
  ROLES.HOSTEL_SUPERVISOR,
  ROLES.ASSOCIATE_WARDEN,
  ROLES.WARDEN,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN
];

/**
 * Role groups for authorization
 */
export const ROLE_GROUPS = {
  ALL: Object.values(ROLES),
  STAFF: [
    ROLES.WARDEN,
    ROLES.ASSOCIATE_WARDEN,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN,
    ROLES.HOSTEL_SUPERVISOR,
    ROLES.MAINTENANCE_STAFF
  ],
  HOSTEL_MANAGEMENT: [
    ROLES.WARDEN,
    ROLES.ASSOCIATE_WARDEN,
    ROLES.HOSTEL_SUPERVISOR,
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN
  ],
  ADMIN_LEVEL: [
    ROLES.ADMIN,
    ROLES.SUPER_ADMIN
  ]
};

export default ROLES;
```

**File**: `src/core/constants/status.constants.js`

```javascript
/**
 * Status Constants for various entities
 */

export const COMPLAINT_STATUS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
  REJECTED: 'Rejected',
  CLOSED: 'Closed'
};

export const LEAVE_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled'
};

export const VISITOR_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CHECKED_IN: 'Checked In',
  CHECKED_OUT: 'Checked Out'
};

export const TASK_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const LOST_FOUND_STATUS = {
  LOST: 'lost',
  FOUND: 'found',
  CLAIMED: 'claimed',
  RETURNED: 'returned'
};

export const EVENT_STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};
```

**File**: `src/core/constants/index.js`

```javascript
export * from './roles.constants.js';
export * from './status.constants.js';
```

**Verification**: Constants can be imported and used

### Task 1.6: Create Core Index Files

**File**: `src/core/errors/index.js`

```javascript
export * from './AppError.js';
export * from './errorHandler.js';
```

**File**: `src/core/responses/index.js`

```javascript
export * from './ApiResponse.js';
```

**File**: `src/core/index.js`

```javascript
export * from './errors/index.js';
export * from './responses/index.js';
export * from './constants/index.js';
```

**Verification**: `import { ApiResponse, AppError, ROLES } from './src/core/index.js'` works

### Task 1.7: Update Utils Index

**File**: `src/utils/index.js`

```javascript
export * from './asyncHandler.js';
// Will add more as we migrate
```

---

## Phase 2: Configuration Restructuring

**Status**: ⬜ Not Started  
**Estimated Files**: 6 files (4 new, 2 modified)  
**Breaking Changes**: None  
**Dependencies**: Phase 1

### Task 2.1: Create Database Config

**File**: `src/config/database.config.js`

```javascript
/**
 * Database Configuration
 * MongoDB connection settings
 */
import mongoose from 'mongoose';

export const databaseConfig = {
  uri: process.env.MONGO_URI,
  options: {
    // Mongoose 8.x uses these by default, but explicit for clarity
    autoIndex: true,
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  }
};

/**
 * Connect to MongoDB
 * @returns {Promise<typeof mongoose>}
 */
export const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(databaseConfig.uri, databaseConfig.options);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    process.exit(1);
  }
};

export default connectDatabase;
```

### Task 2.2: Create CORS Config

**File**: `src/config/cors.config.js`

```javascript
/**
 * CORS Configuration
 * Cross-Origin Resource Sharing settings
 */

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [];

/**
 * Default CORS options (with credentials)
 */
export const corsOptions = {
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  exposedHeaders: ['set-cookie']
};

/**
 * SSO CORS options (public, no credentials)
 */
export const ssoCorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

/**
 * Scanner CORS options (public, Basic Auth)
 */
export const scannerCorsOptions = {
  origin: '*',
  credentials: false,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

export default corsOptions;
```

### Task 2.3: Create Session Config

**File**: `src/config/session.config.js`

```javascript
/**
 * Session Configuration
 * Express session and MongoDB store settings
 */
import MongoStore from 'connect-mongo';

const isDevelopment = process.env.NODE_ENV === 'development';

export const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 7 * 24 * 60 * 60, // 7 days in seconds
    autoRemove: 'native',
    touchAfter: 24 * 3600, // Update session once per 24 hours
    crypto: {
      secret: process.env.SESSION_SECRET
    }
  }),
  cookie: {
    httpOnly: true,
    secure: !isDevelopment,
    sameSite: isDevelopment ? 'Strict' : 'None',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
  }
};

export default sessionConfig;
```

### Task 2.4: Create Environment Config

**File**: `src/config/env.config.js`

```javascript
/**
 * Environment Configuration
 * Centralized environment variable access with validation
 */
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

/**
 * Validate required environment variables
 * @param {string[]} required - List of required env vars
 */
const validateEnv = (required) => {
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
};

// Validate critical env vars
validateEnv(['MONGO_URI', 'SESSION_SECRET']);

/**
 * Environment configuration object
 */
export const env = {
  // Node
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  
  // Database
  MONGO_URI: process.env.MONGO_URI,
  
  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Auth
  JWT_SECRET: process.env.JWT_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
  
  // Azure Storage
  azure: {
    connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
    containerName: process.env.AZURE_STORAGE_CONTAINER_NAME,
    accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
    accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY,
    studentIdContainer: process.env.AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID
  },
  
  // Razorpay
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET
  },
  
  // QR
  QR_PRIVATE_KEY: process.env.QR_PRIVATE_KEY,
  
  // CORS
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS?.split(',') || [],
  
  // Storage
  USE_LOCAL_STORAGE: process.env.USE_LOCAL_STORAGE === 'true'
};

// ============================================
// LEGACY EXPORTS - For backward compatibility
// These match the old config/environment.js exports
// TODO: Update imports to use `env` object instead
// ============================================
export const isDevelopmentEnvironment = env.isDevelopment;
export const PORT = env.PORT;
export const JWT_SECRET = env.JWT_SECRET;
export const SESSION_SECRET = env.SESSION_SECRET;
export const MONGO_URI = env.MONGO_URI;
export const REDIS_URL = env.REDIS_URL;
export const AZURE_STORAGE_CONNECTION_STRING = env.azure.connectionString;
export const AZURE_STORAGE_CONTAINER_NAME = env.azure.containerName;
export const AZURE_STORAGE_ACCOUNT_NAME = env.azure.accountName;
export const AZURE_STORAGE_ACCOUNT_KEY = env.azure.accountKey;
export const QR_PRIVATE_KEY = env.QR_PRIVATE_KEY;
export const RAZORPAY_KEY_ID = env.razorpay.keyId;
export const RAZORPAY_KEY_SECRET = env.razorpay.keySecret;
export const AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID = env.azure.studentIdContainer;
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS; // Keep as string for legacy
export const USE_LOCAL_STORAGE = env.USE_LOCAL_STORAGE;

export default env;
```

### Task 2.5: Create Config Index

**File**: `src/config/index.js`

```javascript
export * from './env.config.js';
export * from './database.config.js';
export * from './cors.config.js';
export * from './session.config.js';

// Re-export default env
export { default as env } from './env.config.js';
```

### Task 2.6: Update Old Config to Re-export (Legacy Support)

**File**: `config/environment.js` (MODIFY - Add re-exports)

```javascript
// LEGACY FILE - Re-exports from new location
// TODO: Update all imports to use 'src/config' then delete this file

export {
  isDevelopmentEnvironment,
  PORT,
  JWT_SECRET,
  SESSION_SECRET,
  MONGO_URI,
  REDIS_URL,
  AZURE_STORAGE_CONNECTION_STRING,
  AZURE_STORAGE_CONTAINER_NAME,
  AZURE_STORAGE_ACCOUNT_NAME,
  AZURE_STORAGE_ACCOUNT_KEY,
  QR_PRIVATE_KEY,
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  AZURE_STORAGE_CONTAINER_NAME_STUDENT_ID,
  ALLOWED_ORIGINS,
  USE_LOCAL_STORAGE,
  env
} from '../src/config/env.config.js';
```

**Add to legacy_remain.md**:
```
| config/environment.js | ALL | Legacy re-export file | Multiple backend files |
```

**Verification**: 
- Existing `import { PORT } from './config/environment.js'` still works
- New `import { env } from './src/config/index.js'` works

---

## Phase 3: Models Reorganization

**Status**: ⬜ Not Started  
**Estimated Files**: 42 models to reorganize  
**Breaking Changes**: None  
**Dependencies**: Phase 2

### Model Groups

| Group | Models | New Location |
|-------|--------|--------------|
| **user** | User, Session, Admin, Warden, AssociateWarden, Security, HostelSupervisor, HostelGate, MaintenanceStaff | `src/models/user/` |
| **hostel** | Hostel, Room, RoomAllocation, RoomChangeRequest, Unit | `src/models/hostel/` |
| **complaint** | Complaint | `src/models/complaint/` |
| **visitor** | Visitors, VisitorProfile, VisitorRequest, FamilyMember | `src/models/visitor/` |
| **event** | Event, Poll | `src/models/event/` |
| **inventory** | HostelInventory, StudentInventory, InventoryItemType | `src/models/inventory/` |
| **attendance** | CheckInOut, staffAttendance, Leave | `src/models/attendance/` |
| **scanner** | FaceScanner, ApiClient | `src/models/scanner/` |
| **task** | Task | `src/models/task/` |
| **notification** | Notification | `src/models/notification/` |
| **feedback** | Feedback | `src/models/feedback/` |
| **certificate** | Certificate, Undertaking, UndertakingAssignment | `src/models/certificate/` |
| **lost-found** | LostAndFound | `src/models/lost-found/` |
| **disco** | DisCoAction | `src/models/disco/` |
| **insurance** | InsuranceClaim, InsuranceProvider | `src/models/insurance/` |
| **health** | Health | `src/models/health/` |
| **config** | configuration | `src/models/config/` |
| **student** | StudentProfile | `src/models/student/` |

### Task 3.1: Create Model Group Folders

```bash
mkdir -p src/models/user
mkdir -p src/models/hostel
mkdir -p src/models/complaint
mkdir -p src/models/visitor
mkdir -p src/models/event
mkdir -p src/models/inventory
mkdir -p src/models/attendance
mkdir -p src/models/scanner
mkdir -p src/models/task
mkdir -p src/models/notification
mkdir -p src/models/feedback
mkdir -p src/models/certificate
mkdir -p src/models/lost-found
mkdir -p src/models/disco
mkdir -p src/models/insurance
mkdir -p src/models/health
mkdir -p src/models/config
mkdir -p src/models/student
```

### Task 3.2: Copy Models to New Locations

For each model:
1. Copy to new location with `.model.js` suffix
2. Create index.js in each group folder
3. Create legacy re-export in old location

**Example for User model**:

**Step 1**: Copy `models/User.js` → `src/models/user/User.model.js`
- No changes to content

**Step 2**: Create `src/models/user/index.js`
```javascript
export { default as User } from './User.model.js';
export { default as Session } from './Session.model.js';
// ... other exports
```

**Step 3**: Modify old `models/User.js` to re-export
```javascript
// LEGACY FILE - Re-exports from new location
export { default } from '../src/models/user/User.model.js';
export * from '../src/models/user/User.model.js';
```

### Task 3.3: Create Main Models Index

**File**: `src/models/index.js`

```javascript
// User models
export * from './user/index.js';

// Hostel models
export * from './hostel/index.js';

// Complaint models
export * from './complaint/index.js';

// ... etc for all groups
```

### Task 3.4-3.21: Repeat for Each Model Group

Each model group follows the same pattern:
1. Copy files to new location
2. Rename to `.model.js` suffix
3. Create group index.js
4. Update old file to re-export
5. Add entry to legacy_remain.md

**Full Model Migration List**:

| Old File | New File | Status |
|----------|----------|--------|
| models/User.js | src/models/user/User.model.js | ⬜ |
| models/Session.js | src/models/user/Session.model.js | ⬜ |
| models/Admin.js | src/models/user/Admin.model.js | ⬜ |
| models/Warden.js | src/models/user/Warden.model.js | ⬜ |
| models/AssociateWarden.js | src/models/user/AssociateWarden.model.js | ⬜ |
| models/Security.js | src/models/user/Security.model.js | ⬜ |
| models/HostelSupervisor.js | src/models/user/HostelSupervisor.model.js | ⬜ |
| models/HostelGate.js | src/models/user/HostelGate.model.js | ⬜ |
| models/MaintenanceStaff.js | src/models/user/MaintenanceStaff.model.js | ⬜ |
| models/Hostel.js | src/models/hostel/Hostel.model.js | ⬜ |
| models/Room.js | src/models/hostel/Room.model.js | ⬜ |
| models/RoomAllocation.js | src/models/hostel/RoomAllocation.model.js | ⬜ |
| models/RoomChangeRequest.js | src/models/hostel/RoomChangeRequest.model.js | ⬜ |
| models/Unit.js | src/models/hostel/Unit.model.js | ⬜ |
| models/Complaint.js | src/models/complaint/Complaint.model.js | ⬜ |
| models/Visitors.js | src/models/visitor/Visitors.model.js | ⬜ |
| models/VisitorProfile.js | src/models/visitor/VisitorProfile.model.js | ⬜ |
| models/VisitorRequest.js | src/models/visitor/VisitorRequest.model.js | ⬜ |
| models/FamilyMember.js | src/models/visitor/FamilyMember.model.js | ⬜ |
| models/Event.js | src/models/event/Event.model.js | ⬜ |
| models/Poll.js | src/models/event/Poll.model.js | ⬜ |
| models/HostelInventory.js | src/models/inventory/HostelInventory.model.js | ⬜ |
| models/StudentInventory.js | src/models/inventory/StudentInventory.model.js | ⬜ |
| models/InventoryItemType.js | src/models/inventory/InventoryItemType.model.js | ⬜ |
| models/CheckInOut.js | src/models/attendance/CheckInOut.model.js | ⬜ |
| models/staffAttendance.js | src/models/attendance/StaffAttendance.model.js | ⬜ |
| models/Leave.js | src/models/attendance/Leave.model.js | ⬜ |
| models/FaceScanner.js | src/models/scanner/FaceScanner.model.js | ⬜ |
| models/ApiClient.js | src/models/scanner/ApiClient.model.js | ⬜ |
| models/Task.js | src/models/task/Task.model.js | ⬜ |
| models/Notification.js | src/models/notification/Notification.model.js | ⬜ |
| models/Feedback.js | src/models/feedback/Feedback.model.js | ⬜ |
| models/Certificate.js | src/models/certificate/Certificate.model.js | ⬜ |
| models/Undertaking.js | src/models/certificate/Undertaking.model.js | ⬜ |
| models/UndertakingAssignment.js | src/models/certificate/UndertakingAssignment.model.js | ⬜ |
| models/LostAndFound.js | src/models/lost-found/LostAndFound.model.js | ⬜ |
| models/DisCoAction.js | src/models/disco/DisCoAction.model.js | ⬜ |
| models/InsuranceClaim.js | src/models/insurance/InsuranceClaim.model.js | ⬜ |
| models/InsuranceProvider.js | src/models/insurance/InsuranceProvider.model.js | ⬜ |
| models/Health.js | src/models/health/Health.model.js | ⬜ |
| models/configuration.js | src/models/config/Configuration.model.js | ⬜ |
| models/StudentProfile.js | src/models/student/StudentProfile.model.js | ⬜ |

**Verification**: All existing imports still work

---

## Phase 4: Middleware Enhancement

**Status**: ⬜ Not Started  
**Estimated Files**: 8 files (5 new, 3 modified)  
**Breaking Changes**: None  
**Dependencies**: Phase 1, Phase 3

### Task 4.1: Copy Existing Middlewares

**Step 1**: Copy `middlewares/auth.js` → `src/middlewares/auth.middleware.js`
**Step 2**: Copy `middlewares/authorize.js` → `src/middlewares/authorize.middleware.js`
**Step 3**: Copy `middlewares/faceScannerAuth.js` → `src/middlewares/faceScannerAuth.middleware.js`

### Task 4.2: Create Validation Middleware

**File**: `src/middlewares/validate.middleware.js`

```javascript
/**
 * Request Validation Middleware
 * Validates request body/query/params against schema
 */
import { ValidationError } from '../core/errors/index.js';

/**
 * Create validation middleware for a schema
 * @param {Object} schema - Validation schema object
 * @param {string} source - Source to validate: 'body', 'query', 'params'
 * @returns {Function} Express middleware
 */
export const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = req[source];
    
    // If using Joi
    if (schema.validate) {
      const { error, value } = schema.validate(data, { 
        abortEarly: false,
        stripUnknown: true 
      });
      
      if (error) {
        const errors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }));
        throw new ValidationError('Validation failed', errors);
      }
      
      req[source] = value; // Replace with validated/sanitized data
    }
    
    next();
  };
};

/**
 * Validate request body
 */
export const validateBody = (schema) => validate(schema, 'body');

/**
 * Validate query parameters
 */
export const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate route parameters
 */
export const validateParams = (schema) => validate(schema, 'params');

export default validate;
```

### Task 4.3: Create Rate Limit Middleware

**File**: `src/middlewares/rateLimit.middleware.js`

```javascript
/**
 * Rate Limiting Middleware
 * Prevents abuse by limiting requests per IP
 */
import rateLimit from 'express-rate-limit';

/**
 * Default rate limiter - 100 requests per 15 minutes
 */
export const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: {
    success: false,
    message: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Strict rate limiter for auth endpoints - 5 requests per 15 minutes
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many login attempts, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * API rate limiter - 1000 requests per 15 minutes
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: {
    success: false,
    message: 'API rate limit exceeded'
  },
  standardHeaders: true,
  legacyHeaders: false
});

export default defaultLimiter;
```

### Task 4.4: Create Request Logger Middleware

**File**: `src/middlewares/logger.middleware.js`

```javascript
/**
 * Request Logger Middleware
 * Logs incoming requests for debugging and monitoring
 */
import morgan from 'morgan';

// Custom token for user ID
morgan.token('user-id', (req) => req.user?._id || 'anonymous');

// Custom token for session ID
morgan.token('session-id', (req) => req.sessionID || 'no-session');

/**
 * Development logger format
 */
export const devLogger = morgan('dev');

/**
 * Production logger format
 */
export const prodLogger = morgan(
  ':remote-addr - :user-id [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" - :response-time ms',
  {
    skip: (req) => req.path === '/health' // Skip health checks
  }
);

/**
 * Get appropriate logger based on environment
 */
export const requestLogger = process.env.NODE_ENV === 'production' ? prodLogger : devLogger;

export default requestLogger;
```

### Task 4.5: Create Middleware Index

**File**: `src/middlewares/index.js`

```javascript
// Auth middlewares
export { authenticate, refreshUserData, ensureSession } from './auth.middleware.js';
export { authorizeRoles } from './authorize.middleware.js';
export { authenticateFaceScanner } from './faceScannerAuth.middleware.js';

// Validation
export { validate, validateBody, validateQuery, validateParams } from './validate.middleware.js';

// Rate limiting
export { defaultLimiter, authLimiter, apiLimiter } from './rateLimit.middleware.js';

// Logging
export { requestLogger, devLogger, prodLogger } from './logger.middleware.js';
```

### Task 4.6: Update Old Middlewares to Re-export

**File**: `middlewares/auth.js` (MODIFY)
```javascript
// LEGACY FILE - Re-exports from new location
export { authenticate, refreshUserData, ensureSession } from '../src/middlewares/auth.middleware.js';
```

**File**: `middlewares/authorize.js` (MODIFY)
```javascript
// LEGACY FILE - Re-exports from new location
export { authorizeRoles } from '../src/middlewares/authorize.middleware.js';
```

**File**: `middlewares/faceScannerAuth.js` (MODIFY)
```javascript
// LEGACY FILE - Re-exports from new location
export { authenticateFaceScanner } from '../src/middlewares/faceScannerAuth.middleware.js';
```

**Add to legacy_remain.md**:
```
| middlewares/auth.js | ALL | Legacy re-export | auth routes |
| middlewares/authorize.js | ALL | Legacy re-export | all routes |
| middlewares/faceScannerAuth.js | ALL | Legacy re-export | face scanner routes |
```

**Verification**: All route files still work with old imports

---

## Phase 5: Services Layer

**Status**: 🔄 In Progress (3/3 existing services moved, 0/6 new services)  
**Estimated Files**: 12 files (9 new, 3 moved)  
**Breaking Changes**: None  
**Dependencies**: Phase 1-4

### Existing Services to Move

| Old File | New File | Status |
|----------|----------|--------|
| services/faceScannerService.js | src/services/faceScanner.service.js | ✅ |
| services/liveCheckInOutService.js | src/services/liveCheckInOut.service.js | ✅ |
| services/scannerActionService.js | src/services/scannerAction.service.js | ✅ |

### New Services to Create

### Task 5.1: Create Notification Service

**File**: `src/services/notification.service.js`

```javascript
/**
 * Notification Service
 * Handles all notification-related business logic
 */
import Notification from '../models/notification/Notification.model.js';

class NotificationService {
  /**
   * Create a new notification
   */
  async create(data) {
    const notification = new Notification(data);
    return notification.save();
  }

  /**
   * Send notification to user
   */
  async sendToUser(userId, { title, message, type = 'info', link = null }) {
    return this.create({
      userId,
      title,
      message,
      type,
      link,
      read: false
    });
  }

  /**
   * Send notification to multiple users
   */
  async sendToUsers(userIds, notificationData) {
    const notifications = userIds.map(userId => ({
      ...notificationData,
      userId,
      read: false
    }));
    return Notification.insertMany(notifications);
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
    const query = { userId };
    if (unreadOnly) query.read = false;

    const [notifications, total] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query)
    ]);

    return { notifications, total, page, limit };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    return Notification.findOneAndUpdate(
      { _id: notificationId, userId },
      { read: true },
      { new: true }
    );
  }

  /**
   * Mark all notifications as read for user
   */
  async markAllAsRead(userId) {
    return Notification.updateMany(
      { userId, read: false },
      { read: true }
    );
  }
}

export const notificationService = new NotificationService();
export default notificationService;
```

### Task 5.2: Create Storage Service

**File**: `src/services/storage.service.js`

```javascript
/**
 * Storage Service
 * Handles file uploads to Azure Blob Storage or local storage
 */
import { BlobServiceClient } from '@azure/storage-blob';
import path from 'path';
import fs from 'fs/promises';
import { env } from '../config/index.js';

class StorageService {
  constructor() {
    this.useLocalStorage = env.USE_LOCAL_STORAGE;
    
    if (!this.useLocalStorage && env.azure.connectionString) {
      this.blobServiceClient = BlobServiceClient.fromConnectionString(
        env.azure.connectionString
      );
      this.containerClient = this.blobServiceClient.getContainerClient(
        env.azure.containerName
      );
    }
  }

  /**
   * Upload file
   * @param {Buffer} buffer - File buffer
   * @param {string} fileName - File name
   * @param {string} mimeType - MIME type
   * @returns {Promise<string>} File URL
   */
  async upload(buffer, fileName, mimeType) {
    if (this.useLocalStorage) {
      return this.uploadLocal(buffer, fileName);
    }
    return this.uploadAzure(buffer, fileName, mimeType);
  }

  /**
   * Upload to local storage
   */
  async uploadLocal(buffer, fileName) {
    const uploadDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, fileName);
    await fs.writeFile(filePath, buffer);
    
    return `/uploads/${fileName}`;
  }

  /**
   * Upload to Azure Blob Storage
   */
  async uploadAzure(buffer, fileName, mimeType) {
    const blockBlobClient = this.containerClient.getBlockBlobClient(fileName);
    
    await blockBlobClient.upload(buffer, buffer.length, {
      blobHTTPHeaders: { blobContentType: mimeType }
    });
    
    return blockBlobClient.url;
  }

  /**
   * Delete file
   */
  async delete(fileUrl) {
    if (this.useLocalStorage) {
      const filePath = path.join(process.cwd(), fileUrl);
      await fs.unlink(filePath).catch(() => {});
    } else {
      const blobName = fileUrl.split('/').pop();
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.deleteIfExists();
    }
  }
}

export const storageService = new StorageService();
export default storageService;
```

### Task 5.3: Create Payment Service

**File**: `src/services/payment.service.js`

```javascript
/**
 * Payment Service
 * Handles Razorpay payment integration
 */
import Razorpay from 'razorpay';
import { env } from '../config/index.js';

class PaymentService {
  constructor() {
    if (env.razorpay.keyId && env.razorpay.keySecret) {
      this.razorpay = new Razorpay({
        key_id: env.razorpay.keyId,
        key_secret: env.razorpay.keySecret
      });
    }
  }

  /**
   * Create payment link
   */
  async createPaymentLink(amount, description = 'Hostel Payment') {
    const paymentLink = await this.razorpay.paymentLink.create({
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      accept_partial: false,
      description,
      reminder_enable: true,
      callback_method: 'get'
    });

    return {
      paymentLink: paymentLink.short_url,
      paymentId: paymentLink.id
    };
  }

  /**
   * Check payment status
   */
  async checkPaymentStatus(paymentId) {
    try {
      const payment = await this.razorpay.paymentLink.fetch(paymentId);
      return payment.status;
    } catch (error) {
      console.error('Error checking payment status:', error);
      return null;
    }
  }

  /**
   * Verify payment signature
   */
  verifySignature(orderId, paymentId, signature) {
    const crypto = require('crypto');
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', env.razorpay.keySecret)
      .update(body)
      .digest('hex');
    
    return expectedSignature === signature;
  }
}

export const paymentService = new PaymentService();
export default paymentService;
```

### Task 5.4: Create Email Service (Placeholder)

**File**: `src/services/email.service.js`

```javascript
/**
 * Email Service
 * Placeholder for email functionality
 * TODO: Implement with nodemailer or similar
 */

class EmailService {
  /**
   * Send email
   */
  async send({ to, subject, html, text }) {
    // TODO: Implement email sending
    console.log(`Email would be sent to: ${to}, Subject: ${subject}`);
    return true;
  }

  /**
   * Send welcome email
   */
  async sendWelcome(user) {
    return this.send({
      to: user.email,
      subject: 'Welcome to Hostel Management System',
      html: `<h1>Welcome ${user.name}!</h1>`
    });
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(user, resetToken) {
    return this.send({
      to: user.email,
      subject: 'Password Reset Request',
      html: `<p>Reset your password using this token: ${resetToken}</p>`
    });
  }
}

export const emailService = new EmailService();
export default emailService;
```

### Task 5.5: Move Existing Services

Copy and create legacy re-exports for:
- `services/faceScannerService.js` → `src/services/faceScanner.service.js`
- `services/liveCheckInOutService.js` → `src/services/liveCheckInOut.service.js`
- `services/scannerActionService.js` → `src/services/scannerAction.service.js`

### Task 5.6: Create Services Index

**File**: `src/services/index.js`

```javascript
export { notificationService } from './notification.service.js';
export { storageService } from './storage.service.js';
export { paymentService } from './payment.service.js';
export { emailService } from './email.service.js';
export * from './faceScanner.service.js';
export * from './liveCheckInOut.service.js';
export * from './scannerAction.service.js';
```

**Verification**: All existing service imports still work

---

## Phase 6: Module-wise Route Migration

**Status**: ⬜ Not Started  
**Estimated Files**: 34 route modules to migrate  
**Breaking Changes**: None  
**Dependencies**: Phase 1-5

### Migration Strategy

For each route module:
1. Create feature folder in `src/api/v1/{feature}/`
2. Create `{feature}.routes.js` (copy from old routes)
3. Create `{feature}.controller.js` (copy from old controllers)
4. Create `{feature}.service.js` (extract business logic - optional)
5. Create `{feature}.validator.js` (add validation - optional)
6. Create `index.js` to export everything
7. Update old route file to re-export from new location
8. Update old controller file to re-export from new location

### Route Module Groups (Order of Migration)

#### Group A: Core Auth & User (Priority 1)
| # | Module | Routes File | Controllers | Status |
|---|--------|-------------|-------------|--------|
| 1 | auth | authRoutes.js | authController.js | ⬜ |
| 2 | users | userRoutes.js | userController.js | ⬜ |
| 3 | sso | ssoRoutes.js | ssoController.js | ⬜ |

#### Group B: Hostel Management (Priority 2)
| # | Module | Routes File | Controllers | Status |
|---|--------|-------------|-------------|--------|
| 4 | hostels | hostelRoutes.js | hostelController.js | ⬜ |
| 5 | students | studentRoutes.js | studentController.js | ⬜ |
| 6 | student-profile | studentProfileRoutes.js | studentProfileController.js | ⬜ |
| 7 | wardens | wardenRoute.js | wardenController.js, associateWardenController.js | ⬜ |

#### Group C: Operations (Priority 3)
| # | Module | Routes File | Controllers | Status |
|---|--------|-------------|-------------|--------|
| 8 | complaints | complaintRoutes.js | complaintController.js | ⬜ |
| 9 | leaves | leaveRoutes.js | leaveController.js | ⬜ |
| 10 | visitors | visitorRoutes.js | visitorController.js, visitorProfileController.js | ⬜ |
| 11 | family | familyMemberRoutes.js | familyMemberController.js | ⬜ |
| 12 | events | eventRoutes.js | eventController.js | ⬜ |

#### Group D: Inventory & Facilities (Priority 4)
| # | Module | Routes File | Controllers | Status |
|---|--------|-------------|-------------|--------|
| 13 | inventory | inventoryRoutes.js | hostelInventoryController.js, studentInventoryController.js, inventoryItemTypeController.js | ⬜ |
| 14 | lost-found | lostAndFoundRoutes.js | lostAndFoundController.js | ⬜ |
| 15 | tasks | taskRoutes.js | taskController.js | ⬜ |

#### Group E: Security & Attendance (Priority 5)
| # | Module | Routes File | Controllers | Status |
|---|--------|-------------|-------------|--------|
| 16 | security | securityRoutes.js | securityController.js | ⬜ |
| 17 | face-scanner | faceScannerRoutes.js | faceScannerController.js, scannerActionController.js | ⬜ |
| 18 | staff-attendance | staffAttendanceRoutes.js | staffAttendanceController.js | ⬜ |
| 19 | live-checkinout | liveCheckInOutRoutes.js | liveCheckInOutController.js | ⬜ |

#### Group F: Admin & Dashboard (Priority 6)
| # | Module | Routes File | Controllers | Status |
|---|--------|-------------|-------------|--------|
| 20 | admin | adminRoutes.js | adminController.js | ⬜ |
| 21 | super-admin | superAdminRoutes.js | superAdminControllers.js | ⬜ |
| 22 | dashboard | dashboardRoutes.js | dashboardController.js | ⬜ |
| 23 | stats | statsRoutes.js | statsController.js | ⬜ |
| 24 | permissions | permissionRoutes.js | permissionController.js | ⬜ |

#### Group G: Communication & Misc (Priority 7)
| # | Module | Routes File | Controllers | Status |
|---|--------|-------------|-------------|--------|
| 25 | notifications | notificationRoutes.js | notificationController.js | ⬜ |
| 26 | feedback | feedbackRoutes.js | feedbackController.js | ⬜ |
| 27 | certificates | certificateRoutes.js | certificateController.js | ⬜ |
| 28 | undertakings | undertakingRoutes.js | undertakingController.js | ⬜ |
| 29 | disco | disCoRoutes.js | disCoController.js | ⬜ |

#### Group H: Utilities (Priority 8)
| # | Module | Routes File | Controllers | Status |
|---|--------|-------------|-------------|--------|
| 30 | upload | uploadRoutes.js | uploadController.js | ⬜ |
| 31 | payments | paymentRoutes.js | paymentController.js | ⬜ |
| 32 | config | configRoutes.js | configController.js | ⬜ |
| 33 | sheets | sheetRoutes.js | sheetController.js | ⬜ |
| 34 | online-users | onlineUsersRoutes.js | onlineUsersController.js | ⬜ |

---

### Detailed Migration Template (Per Module)

#### Example: Auth Module Migration

**Step 1**: Create directory
```bash
mkdir -p src/api/v1/auth
```

**Step 2**: Create `src/api/v1/auth/auth.controller.js`
```javascript
/**
 * Auth Controller
 * Handles authentication-related HTTP requests
 */

// Copy all exports from controllers/authController.js
// No logic changes, just reorganization
import { isDevelopmentEnvironment } from '../../../config/index.js';
import User from '../../../models/user/User.model.js';
// ... rest of the controller code
```

**Step 3**: Create `src/api/v1/auth/auth.routes.js`
```javascript
/**
 * Auth Routes
 * /api/auth/*
 */
import express from 'express';
import * as authController from './auth.controller.js';
import { authenticate, refreshUserData } from '../../../middlewares/index.js';

const router = express.Router();

// Routes stay EXACTLY the same
router.get('/user', authenticate, authController.getUser);
router.get('/logout', authenticate, authController.logout);
// ... all routes

export default router;
```

**Step 4**: Create `src/api/v1/auth/auth.validator.js` (Optional - for new validation)
```javascript
/**
 * Auth Request Validators
 */
import Joi from 'joi';

export const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

export const updatePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).required()
});
```

**Step 5**: Create `src/api/v1/auth/index.js`
```javascript
export { default as authRoutes } from './auth.routes.js';
export * from './auth.controller.js';
export * from './auth.validator.js';
```

**Step 6**: Update old files to re-export (Legacy Support)

`routes/authRoutes.js`:
```javascript
// LEGACY FILE - Re-exports from new location
// TODO: Update server.js to import from src/api/v1/auth then delete this
export { default } from '../src/api/v1/auth/auth.routes.js';
```

`controllers/authController.js`:
```javascript
// LEGACY FILE - Re-exports from new location
export * from '../src/api/v1/auth/auth.controller.js';
```

**Step 7**: Add to legacy_remain.md
```
| routes/authRoutes.js | ALL | Legacy re-export | server.js line 7 |
| controllers/authController.js | ALL | Legacy re-export | routes/authRoutes.js |
```

**Verification**:
- [ ] `GET /api/auth/user` works
- [ ] `GET /api/auth/logout` works
- [ ] `POST /api/auth/google` works
- [ ] `POST /api/auth/login` works
- [ ] All other auth endpoints work

---

### Task 6.1: Create API v1 Index

**File**: `src/api/v1/index.js`

```javascript
/**
 * API v1 Routes Aggregator
 * Combines all v1 route modules
 */
import express from 'express';

// Import all route modules (will be added as modules are migrated)
// import authRoutes from './auth/auth.routes.js';

const router = express.Router();

// Mount routes (will be added as modules are migrated)
// router.use('/auth', authRoutes);

export default router;
```

This file will be updated as each module is migrated.

### Task 6.2-6.35: Migrate Each Module

Follow the template above for each of the 34 modules.

---

## Phase 7: External API Restructuring

**Status**: ⬜ Not Started  
**Estimated Files**: ~20 files  
**Breaking Changes**: None  
**Dependencies**: Phase 6

### Current Structure
```
externalApi/
├── index.js
├── controllers/
├── middleware/
└── routes/
```

### Target Structure
```
src/external/
├── index.js
├── controllers/
├── middleware/
├── routes/
└── README.md
```

### Task 7.1: Copy External API Structure

1. Copy entire `externalApi/` folder to `src/external/`
2. Update imports within the copied files
3. Update old `externalApi/index.js` to re-export from new location

**File**: `externalApi/index.js` (Modified)
```javascript
// LEGACY FILE - Re-exports from new location
export { default } from '../src/external/index.js';
```

**Add to legacy_remain.md**:
```
| externalApi/index.js | ALL | Legacy re-export | server.js line 24 |
```

---

## Phase 8: Server.js Cleanup

**Status**: ⬜ Not Started  
**Estimated Files**: 3 files (2 new, 1 modified)  
**Breaking Changes**: None  
**Dependencies**: Phase 1-7

### Task 8.1: Create Express Loader

**File**: `src/loaders/express.loader.js`

```javascript
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

import { corsOptions, ssoCorsOptions, scannerCorsOptions, sessionConfig, env } from '../config/index.js';
import { errorHandler, notFoundHandler } from '../core/errors/index.js';
import { requestLogger } from '../middlewares/index.js';

// API Routes
import apiV1Routes from '../api/v1/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize Express application
 * @param {Express} app - Express application instance
 */
export const initializeExpress = (app) => {
  // Trust proxy for secure cookies behind load balancer
  app.set('trust proxy', 1);

  // Request parsing
  app.use(express.urlencoded({ limit: '1mb', extended: true }));
  app.use(cookieParser());

  // Request logging
  app.use(requestLogger);

  // SSO CORS (before session)
  // TODO: Import and apply SSO routes with special CORS

  // Scanner CORS (before session)
  // TODO: Import and apply scanner routes with special CORS

  // Regular CORS
  app.use(cors(corsOptions));

  // Session
  app.use(session(sessionConfig));

  // Static files for local storage
  if (env.USE_LOCAL_STORAGE) {
    app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
  }

  // JSON parsing
  app.use(express.json({ limit: '1mb' }));

  // API Routes v1
  app.use('/api', apiV1Routes);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
};

export default initializeExpress;
```

### Task 8.2: Create Database Loader

**File**: `src/loaders/database.loader.js`

```javascript
/**
 * Database Loader
 * Initializes MongoDB connection
 */
import { connectDatabase } from '../config/database.config.js';

export const initializeDatabase = async () => {
  await connectDatabase();
};

export default initializeDatabase;
```

### Task 8.3: Create Socket Loader

**File**: `src/loaders/socket.loader.js`

```javascript
/**
 * Socket.io Loader
 * Initializes WebSocket connections
 */

// Copy logic from config/socket.js
export const initializeSocket = (httpServer, sessionMiddleware) => {
  // Socket initialization logic
};

export default initializeSocket;
```

### Task 8.4: Create Loaders Index

**File**: `src/loaders/index.js`

```javascript
export { initializeExpress } from './express.loader.js';
export { initializeDatabase } from './database.loader.js';
export { initializeSocket } from './socket.loader.js';
```

### Task 8.5: Create Main App File

**File**: `src/app.js`

```javascript
/**
 * Express Application
 * Main application configuration
 */
import express from 'express';
import { initializeExpress } from './loaders/index.js';

const app = express();
initializeExpress(app);

export default app;
```

### Task 8.6: Simplify server.js (Final)

**File**: `server.js` (Modified - Final Version)

```javascript
/**
 * Server Entry Point
 * Starts the HTTP server
 */
import { createServer } from 'http';
import app from './src/app.js';
import { initializeDatabase, initializeSocket } from './src/loaders/index.js';
import { env } from './src/config/index.js';

const startServer = async () => {
  // Connect to database
  await initializeDatabase();

  // Create HTTP server
  const httpServer = createServer(app);

  // Initialize Socket.io
  initializeSocket(httpServer);

  // Start listening
  httpServer.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
```

**NOTE**: This is the FINAL goal. During migration, we keep the old server.js working and only switch when everything is tested.

---

## Phase 9: Final Cleanup

**Status**: ⬜ Not Started  
**Dependencies**: Phase 1-8, All tests passing

### Task 9.1: Update package.json Scripts

```json
{
  "scripts": {
    "dev": "nodemon server.js",
    "start": "node server.js",
    "test": "jest",
    "lint": "eslint src/",
    "lint:fix": "eslint src/ --fix",
    "format": "prettier --write src/"
  }
}
```

### Task 9.2: Add ESLint Configuration

**File**: `.eslintrc.js`
```javascript
module.exports = {
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }]
  }
};
```

### Task 9.3: Add Prettier Configuration

**File**: `.prettierrc`
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### Task 9.4: Update README.md

Document new structure and development workflow.

### Task 9.5: Review legacy_remain.md

Go through all legacy entries and plan frontend updates.

---

## Testing Checklist

### API Endpoint Tests (Per Module)

After each module migration, test all endpoints:

| Module | Endpoints to Test | Status |
|--------|-------------------|--------|
| auth | GET /api/auth/user, POST /api/auth/login, etc. | ⬜ |
| users | GET /api/users/*, POST /api/users/*, etc. | ⬜ |
| ... | ... | ⬜ |

### Integration Tests

- [ ] Login flow works
- [ ] Session persists across requests
- [ ] CORS works from frontend
- [ ] File uploads work
- [ ] Socket.io connections work
- [ ] External API still works

### Performance Tests

- [ ] Response times are similar
- [ ] Memory usage is stable
- [ ] No memory leaks

---

## Rollback Plan

If anything breaks:

### Immediate Rollback
```bash
# Revert to main branch
git checkout main

# Or revert specific commits
git revert HEAD~N
```

### Partial Rollback
Since each phase creates legacy re-exports, you can:
1. Remove re-exports from old files
2. Restore original code
3. Old imports continue working

### Per-Module Rollback
Each module can be rolled back independently:
1. Delete new folder (e.g., `src/api/v1/auth/`)
2. Restore original route file content
3. Restore original controller file content

---

## Progress Tracking

### Overall Progress
| Phase | Status | % Complete |
|-------|--------|------------|
| Phase 0: Foundation | ✅ Complete | 100% |
| Phase 1: Core Utilities | ✅ Complete | 100% |
| Phase 2: Configuration | ✅ Complete | 100% |
| Phase 3: Models | ⬜ Not Started | 0% |
| Phase 4: Middleware | ✅ Complete | 100% |
| Phase 5: Services | ⬜ Not Started | 0% |
| Phase 6: Routes | ⬜ Not Started | 0% |
| Phase 7: External API | ⬜ Not Started | 0% |
| Phase 8: Server Cleanup | ⬜ Not Started | 0% |
| Phase 9: Final | ⬜ Not Started | 0% |

### Current Task
- **Phase**: 5 - Services Layer
- **Task**: Next to migrate
- **Blocked By**: None

### Notes
- Phases 0-4 completed on Jan 29, 2026
- Server tested and working correctly
- All legacy re-exports in place

---

## Quick Reference

### File Naming Conventions
- Routes: `{feature}.routes.js`
- Controllers: `{feature}.controller.js`
- Services: `{feature}.service.js`
- Models: `{Entity}.model.js`
- Middleware: `{name}.middleware.js`
- Validators: `{feature}.validator.js`
- Constants: `{category}.constants.js`

### Import Patterns

**Old (Legacy)**:
```javascript
import { authenticate } from './middlewares/auth.js';
import User from './models/User.js';
```

**New (Preferred)**:
```javascript
import { authenticate } from './src/middlewares/index.js';
import { User } from './src/models/index.js';
```

### Adding New Features

After restructuring, new features should:
1. Create folder in `src/api/v1/{feature}/`
2. Create all files (routes, controller, service, validator)
3. Register routes in `src/api/v1/index.js`
4. No need to touch server.js

---

**END OF RESTRUCTURE PLAN**
