# Backend Issues - To Be Fixed

> **Created**: January 29, 2026
> **Purpose**: Track identified issues and their resolution status

---

## Issue Summary

| # | Issue | Status | Priority |
|---|-------|--------|----------|
| 1 | No error handling middleware | ⚠️ Partial | High |
| 2 | Validation missing | ❌ Not Done | High |
| 3 | Inconsistent response format | ⚠️ Partial | Medium |
| 4 | Fat controllers | ❌ Not Done | Medium |
| 5 | No request validation | ❌ Not Done | High |
| 6 | Flat folder structure | ✅ Done | High |
| 7 | No DTOs/Response formatters | ⚠️ Partial | Low |
| 8 | No centralized constants | ✅ Done | Medium |
| 9 | No API versioning | ✅ Done | High |
| 10 | Mixed naming conventions | ✅ Done | Low |

**Legend**: ✅ Done | ⚠️ Partial | ❌ Not Done

---

## Detailed Status

### 1. No Error Handling Middleware
**Location**: server.js  
**Impact**: Inconsistent error responses  
**Status**: ⚠️ Partial

**What was done**:
- Created `src/utils/asyncHandler.js` for async error wrapping
- Created `src/core/errors/` directory structure

**What's missing**:
- Global error handling middleware in Express
- Centralized error response formatting
- Custom error classes (ValidationError, NotFoundError, etc.)

**To complete**:
```javascript
// Need to add to src/middlewares/error.middleware.js
export const errorHandler = (err, req, res, next) => {
  // Centralized error handling
};
```

---

### 2. Validation Missing
**Location**: Controllers  
**Impact**: No input validation layer  
**Status**: ❌ Not Done

**What was done**:
- Nothing

**What's missing**:
- Validation library (Joi, Zod, or express-validator)
- Validation schemas for each endpoint
- Validation middleware

**To complete**:
- Install validation library: `npm install joi` or `npm install zod`
- Create validation schemas in `src/validations/`
- Add validation middleware to routes

---

### 3. Inconsistent Response Format
**Location**: All controllers  
**Impact**: `{ message }` vs `{ success, message }` vs `{ data }`  
**Status**: ⚠️ Partial

**What was done**:
- Created `src/utils/response.utils.js` with standardized helpers:
  - `sendSuccess(res, data, message, statusCode)`
  - `sendError(res, message, statusCode)`
  - `sendPaginated(res, data, pagination)`

**What's missing**:
- Controllers still use old format
- Need to update all 43 controllers to use new utilities

**To complete**:
- Replace `res.json({ message })` with `sendSuccess(res, null, message)`
- Replace `res.status(500).json({ message })` with `sendError(res, message, 500)`

---

### 4. Fat Controllers
**Location**: e.g., authController.js (438 lines)  
**Impact**: Business logic mixed with HTTP handling  
**Status**: ❌ Not Done

**What was done**:
- Created `src/services/` layer
- Migrated 3 existing services

**What's missing**:
- Business logic still in controllers
- Need to extract logic to service layer

**Fat controllers identified**:
| Controller | Lines | Recommended Split |
|------------|-------|-------------------|
| authController.js | 438 | auth.service.js |
| studentController.js | 500+ | student.service.js |
| complaintController.js | 400+ | complaint.service.js |
| wardenController.js | 300+ | warden.service.js |
| visitorController.js | 300+ | visitor.service.js |

**To complete**:
- Extract database operations to services
- Keep controllers thin (HTTP handling only)

---

### 5. No Request Validation
**Location**: Routes  
**Impact**: Direct access to req.body without validation  
**Status**: ❌ Not Done

**What was done**:
- Nothing

**What's missing**:
- Request body validation
- Query parameter validation
- URL parameter validation

**Example of current code**:
```javascript
// Current - No validation
const { email, password } = req.body;

// Should be
const { error, value } = loginSchema.validate(req.body);
if (error) return sendError(res, error.message, 400);
```

---

### 6. Flat Folder Structure
**Location**: Routes/Controllers/Models  
**Impact**: 40+ files in single folder  
**Status**: ✅ Done

**What was done**:
- Models organized by domain in `src/models/`
  - `user/`, `hostel/`, `student/`, `complaint/`, `visitor/`, etc.
- Routes versioned in `src/routes/v1/`
- Config organized in `src/config/`
- Services in `src/services/`
- Middlewares in `src/middlewares/`
- Loaders in `src/loaders/`
- Controllers migrated to `src/controllers/`

**Result**: 170+ files properly organized in `src/`

---

### 7. No DTOs/Response Formatters
**Location**: Controllers  
**Impact**: Manual object transformation  
**Status**: ⚠️ Partial

**What was done**:
- Created `src/utils/response.utils.js`
- Created `src/core/responses/` directory

**What's missing**:
- DTO classes for request/response
- Consistent data transformation
- Integration with controllers

---

### 8. No Centralized Constants
**Location**: Throughout codebase  
**Impact**: Magic strings everywhere  
**Status**: ✅ Done

**What was done**:
- Created `src/core/constants/index.js` with:
  - `USER_ROLES`
  - `COMPLAINT_STATUS`
  - `LEAVE_STATUS`
  - `VISITOR_STATUS`
  - `HTTP_STATUS`
  - `ERROR_MESSAGES`
  - `SUCCESS_MESSAGES`

**Example**:
```javascript
// Before
if (role === 'admin') { ... }

// After (available)
import { USER_ROLES } from '../core/constants/index.js';
if (role === USER_ROLES.ADMIN) { ... }
```

---

### 9. No API Versioning
**Location**: server.js  
**Impact**: Hard to maintain backward compatibility  
**Status**: ✅ Done

**What was done**:
- Created `src/routes/v1/` directory
- All routes now under versioned structure
- New routes go in `src/routes/v1/*.routes.js`
- API paths unchanged (`/api/*`) for backward compatibility

**Future versioning**:
- Can add `src/routes/v2/` for breaking changes
- Mount at `/api/v2/*`

---

### 10. Mixed Naming Conventions
**Location**: Files  
**Impact**: `wardenRoute.js` vs `authRoutes.js`  
**Status**: ✅ Done

**What was done**:
- New files use consistent naming:
  - Routes: `*.routes.js`
  - Models: `*.model.js`
  - Controllers: `*.controller.js`
  - Middlewares: `*.middleware.js`
  - Services: `*.service.js`
  - Config: `*.config.js`

**Legacy files**: Keep old names for backward compatibility (tracked in `legacy_remain.md`)

---

## Priority Order for Remaining Work

1. **High Priority**:
   - [ ] Add global error handling middleware
   - [ ] Add request validation (Joi/Zod)

2. **Medium Priority**:
   - [ ] Update controllers to use response utilities
   - [ ] Extract business logic to services

3. **Low Priority**:
   - [ ] Add DTOs for complex responses
   - [ ] Replace magic strings with constants

---

## Notes

- API endpoints must NOT change
- Frontend must NOT require any changes
- Use re-exports for backward compatibility
- Test after each change
