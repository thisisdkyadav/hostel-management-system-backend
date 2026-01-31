# Backend Structure Guide

> **Purpose**: Complete reference for AI coding agents and developers to understand the codebase structure, patterns, and conventions.
> **Last Updated**: January 31, 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Directory Structure](#2-directory-structure)
3. [Core Patterns](#3-core-patterns)
4. [File Templates](#4-file-templates)
5. [Import Conventions](#5-import-conventions)
6. [Coding Standards](#6-coding-standards)
7. [API Response Format](#7-api-response-format)
8. [Error Handling](#8-error-handling)
9. [Database Models](#9-database-models)
10. [Authentication & Authorization](#10-authentication--authorization)
11. [Quick Reference](#11-quick-reference)

---

## 1. Project Overview

### Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js (ES Modules) |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Authentication | JWT + Sessions |
| File Storage | Local / Cloud |
| API Version | v1 (`/api/v1/*`) |

### Architecture Pattern

**Modular Monolith** with:
- **Main App**: Hostel Management System (existing routes in `src/`)
- **Sub-Apps**: Feature-based applications in `src/apps/` (e.g., student-affairs)
- **Shared Resources**: Common utilities in `src/core/`, `src/utils/`, `src/services/base/`, `src/middlewares/`, `src/validations/`

---

## 2. Directory Structure

```
backend/src/
│
├── apps/                           # � ALL APPLICATIONS
│   │
│   ├── hostel/                     # Hostel Management System (main app)
│   │   ├── index.js                # App router (exports Express router)
│   │   ├── controllers/            # HTTP request handlers
│   │   │   ├── authController.js
│   │   │   ├── studentController.js
│   │   │   ├── complaintController.js
│   │   │   └── ...                 # 43 controllers
│   │   ├── services/               # Business logic
│   │   │   ├── auth.service.js
│   │   │   ├── student.service.js
│   │   │   └── ...                 # 43 services
│   │   └── routes/                 # Route definitions
│   │       ├── auth.routes.js
│   │       ├── student.routes.js
│   │       └── ...                 # 35 route files
│   │
│   └── student-affairs/            # Student Affairs System (new app)
│       ├── index.js                # App router
│       ├── constants/index.js      # App-specific constants
│       ├── README.md               # App documentation
│       └── modules/                # Feature modules
│           ├── grievance/          # Complete template module
│           │   ├── grievance.controller.js
│           │   ├── grievance.service.js
│           │   ├── grievance.routes.js
│           │   ├── grievance.validation.js
│           │   ├── grievance.constants.js
│           │   └── index.js
│           ├── scholarship/        # Empty - ready to build
│           ├── counseling/
│           ├── disciplinary/
│           ├── clubs/
│           └── elections/
│
├── config/                         # ⚙️ CONFIGURATION
│   ├── env.config.js               # Environment variables
│   ├── db.config.js                # Database configuration
│   └── index.js                    # Config exports
│
├── core/                           # 🎯 CORE INFRASTRUCTURE
│   ├── errors/
│   │   ├── AppError.js             # Base error class + specific errors
│   │   ├── errorHandler.js         # Global error handler middleware
│   │   └── index.js
│   ├── responses/
│   │   ├── ApiResponse.js          # Response helper class
│   │   └── index.js
│   ├── constants/
│   │   ├── roles.constants.js      # ROLES, ROLE_GROUPS
│   │   ├── status.constants.js     # Status enums for entities
│   │   └── index.js
│   └── index.js
│
├── loaders/                        # 🚀 APP INITIALIZATION
│   ├── express.loader.js           # Express config, mounts apps
│   ├── database.loader.js          # MongoDB connection
│   ├── socket.loader.js            # Socket.io setup
│   └── index.js
│
├── middlewares/                    # 🔒 EXPRESS MIDDLEWARES (shared)
│   ├── auth.middleware.js          # JWT verification
│   ├── authorize.middleware.js     # Role-based access control
│   ├── validate.middleware.js      # Joi validation middleware
│   └── index.js
│
├── models/                         # 📊 MONGOOSE MODELS (shared)
│   ├── user/
│   │   ├── User.js
│   │   └── Session.js
│   ├── student/
│   │   └── Student.js
│   ├── hostel/
│   │   ├── Hostel.js
│   │   └── Room.js
│   ├── complaint/
│   │   └── Complaint.js
│   └── ...                         # 17 domain folders
│
├── services/                       # ⚙️ SHARED SERVICES
│   ├── base/                       # Base service infrastructure
│   │   ├── BaseService.js          # Abstract CRUD service
│   │   ├── ServiceResponse.js      # Response helpers
│   │   ├── QueryBuilder.js         # Fluent query builder
│   │   ├── TransactionHelper.js    # MongoDB transactions
│   │   ├── Logger.js               # Logging utility
│   │   └── index.js
│   └── index.js                    # Re-exports base/
│
├── utils/                          # 🛠️ UTILITY FUNCTIONS (shared)
│   ├── asyncHandler.js             # Async error wrapper
│   ├── controllerHelpers.js        # sendRawResponse, createServiceHandler
│   ├── permissions.js              # Permission checking utilities
│   ├── qrUtils.js                  # QR code utilities
│   └── index.js
│
├── validations/                    # ✅ JOI SCHEMAS (shared)
│   ├── common.validation.js        # Shared schemas: objectId, email, etc.
│   ├── auth.validation.js          # Auth-specific schemas
│   ├── student.validation.js
│   └── ...
│
├── uploads/                        # 📁 FILE UPLOADS (if local storage)
│   ├── profile-images/
│   ├── certificates/
│   └── ...
│
├── app.js                          # 📱 App factory function
└── server.js                       # 🏁 Entry point
```

---

## 3. Core Patterns

### 3.1 Controller Pattern

Controllers handle HTTP requests and delegate to services:

```javascript
// src/controllers/exampleController.js

import { asyncHandler, sendRawResponse } from '../utils/controllerHelpers.js';
import { exampleService } from '../services/example.service.js';

/**
 * @desc    Get all items
 * @route   GET /api/example
 * @access  Private
 */
export const getAll = asyncHandler(async (req, res) => {
  const result = await exampleService.getAll(req.query, req.user);
  sendRawResponse(res, result);
});

/**
 * @desc    Get item by ID
 * @route   GET /api/example/:id
 * @access  Private
 */
export const getById = asyncHandler(async (req, res) => {
  const result = await exampleService.getById(req.params.id);
  sendRawResponse(res, result);
});

/**
 * @desc    Create new item
 * @route   POST /api/example
 * @access  Private (Admin)
 */
export const create = asyncHandler(async (req, res) => {
  const result = await exampleService.create(req.body, req.user);
  sendRawResponse(res, result);
});
```

### 3.2 Service Pattern

Services contain business logic and extend BaseService:

```javascript
// src/services/example.service.js

import { BaseService } from './base/BaseService.js';
import { success, created, notFound, badRequest } from './base/ServiceResponse.js';
import Example from '../models/example/Example.js';

class ExampleService extends BaseService {
  constructor() {
    super(Example, 'Example');  // Model and entity name for error messages
  }

  /**
   * Get all items with pagination
   */
  async getAll(query, user) {
    const { page = 1, limit = 10, search, status } = query;
    
    const filter = {};
    if (status) filter.status = status;
    if (search) filter.name = { $regex: search, $options: 'i' };
    
    return this.findPaginated(filter, { page, limit });
  }

  /**
   * Create new item
   */
  async create(data, user) {
    // Validation
    const existing = await this.model.findOne({ name: data.name });
    if (existing) {
      return badRequest('Item with this name already exists');
    }
    
    // Create
    const item = await this.model.create({
      ...data,
      createdBy: user._id,
    });
    
    return created({ item }, 'Item created successfully');
  }
}

export const exampleService = new ExampleService();
```

### 3.3 Routes Pattern

Routes define endpoints and apply middleware:

```javascript
// src/apps/hostel/routes/example.routes.js

import express from 'express';
import { authenticate } from '../../../middlewares/auth.middleware.js';
import { authorizeRoles } from '../../../middlewares/authorize.middleware.js';
import * as exampleController from '../controllers/exampleController.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/v1/example - List all
router.get('/', exampleController.getAll);

// GET /api/v1/example/:id - Get by ID
router.get('/:id', exampleController.getById);

// POST /api/v1/example - Create (Admin only)
router.post(
  '/',
  authorizeRoles(['Admin', 'Super Admin']),
  exampleController.create
);

export default router;
```

### 3.4 Sub-App Pattern

Both hostel and student-affairs apps are in `src/apps/`. Each app exports an Express router:

```javascript
// src/apps/hostel/index.js (main app)
import express from 'express';
import authRoutes from './routes/auth.routes.js';
import studentRoutes from './routes/student.routes.js';
// ... more route imports

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/student', studentRoutes);
// ... mount all routes

export default router;
```

```javascript
// src/apps/student-affairs/index.js (modular app)
import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import grievanceRoutes from './modules/grievance/grievance.routes.js';

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ app: 'student-affairs', status: 'ok' });
});

router.use(protect);
router.use('/grievances', grievanceRoutes);

export default router;
```

Mounted in `express.loader.js`:
```javascript
import hostelApp from '../apps/hostel/index.js';
import studentAffairsApp from '../apps/student-affairs/index.js';

app.use('/api', hostelApp);                    // /api/auth, /api/student, etc.
app.use('/api/student-affairs', studentAffairsApp);  // /api/student-affairs/grievances
```

---

## 4. File Templates

### 4.1 Module Structure (for sub-apps)

Each module in a sub-app has these files:

```
modules/grievance/
├── grievance.controller.js   # HTTP handlers
├── grievance.service.js      # Business logic
├── grievance.routes.js       # Route definitions
├── grievance.validation.js   # Joi schemas
├── grievance.constants.js    # Module constants
└── index.js                  # Module exports
```

### 4.2 Validation Template

```javascript
// {feature}.validation.js

import Joi from 'joi';
import { objectId, paginationSchema } from './common.validation.js';

// ID parameter
export const idParamSchema = Joi.object({
  id: objectId.required(),
});

// Query schema (for GET list)
export const getExamplesSchema = paginationSchema.keys({
  status: Joi.string().valid('active', 'inactive'),
  search: Joi.string().max(100),
});

// Create schema
export const createExampleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  description: Joi.string().trim().max(500),
  priority: Joi.string().valid('low', 'medium', 'high').default('medium'),
});

// Update schema
export const updateExampleSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100),
  description: Joi.string().trim().max(500),
  status: Joi.string().valid('active', 'inactive'),
}).min(1);  // At least one field required
```

### 4.3 Constants Template

```javascript
// {feature}.constants.js

export const EXAMPLE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  PENDING: 'pending',
};

export const EXAMPLE_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
};

// Status transitions (state machine)
export const EXAMPLE_TRANSITIONS = {
  [EXAMPLE_STATUS.PENDING]: [EXAMPLE_STATUS.ACTIVE, EXAMPLE_STATUS.INACTIVE],
  [EXAMPLE_STATUS.ACTIVE]: [EXAMPLE_STATUS.INACTIVE],
  [EXAMPLE_STATUS.INACTIVE]: [EXAMPLE_STATUS.ACTIVE],
};
```

---

## 5. Import Conventions

### 5.1 Import Order

Always follow this order:

```javascript
// 1. Node.js built-ins
import path from 'path';
import fs from 'fs';

// 2. External packages (npm)
import express from 'express';
import mongoose from 'mongoose';
import Joi from 'joi';

// 3. Core/shared modules
import { NotFoundError } from '../core/errors/index.js';
import { asyncHandler } from '../utils/controllerHelpers.js';
import { BaseService } from '../services/base/BaseService.js';

// 4. Models
import User from '../models/user/User.js';
import Student from '../models/student/Student.js';

// 5. Local/sibling imports
import { EXAMPLE_STATUS } from './example.constants.js';
import { exampleService } from './example.service.js';
```

### 5.2 Import Paths from Different Locations

**From `src/apps/hostel/controllers/`:**
```javascript
import { asyncHandler } from '../../../utils/controllerHelpers.js';
import { exampleService } from '../services/example.service.js';
import User from '../../../models/user/User.js';
import { authorizeRoles } from '../../../middlewares/authorize.middleware.js';
```

**From `src/apps/hostel/services/`:**
```javascript
import { BaseService } from '../../../services/base/BaseService.js';
import { success, notFound } from '../../../services/base/ServiceResponse.js';
import Example from '../../../models/example/Example.js';
```

**From `src/apps/hostel/routes/`:**
```javascript
import { exampleController } from '../controllers/exampleController.js';
import { authorizeRoles } from '../../../middlewares/authorize.middleware.js';
import { validate } from '../../../middlewares/validate.middleware.js';
```

**From `src/apps/student-affairs/modules/grievance/`:**
```javascript
import { asyncHandler, sendRawResponse } from '../../../../utils/controllerHelpers.js';
import { BaseService } from '../../../../services/base/BaseService.js';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';
import { objectId } from '../../../../validations/common.validation.js';
import { GRIEVANCE_STATUS } from './grievance.constants.js';
```

---

## 6. Coding Standards

### 6.1 Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (controllers) | `camelCase.js` | `studentController.js` |
| Files (services) | `kebab-case.service.js` | `student.service.js` |
| Files (routes) | `kebab-case.routes.js` | `student.routes.js` |
| Files (models) | `PascalCase.js` | `Student.js` |
| Variables | `camelCase` | `userId`, `isActive` |
| Functions | `camelCase` | `getStudentById()` |
| Classes | `PascalCase` | `StudentService` |
| Constants | `SCREAMING_SNAKE_CASE` | `MAX_FILE_SIZE` |
| Enums/Objects | `SCREAMING_SNAKE_CASE` | `COMPLAINT_STATUS` |

### 6.2 Function Documentation

```javascript
/**
 * Create a new complaint
 * @param {Object} data - Complaint data
 * @param {string} data.title - Complaint title
 * @param {string} data.description - Complaint description
 * @param {Object} user - Authenticated user object
 * @returns {Promise<ServiceResponse>} Created complaint or error
 */
async createComplaint(data, user) {
  // ...
}
```

### 6.3 Controller Handler Pattern

```javascript
// ✅ CORRECT - Use asyncHandler + sendRawResponse
export const getItems = asyncHandler(async (req, res) => {
  const result = await service.getItems(req.query);
  sendRawResponse(res, result);
});

// ❌ WRONG - Manual try-catch
export const getItems = async (req, res) => {
  try {
    const result = await service.getItems(req.query);
    res.json(result.data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
```

---

## 7. API Response Format

### 7.1 ServiceResponse Helpers

Located in `src/services/base/ServiceResponse.js`:

```javascript
// Success (200)
return success({ items, total }, 'Items fetched successfully');
// → { success: true, statusCode: 200, data: { items, total }, message: '...' }

// Created (201)
return created({ item }, 'Item created successfully');
// → { success: true, statusCode: 201, data: { item }, message: '...' }

// Not Found (404)
return notFound('Item');
// → { success: false, statusCode: 404, message: 'Item not found' }

// Bad Request (400)
return badRequest('Invalid input data');
// → { success: false, statusCode: 400, message: 'Invalid input data' }

// Forbidden (403)
return forbidden('You do not have permission');
// → { success: false, statusCode: 403, message: '...' }

// Paginated
return paginated(items, { page, limit, total });
// → { success: true, statusCode: 200, data: { items, pagination: {...} } }
```

### 7.2 Controller Response

Use `sendRawResponse` to send ServiceResponse to client:

```javascript
import { sendRawResponse } from '../utils/controllerHelpers.js';

export const getItem = asyncHandler(async (req, res) => {
  const result = await service.getById(req.params.id);
  sendRawResponse(res, result);
  // Success: res.status(200).json(result.data)
  // Error: res.status(result.statusCode).json({ message: result.message })
});
```

---

## 8. Error Handling

### 8.1 Error Classes

Located in `src/core/errors/AppError.js`:

```javascript
import {
  AppError,           // Base class (500)
  BadRequestError,    // 400
  UnauthorizedError,  // 401
  ForbiddenError,     // 403
  NotFoundError,      // 404
  ConflictError,      // 409
  ValidationError,    // 422
  TooManyRequestsError, // 429
  InternalError,      // 500
} from '../core/errors/index.js';

// Usage in service
throw new NotFoundError('Student not found');
throw new BadRequestError('Email is required');
throw new ForbiddenError('Only admins can access this');
```

### 8.2 Global Error Handler

Located in `src/core/errors/errorHandler.js`:
- Catches all errors thrown in async handlers
- Formats error response consistently
- Logs errors appropriately

### 8.3 Async Error Catching

Use `asyncHandler` to automatically catch errors:

```javascript
import { asyncHandler } from '../utils/controllerHelpers.js';

// Errors are caught and passed to global error handler
export const getItem = asyncHandler(async (req, res) => {
  const item = await Item.findById(req.params.id);
  if (!item) throw new NotFoundError('Item');
  res.json(item);
});
```

---

## 9. Database Models

### 9.1 Model Location

Models are in `src/models/{domain}/`:
```
models/
├── user/
│   ├── User.js
│   └── Session.js
├── student/
│   └── Student.js
├── hostel/
│   ├── Hostel.js
│   └── Room.js
```

### 9.2 Model Template

```javascript
// src/models/example/Example.js

import mongoose from 'mongoose';

const exampleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'pending'],
      default: 'pending',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,  // Adds createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
exampleSchema.index({ status: 1, createdAt: -1 });
exampleSchema.index({ name: 'text' });

// Virtual
exampleSchema.virtual('isActive').get(function () {
  return this.status === 'active';
});

// Methods
exampleSchema.methods.activate = function () {
  this.status = 'active';
  return this.save();
};

// Statics
exampleSchema.statics.findByStatus = function (status) {
  return this.find({ status });
};

export default mongoose.model('Example', exampleSchema);
```

---

## 10. Authentication & Authorization

### 10.1 Auth Middleware

```javascript
// Require authentication
import { protect } from '../middlewares/auth.middleware.js';
router.use(protect);  // All routes below require auth
```

### 10.2 Role-Based Access

```javascript
import { authorizeRoles } from '../middlewares/authorize.middleware.js';

// Single role
router.post('/', authorizeRoles(['Admin']), controller.create);

// Multiple roles
router.get('/', authorizeRoles(['Admin', 'Warden', 'Super Admin']), controller.getAll);
```

### 10.3 Available Roles

From `src/core/constants/roles.constants.js`:

```javascript
export const ROLES = {
  STUDENT: 'Student',
  WARDEN: 'Warden',
  ASSOCIATE_WARDEN: 'Associate Warden',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
  SECURITY: 'Security',
  MAINTENANCE_STAFF: 'Maintenance Staff',
  HOSTEL_SUPERVISOR: 'Hostel Supervisor',
  HOSTEL_GATE: 'Hostel Gate',
};

export const ROLE_GROUPS = {
  STAFF: ['Warden', 'Associate Warden', 'Admin', 'Super Admin', 'Hostel Supervisor'],
  ADMIN_LEVEL: ['Admin', 'Super Admin'],
  HOSTEL_MANAGEMENT: ['Warden', 'Associate Warden', 'Hostel Supervisor', 'Admin', 'Super Admin'],
};
```

---

## 11. Validation

### 11.1 Common Schemas

From `src/validations/common.validation.js`:

```javascript
import { objectId, email, phone, name, paginationSchema } from '../validations/common.validation.js';

// objectId - MongoDB ID validation
// email - Email format
// phone - 10-digit Indian phone
// name - 2-100 chars
// paginationSchema - { page, limit, sortBy, sortOrder }
```

### 11.2 Validation Middleware

```javascript
import { validate } from '../middlewares/validate.middleware.js';

// Validate body (default)
router.post('/', validate(createSchema), controller.create);

// Validate query
router.get('/', validate(listSchema, 'query'), controller.list);

// Validate params
router.get('/:id', validate(idSchema, 'params'), controller.getById);
```

---

## 12. Quick Reference

### 12.1 Creating a New Feature (Main App)

1. **Create Model**: `src/models/{feature}/{Feature}.js`
2. **Create Service**: `src/services/{feature}.service.js` (extend BaseService)
3. **Create Controller**: `src/controllers/{feature}Controller.js`
4. **Create Validation**: `src/validations/{feature}.validation.js`
5. **Create Routes**: `src/routes/v1/{feature}.routes.js`
6. **Register Route**: Add to `src/loaders/express.loader.js`

### 12.2 Creating a New Module (Sub-App)

1. **Create folder**: `src/apps/{app}/modules/{module}/`
2. **Create files**:
   - `{module}.constants.js`
   - `{module}.validation.js`
   - `{module}.service.js`
   - `{module}.controller.js`
   - `{module}.routes.js`
   - `index.js`
3. **Import in app**: Add to `src/apps/{app}/index.js`

### 12.3 Common Imports Cheatsheet

```javascript
// Error handling
import { asyncHandler, sendRawResponse } from '../utils/controllerHelpers.js';

// Service base
import { BaseService } from '../services/base/BaseService.js';
import { success, created, notFound, badRequest } from '../services/base/ServiceResponse.js';

// Auth & validation
import { protect } from '../middlewares/auth.middleware.js';
import { authorizeRoles } from '../middlewares/authorize.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';

// Common validation
import { objectId, paginationSchema } from '../validations/common.validation.js';

// Errors
import { NotFoundError, BadRequestError } from '../core/errors/index.js';

// Constants
import { ROLES, ROLE_GROUPS } from '../core/constants/index.js';
```

### 12.4 BaseService Methods

```javascript
class MyService extends BaseService {
  constructor() {
    super(Model, 'EntityName');
  }
  
  // Inherited methods:
  // this.findById(id, populate, select)
  // this.findOne(filter, populate, select)
  // this.findAll(filter, options)
  // this.findPaginated(filter, options)
  // this.create(data)
  // this.update(id, data)
  // this.delete(id)
  // this.query()  → Returns QueryBuilder
}
```

---

## File Locations Summary

| What | Where |
|------|-------|
| Entry point | `src/server.js` |
| Express config | `src/loaders/express.loader.js` |
| Environment config | `src/config/env.config.js` |
| Error classes | `src/core/errors/AppError.js` |
| Error handler | `src/core/errors/errorHandler.js` |
| Response helpers | `src/core/responses/ApiResponse.js` |
| ServiceResponse | `src/services/base/ServiceResponse.js` |
| BaseService | `src/services/base/BaseService.js` |
| QueryBuilder | `src/services/base/QueryBuilder.js` |
| Auth middleware | `src/middlewares/auth.middleware.js` |
| Authorize middleware | `src/middlewares/authorize.middleware.js` |
| Validate middleware | `src/middlewares/validate.middleware.js` |
| Async handler | `src/utils/asyncHandler.js` |
| Controller helpers | `src/utils/controllerHelpers.js` |
| Common validations | `src/validations/common.validation.js` |
| Role constants | `src/core/constants/roles.constants.js` |
| Status constants | `src/core/constants/status.constants.js` |
| Sub-apps | `src/apps/{app-name}/index.js` |
