# Modular Architecture Plan - Student Management System

> **Created**: January 31, 2026  
> **Updated**: January 31, 2026  
> **Status**: IMPLEMENTED (Phase 1)

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Current Structure](#2-current-structure)
3. [Sub-Application Pattern](#3-sub-application-pattern)
4. [Student Affairs App](#4-student-affairs-app)
5. [How to Add New Apps](#5-how-to-add-new-apps)
6. [Future Migration Plan (Hostel App)](#6-future-migration-plan-hostel-app)
7. [Coding Standards](#7-coding-standards)

---

## 1. Architecture Overview

### Design Decision

We use a **Modular Monolith** architecture where:

- **Existing code** remains in `src/` (controllers, services, models, routes, etc.)
- **New apps** are added in `src/apps/{app-name}/`
- **Shared utilities** are in `src/` and used by all apps via relative imports
- No separate `shared/` folder - everything shared lives in existing `src/` folders

### Benefits

| Benefit | Description |
|---------|-------------|
| **No Breaking Changes** | Existing hostel app code stays untouched |
| **Easy New Apps** | Add new feature apps without affecting existing code |
| **Shared Resources** | New apps use existing models, middlewares, services, utils |
| **Clear Boundaries** | Each app is self-contained in its folder |
| **Simple Imports** | Standard relative imports, no complex aliasing |

---

## 2. Current Structure

```
backend/src/
│
├── apps/                               # 🆕 SUB-APPLICATIONS
│   └── student-affairs/                # Student Affairs app
│       ├── index.js                    # App router (mounted in express.loader.js)
│       ├── constants/index.js          # App-wide constants
│       ├── README.md                   # App documentation
│       └── modules/                    # Feature modules
│           ├── grievance/              # ✅ Complete template module
│           │   ├── grievance.constants.js
│           │   ├── grievance.validation.js
│           │   ├── grievance.service.js
│           │   ├── grievance.controller.js
│           │   ├── grievance.routes.js
│           │   └── index.js
│           ├── scholarship/            # 📁 Empty - ready to build
│           ├── counseling/             # 📁 Empty - ready to build
│           ├── disciplinary/           # 📁 Empty - ready to build
│           ├── clubs/                  # 📁 Empty - ready to build
│           └── elections/              # 📁 Empty - ready to build
│
├── config/                             # ⚙️ Configuration
├── controllers/                        # 🎮 HTTP handlers (hostel app)
├── core/                               # 🎯 Errors, constants, responses
├── loaders/                            # 🚀 Express, DB, Socket setup
├── middlewares/                        # 🔒 Auth, validate, authorize
├── models/                             # 📊 All Mongoose models
├── routes/v1/                          # 🛣️ Route definitions (hostel app)
├── services/                           # ⚙️ Business logic + base/
├── utils/                              # 🛠️ Helper functions
├── validations/                        # ✅ Joi schemas
│
├── app.js                              # App factory
└── server.js                           # Entry point
```

---

## 3. Sub-Application Pattern

### 3.1 App Structure

Each sub-app in `src/apps/` follows this structure:

```
apps/{app-name}/
├── index.js                    # Express router (main entry point)
├── constants/
│   └── index.js                # App-wide constants
├── README.md                   # App documentation
└── modules/
    └── {module}/               # Each feature module
        ├── {module}.constants.js
        ├── {module}.validation.js
        ├── {module}.service.js
        ├── {module}.controller.js
        ├── {module}.routes.js
        └── index.js
```

### 3.2 App Entry Point

```javascript
// src/apps/student-affairs/index.js

import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import grievanceRoutes from './modules/grievance/grievance.routes.js';

const router = express.Router();

// Health check (no auth required)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    app: 'student-affairs',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

// All routes below require authentication
router.use(protect);

// Mount module routes
router.use('/grievances', grievanceRoutes);
// router.use('/scholarships', scholarshipRoutes);
// router.use('/counseling', counselingRoutes);

export default router;
```

### 3.3 Mounting in Express

In `src/loaders/express.loader.js`:

```javascript
// Import sub-application
import studentAffairsApp from '../apps/student-affairs/index.js';

// Mount in route section
app.use('/api/student-affairs', studentAffairsApp);
```

**API URLs become:**
- `GET /api/student-affairs/health`
- `GET /api/student-affairs/grievances`
- `POST /api/student-affairs/grievances`
- `GET /api/student-affairs/grievances/:id`

---

## 4. Student Affairs App

### 4.1 Modules

| Module | Description | Status |
|--------|-------------|--------|
| `grievance` | Student grievance/complaint system | ✅ Template complete |
| `scholarship` | Scholarship applications & tracking | 📁 Directory created |
| `counseling` | Counseling appointments & records | 📁 Directory created |
| `disciplinary` | Disciplinary actions & appeals | 📁 Directory created |
| `clubs` | Student clubs & organizations | 📁 Directory created |
| `elections` | Student body elections | 📁 Directory created |

### 4.2 Grievance Module (Template)

The grievance module serves as a **complete template** showing all patterns:

**`grievance.constants.js`** - Module constants
```javascript
export const GRIEVANCE_STATUS = {
  PENDING: 'pending',
  UNDER_REVIEW: 'under_review',
  IN_PROGRESS: 'in_progress',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
  REJECTED: 'rejected',
};
```

**`grievance.validation.js`** - Joi schemas
```javascript
import Joi from 'joi';
import { objectId, paginationSchema } from '../../../../validations/common.validation.js';

export const createGrievanceSchema = Joi.object({
  title: Joi.string().trim().min(5).max(200).required(),
  description: Joi.string().trim().min(10).max(5000).required(),
  category: Joi.string().valid(...Object.values(GRIEVANCE_CATEGORY)).required(),
});
```

**`grievance.service.js`** - Business logic
```javascript
import { BaseService } from '../../../../services/base/BaseService.js';
import { success, notFound, badRequest } from '../../../../services/base/ServiceResponse.js';

class GrievanceService extends BaseService {
  constructor() {
    super(null, 'Grievance');  // Model will be added when created
  }

  async createGrievance(data, user) {
    // Business logic here
  }
}

export const grievanceService = new GrievanceService();
```

**`grievance.controller.js`** - HTTP handlers
```javascript
import { asyncHandler, sendRawResponse } from '../../../../utils/controllerHelpers.js';
import { grievanceService } from './grievance.service.js';

export const createGrievance = asyncHandler(async (req, res) => {
  const result = await grievanceService.createGrievance(req.body, req.user);
  sendRawResponse(res, result);
});
```

**`grievance.routes.js`** - Route definitions
```javascript
import express from 'express';
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import * as controller from './grievance.controller.js';

const router = express.Router();

router.get('/stats', authorizeRoles(['Admin']), controller.getStatistics);
router.route('/')
  .get(controller.getGrievances)
  .post(controller.createGrievance);

export default router;
```

> **Note**: Validation middleware has been removed for simplicity. Schemas exist in `src/validations/` for future use.

### 4.3 Import Paths (from module files)

From `src/apps/student-affairs/modules/grievance/`:

```javascript
// Utils
import { asyncHandler, sendRawResponse } from '../../../../utils/controllerHelpers.js';

// Services base
import { BaseService } from '../../../../services/base/BaseService.js';
import { success, notFound } from '../../../../services/base/ServiceResponse.js';

// Middlewares
import { authorizeRoles } from '../../../../middlewares/authorize.middleware.js';
import { validate } from '../../../../middlewares/validate.middleware.js';

// Validations
import { objectId, paginationSchema } from '../../../../validations/common.validation.js';

// Models (when needed)
import User from '../../../../models/user/User.js';

// Local constants
import { GRIEVANCE_STATUS } from './grievance.constants.js';

// App constants
import { SA_ROLE_GROUPS } from '../../constants/index.js';
```

---

## 5. How to Add New Apps

### Step 1: Create App Directory

```bash
mkdir -p src/apps/{app-name}/modules
mkdir -p src/apps/{app-name}/constants
```

### Step 2: Create App Router

```javascript
// src/apps/{app-name}/index.js

import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();

// Health check
router.get('/health', (req, res) => {
  res.json({ app: '{app-name}', status: 'ok' });
});

// Auth required for all routes
router.use(protect);

// Mount modules here
// router.use('/feature', featureRoutes);

export default router;
```

### Step 3: Create Constants

```javascript
// src/apps/{app-name}/constants/index.js

export const APP_ROLES = {
  // App-specific roles
};

export const APP_ROLE_GROUPS = {
  // Role groupings
};
```

### Step 4: Mount in Express Loader

```javascript
// src/loaders/express.loader.js

// Add import
import newApp from '../apps/{app-name}/index.js';

// Add route mount (in route section)
app.use('/api/{app-name}', newApp);
```

### Step 5: Create Modules

Copy the grievance module structure for each feature module.

---

## 6. Hostel App Migration (✅ COMPLETED)

The hostel management system has been successfully migrated to `apps/hostel/`.

### What Was Migrated

| Source | Destination | Files |
|--------|-------------|-------|
| `src/controllers/` | `src/apps/hostel/controllers/` | 43 controllers |
| `src/services/*.service.js` | `src/apps/hostel/services/` | 43 services |
| `src/routes/v1/` | `src/apps/hostel/routes/` | 35 route files |

### What Stays in `src/` (Shared)

- `models/` - Database models shared by all apps
- `middlewares/` - Auth, validation, error handling
- `services/base/` - BaseService infrastructure
- `utils/` - Helper functions
- `core/` - Errors, constants, responses
- `config/` - App configuration
- `loaders/` - Express, DB setup
- `validations/` - Joi schemas (shared validators)

### Hostel App Structure

```
src/apps/hostel/
├── index.js           # App router - mounts all routes
├── controllers/       # All 43 hostel controllers
├── services/          # All 43 hostel services
└── routes/            # All 35 route modules
```

### Import Path Changes Applied

| Location | Import | Path |
|----------|--------|------|
| `apps/hostel/controllers/` | Shared utils | `../../../utils/` |
| `apps/hostel/controllers/` | Models | `../../../models/` |
| `apps/hostel/controllers/` | Services | `../services/` |
| `apps/hostel/services/` | Base service | `../../../services/base/` |
| `apps/hostel/services/` | Models | `../../../models/` |
| `apps/hostel/routes/` | Controllers | `../controllers/` |
| `apps/hostel/routes/` | Middlewares | `../../../middlewares/` |

---

## 7. Coding Standards

### 7.1 File Naming

| Type | Convention | Example |
|------|------------|---------|
| App entry | `index.js` | `apps/student-affairs/index.js` |
| Constants | `{name}.constants.js` | `grievance.constants.js` |
| Validation | `{name}.validation.js` | `grievance.validation.js` |
| Service | `{name}.service.js` | `grievance.service.js` |
| Controller | `{name}.controller.js` | `grievance.controller.js` |
| Routes | `{name}.routes.js` | `grievance.routes.js` |

### 7.2 Module Index Export

```javascript
// modules/{module}/index.js

export { default as grievanceRoutes } from './grievance.routes.js';
export * from './grievance.controller.js';
export { grievanceService } from './grievance.service.js';
export * from './grievance.validation.js';
export * from './grievance.constants.js';
```

### 7.3 JSDoc Comments

```javascript
/**
 * @desc    Create new grievance
 * @route   POST /api/student-affairs/grievances
 * @access  Private (Student)
 */
export const createGrievance = asyncHandler(async (req, res) => {
  // ...
});
```

### 7.4 Constants Naming

```javascript
// SCREAMING_SNAKE_CASE for constants
export const GRIEVANCE_STATUS = { ... };
export const GRIEVANCE_PRIORITY = { ... };
export const MAX_ATTACHMENTS = 5;
```

---

## Appendix: Quick Reference

### Sub-App Endpoints

| App | Base URL | Example Endpoint |
|-----|----------|------------------|
| Hostel (existing) | `/api/*` | `/api/student`, `/api/complaint` |
| Student Affairs | `/api/student-affairs/*` | `/api/student-affairs/grievances` |
| Future: Academics | `/api/academics/*` | `/api/academics/courses` |
| Future: Library | `/api/library/*` | `/api/library/books` |

### Key Files

| Purpose | Location |
|---------|----------|
| Mount sub-apps | `src/loaders/express.loader.js` |
| BaseService | `src/services/base/BaseService.js` |
| ServiceResponse | `src/services/base/ServiceResponse.js` |
| Common validations | `src/validations/common.validation.js` |
| Auth middleware | `src/middlewares/auth.middleware.js` |
| Authorize middleware | `src/middlewares/authorize.middleware.js` |
| Controller helpers | `src/utils/controllerHelpers.js` |
| Error classes | `src/core/errors/AppError.js` |

### See Also

- [STRUCTURE_GUIDE.md](./STRUCTURE_GUIDE.md) - Complete structure reference for AI agents
- [src/apps/student-affairs/README.md](./src/apps/student-affairs/README.md) - Student Affairs app docs
