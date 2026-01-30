# Backend Issues - To Be Fixed

> **Created**: January 29, 2026
> **Updated**: January 30, 2026
> **Purpose**: Track identified issues and their resolution status

---

## Issue Summary

| # | Issue | Status | Priority |
|---|-------|--------|----------|
| 1 | No error handling middleware | ✅ Done | High |
| 2 | Validation missing | ⚠️ Partial | High |
| 3 | Inconsistent response format | ⚠️ Partial | Medium |
| 4 | Fat controllers | ✅ Done | Medium |
| 5 | No request validation | ⚠️ Partial | High |
| 6 | Flat folder structure | ✅ Done | High |
| 7 | No DTOs/Response formatters | ⚠️ Partial | Low |
| 8 | No centralized constants | ✅ Done | Medium |
| 9 | No API versioning | ✅ Done | High |
| 10 | Mixed naming conventions | ✅ Done | Low |

**Legend**: ✅ Done | ⚠️ Partial | ❌ Not Done

**Progress**: 6/10 Done, 4/10 Partial, 0/10 Not Done

---

## Detailed Status

### 1. No Error Handling Middleware
**Location**: server.js  
**Impact**: Inconsistent error responses  
**Status**: ✅ Done

**What was done**:
- Created `src/utils/asyncHandler.js` for async error wrapping
- Created `src/core/errors/AppError.js` with custom error classes:
  - `AppError` (base class)
  - `BadRequestError` (400)
  - `UnauthorizedError` (401)
  - `ForbiddenError` (403)
  - `NotFoundError` (404)
  - `ConflictError` (409)
  - `ValidationError` (422)
  - `TooManyRequestsError` (429)
  - `InternalError` (500)
- Created `src/core/errors/errorHandler.js` with:
  - Global error handler middleware
  - Mongoose error handling (CastError, ValidationError, 11000)
  - JWT error handling
  - 404 not found handler
- Integrated into `src/loaders/express.loader.js`

---

### 2. Validation Missing
**Location**: Controllers  
**Impact**: No input validation layer  
**Status**: ⚠️ Partial

**What was done**:
- ✅ Installed Joi validation library
- ✅ Created validation middleware (`src/validations/validate.middleware.js`)
- ✅ Created 12 validation schema files with 80+ schemas:
  - `common.validation.js` - objectId, email, phone, pagination
  - `auth.validation.js` - 4 schemas
  - `student.validation.js` - 13 schemas
  - `complaint.validation.js` - 8 schemas
  - `visitor.validation.js` - 11 schemas
  - `leave.validation.js` - 8 schemas
  - `hostel.validation.js` - 6 schemas
  - `user.validation.js` - 7 schemas
  - `event.validation.js` - 8 schemas
  - `notification.validation.js` - 10 schemas
  - `payment.validation.js` - 10 schemas

**What's missing**:
- Integrate validation into remaining routes (3/35 done)

**To complete**:
- Add `validate(schema)` middleware to remaining 32 route files
- Pattern established, work is mechanical

---

### 3. Inconsistent Response Format
**Location**: All controllers  
**Impact**: `{ message }` vs `{ success, message }` vs `{ data }`  
**Status**: ⚠️ Partial

**What was done**:
- Created `src/core/responses/ApiResponse.js` with standardized helpers

**What's missing**:
- Controllers still use old format
- Need to update all controllers to use new utilities

**To complete**:
- Replace `res.json({ message })` with `sendSuccess(res, null, message)`
- Replace `res.status(500).json({ message })` with `sendError(res, message, 500)`

---

### 4. Fat Controllers
**Location**: e.g., authController.js (438 lines)  
**Impact**: Business logic mixed with HTTP handling  
**Status**: ✅ Done

**What was done**:
- ✅ Created 43 service files in `src/services/`
- ✅ Refactored ALL controllers to thin pattern (HTTP handling only)
- ✅ Moved all business logic to services
- ✅ Services use standardized return format: `{success, statusCode, data?, message?}`

**Fat controllers refactored**:
| Controller | Before | After | Service |
|------------|--------|-------|---------|
| authController.js | 437 | ~305 | auth.service.js |
| studentController.js | 1238 | ~345 | student.service.js |
| hostelController.js | 778 | ~250 | hostel.service.js |
| dashboardController.js | 719 | ~160 | dashboard.service.js |
| visitorController.js | 533 | ~250 | visitor.service.js |
| complaintController.js | 422 | ~241 | complaint.service.js |
| + 25 more controllers | - | - | - |

**Result**: ~4000+ lines of business logic moved to service layer

---

### 5. No Request Validation
**Location**: Routes  
**Impact**: Direct access to req.body without validation  
**Status**: ⚠️ Partial

**What was done**:
- ✅ Validation middleware created
- ✅ 80+ validation schemas ready
- ✅ Integrated into 3 route files:
  - `auth.routes.js`
  - `complaint.routes.js`
  - `leave.routes.js`

**What's missing**:
- Request validation on remaining 32 route files

**Example usage**:
```javascript
import { validate } from '../../validations/validate.middleware.js';
import { createStudentSchema } from '../../validations/student.validation.js';

router.post('/students', validate(createStudentSchema), studentController.create);
```

---

### 6. Flat Folder Structure
**Location**: Routes/Controllers/Models  
**Impact**: 40+ files in single folder  
**Status**: ✅ Done

**What was done**:
- Models organized by domain in `src/models/` (17 domain folders)
  - `user/`, `hostel/`, `student/`, `complaint/`, `visitor/`, etc.
- Routes versioned in `src/routes/v1/` (35 route files)
- Config organized in `src/config/`
- Services in `src/services/` (43 service files)
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
- Created `src/core/responses/ApiResponse.js`
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
