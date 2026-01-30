# Phase 2: Backend Enhancement Plan

> **Created**: January 30, 2026
> **Status**: 🔄 In Progress
> **Goal**: Add error handling, validation, and refactor fat controllers

---

## Overview

| Step | Task | Effort | Status |
|------|------|--------|--------|
| 1 | Global Error Handling Middleware | Low | ✅ Complete |
| 2 | Request Validation Layer (Joi) | Medium | ✅ Complete |
| 3 | Refactor Fat Controllers → Services | High | 🔄 In Progress |

---

## Step 1: Global Error Handling Middleware

### 1.1 Objective

Create a centralized error handling system that:
- Catches all errors in one place
- Returns consistent error responses
- Logs errors appropriately
- Handles different error types (validation, auth, not found, etc.)

### 1.2 Files to Create

```
src/
├── middlewares/
│   └── error.middleware.js      # Global error handler
├── core/
│   └── errors/
│       ├── index.js             # Error exports
│       ├── AppError.js          # Base error class
│       ├── ValidationError.js   # Validation errors
│       ├── NotFoundError.js     # 404 errors
│       ├── AuthenticationError.js # 401 errors
│       └── AuthorizationError.js  # 403 errors
```

### 1.3 Implementation Details

#### 1.3.1 Custom Error Classes

```javascript
// AppError - Base class for all custom errors
class AppError extends Error {
  constructor(message, statusCode, errorCode) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true; // Distinguishes from programming errors
  }
}

// Specific error types
class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}
```

#### 1.3.2 Error Middleware Structure

```javascript
// error.middleware.js
export const errorHandler = (err, req, res, next) => {
  // Default values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errorCode = err.errorCode || 'INTERNAL_ERROR';
  
  // Handle specific error types
  if (err.name === 'ValidationError') { /* Mongoose validation */ }
  if (err.name === 'CastError') { /* Invalid MongoDB ID */ }
  if (err.code === 11000) { /* Duplicate key error */ }
  if (err.name === 'JsonWebTokenError') { /* JWT errors */ }
  
  // Log error (only server errors)
  if (statusCode >= 500) {
    console.error('Server Error:', err);
  }
  
  // Send response
  res.status(statusCode).json({
    success: false,
    message,
    errorCode,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
```

### 1.4 Integration Points

1. Add error middleware as LAST middleware in Express
2. Update `asyncHandler` to pass errors to `next()`
3. Controllers can throw custom errors instead of manual res.status()

### 1.5 Response Format (Standardized)

**Success Response:**
```json
{
  "success": true,
  "message": "Operation successful",
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "User not found",
  "errorCode": "NOT_FOUND"
}
```

### 1.6 Testing Checklist

- [ ] AppError base class works
- [ ] ValidationError returns 400
- [ ] NotFoundError returns 404
- [ ] AuthenticationError returns 401
- [ ] AuthorizationError returns 403
- [ ] Mongoose ValidationError handled
- [ ] Mongoose CastError handled
- [ ] Duplicate key error handled
- [ ] JWT errors handled
- [ ] Unknown errors return 500
- [ ] Stack trace only in development

---

## Step 2: Request Validation Layer (Joi)

### 2.1 Objective

Add input validation to all API endpoints using Joi:
- Validate request body, params, query
- Return clear validation error messages
- Prevent invalid data from reaching controllers

### 2.2 Implementation Status: ✅ PARTIAL (Core Complete)

#### ✅ Completed:
- Joi installed (`npm install joi`)
- Core validation middleware created
- 12 validation schema files created with 80+ schemas
- 3 route files integrated with validation (auth, complaint, leave)

#### ⏳ Future Work (Can be done incrementally):
- Integrate validation into remaining 32 route files
- Pattern is established, work is mechanical

### 2.3 Files Created

```
src/validations/
├── index.js                    ✅ Central exports
├── validate.middleware.js      ✅ Core middleware
├── common.validation.js        ✅ objectId, email, phone, pagination
├── auth.validation.js          ✅ 4 schemas
├── student.validation.js       ✅ 13 schemas
├── complaint.validation.js     ✅ 8 schemas
├── visitor.validation.js       ✅ 11 schemas
├── leave.validation.js         ✅ 8 schemas
├── hostel.validation.js        ✅ 6 schemas
├── user.validation.js          ✅ 7 schemas
├── event.validation.js         ✅ 8 schemas
├── notification.validation.js  ✅ 10 schemas
└── payment.validation.js       ✅ 10 schemas
```

### 2.4 Routes with Validation Integrated

| Route File | Status | Schemas Used |
|------------|--------|--------------|
| auth.routes.js | ✅ | loginSchema, googleLoginSchema, updatePasswordSchema, logoutDeviceSchema |
| complaint.routes.js | ✅ | createComplaintSchema, getAllComplaintsSchema, updateComplaintStatusSchema, etc. |
| leave.routes.js | ✅ | createLeaveSchema, getLeavesSchema, approveLeaveSchema, rejectLeaveSchema, joinLeaveSchema |
| Other 32 routes | ⏳ | Schemas ready, integration pending |

### 2.5 Usage Pattern (For Future Integration)

```javascript
// Import validation middleware and schema
import { validate } from '../../validations/validate.middleware.js';
import { createStudentSchema } from '../../validations/student.validation.js';

// Add before controller
router.post('/students', validate(createStudentSchema), studentController.create);
```

### 2.6 Future Integration Priority

| Priority | Route Files | Reason |
|----------|-------------|--------|
| High | student.routes.js, visitor.routes.js | High traffic |
| Medium | hostel.routes.js, user.routes.js, event.routes.js | Moderate usage |
| Low | Others | Can be done as routes are touched |

---

## Step 3: Refactor Fat Controllers → Services

### 3.0 ⚠️ CRITICAL SAFETY RULES

> **LOGIC MUST NOT CHANGE AT ANY COST**
> 
> This refactoring is purely structural. The following must remain identical:
> - All database queries and operations
> - All conditional logic and edge cases
> - All error messages and status codes
> - All response formats and data structures
> - All transaction handling and rollbacks
> - All business rules and validations

### 3.1 Objective

Move business logic from controllers to services:
- Controllers only handle HTTP (req/res)
- Services contain business logic (no req/res knowledge)
- Makes code testable and reusable
- **API endpoints remain 100% unchanged**

### 3.2 Fat Controllers Identified (by line count)

| Controller | Lines | Priority | Complexity | New Service | Status |
|------------|-------|----------|------------|-------------|--------|
| studentController.js | 1238 | 🔴 Critical | Very High | student.service.js | ⬜ |
| hostelController.js | 778 | 🔴 Critical | High | hostel.service.js | ⬜ |
| dashboardController.js | 719 | 🟡 Medium | High | dashboard.service.js | ⬜ |
| visitorController.js | 533 | 🟡 Medium | Medium | visitor.service.js | ⬜ |
| undertakingController.js | 484 | 🟢 Low | Medium | undertaking.service.js | ⬜ |
| studentInventoryController.js | 471 | 🟢 Low | Medium | studentInventory.service.js | ⬜ |
| sheetController.js | 465 | 🟢 Low | Medium | sheet.service.js | ⬜ |
| permissionController.js | 447 | 🟡 Medium | Medium | permission.service.js | ⬜ |
| securityController.js | 442 | 🟡 Medium | Medium | security.service.js | ⬜ |
| authController.js | ~~437~~ 305 | 🔴 Critical | High | auth.service.js | ✅ |
| adminController.js | 433 | 🟡 Medium | Medium | admin.service.js | ⬜ |
| complaintController.js | ~~422~~ 241 | 🟡 Medium | Medium | complaint.service.js | ✅ |

### 3.3 Existing Services (Already Created)

```
src/services/
├── auth.service.js             ✅ NEW - Refactored from authController
├── faceScanner.service.js      ✅ Exists
├── liveCheckInOut.service.js   ✅ Exists
├── notification.service.js     ✅ Exists (class-based)
├── payment.service.js          ✅ Exists
├── scannerAction.service.js    ✅ Exists
├── storage.service.js          ✅ Exists
└── index.js                    ✅ Updated
```

### 3.3.1 Refactoring Progress

| Controller | Original Lines | New Lines | Service Created | Status |
|------------|---------------|-----------|-----------------|--------|
| authController.js | 437 | 305 | auth.service.js (310 lines) | ✅ Complete |
| complaintController.js | 422 | 241 | complaint.service.js (380 lines) | ✅ Complete |
| studentController.js | 1238 | - | - | ⬜ Not Started |
| hostelController.js | 778 | - | - | ⬜ Not Started |
| visitorController.js | 533 | - | - | ⬜ Not Started |

### 3.4 Safe Refactoring Strategy

#### Phase A: Start with Simple Controllers (Low Risk)
1. Pick a controller with simple, independent functions
2. Extract ONE function at a time
3. Test immediately after each extraction
4. Move to next function only when previous works

#### Phase B: Tackle Complex Controllers (High Risk)
1. Map all functions and their dependencies
2. Identify shared code and utilities
3. Extract in order of dependency (least dependent first)
4. Extensive testing after each change

### 3.5 Refactoring Pattern (SAFE APPROACH)

#### Step 1: Create Service File (Copy Logic Exactly)

```javascript
// src/services/auth.service.js
import User from '../../models/User.js';
import bcrypt from 'bcrypt';

/**
 * Auth Service
 * Contains business logic extracted from authController
 * 
 * IMPORTANT: All logic copied exactly from controller
 * Only HTTP-specific code (req, res) removed
 */
class AuthService {
  /**
   * Authenticate user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<{user: Object, isValid: boolean, error?: string}>}
   */
  async login(email, password) {
    // EXACT SAME LOGIC AS CONTROLLER
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return { user: null, isValid: false, error: 'User not found' };
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return { user: null, isValid: false, error: 'Invalid credentials' };
    }
    
    return { user, isValid: true };
  }
}

export const authService = new AuthService();
```

#### Step 2: Update Controller (Minimal Changes)

```javascript
// src/controllers/authController.js
import { authService } from '../services/auth.service.js';

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Delegate to service
    const { user, isValid, error } = await authService.login(email, password);
    
    if (!isValid) {
      // SAME STATUS CODES AND MESSAGES AS BEFORE
      return res.status(401).json({ 
        success: false, 
        message: error 
      });
    }
    
    // Session handling stays in controller (HTTP-specific)
    req.session.userId = user._id;
    
    res.json({ 
      success: true, 
      message: 'Login successful', 
      data: { user } 
    });
  } catch (error) {
    // SAME ERROR HANDLING AS BEFORE
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};
```

### 3.6 Controller Analysis Template

Before refactoring any controller, document:

```markdown
### [Controller Name] Analysis

**File**: src/controllers/xxxController.js
**Lines**: XXX
**Functions**: 

| Function | Lines | DB Operations | Session/HTTP | Dependencies | Extractable |
|----------|-------|---------------|--------------|--------------|-------------|
| func1 | 50 | User.find() | req.session | - | ✅ Partial |
| func2 | 30 | None | res.json() | func1 | ❌ Keep |

**Shared Code**:
- Utility X used in 3 functions
- Model Y used in 5 functions

**Risks**:
- Transaction handling in func3
- Socket.io in func4
```

### 3.7 Recommended Extraction Order

#### Round 1: Simple Extractions (Low Risk)
| Controller | Functions to Extract | Est. Time |
|------------|---------------------|-----------|
| authController.js | login, validateCredentials | 30 min |
| complaintController.js | getStats, getComplaintById | 30 min |

#### Round 2: Medium Complexity
| Controller | Functions to Extract | Est. Time |
|------------|---------------------|-----------|
| visitorController.js | createVisitor, getVisitors | 1 hour |
| adminController.js | getStats, getDashboard | 1 hour |

#### Round 3: High Complexity (Careful!)
| Controller | Functions to Extract | Est. Time |
|------------|---------------------|-----------|
| studentController.js | createStudentsProfiles (with transactions) | 2 hours |
| hostelController.js | allocateRoom (with dependencies) | 2 hours |

### 3.8 What Stays in Controllers

- `req` and `res` handling
- Session management (`req.session`)
- Cookie handling
- File uploads (`req.file`, `req.files`)
- Response formatting
- Status code decisions
- Redirect logic

### 3.9 What Moves to Services

- Database queries and operations
- Business logic calculations
- Data transformations
- Validation logic (beyond Joi)
- External API calls
- Complex conditionals

### 3.10 Testing Checklist (Per Function)

Before marking extraction complete:

- [ ] API endpoint returns same response format
- [ ] Same status codes for all scenarios
- [ ] Error messages unchanged
- [ ] Transaction rollback works
- [ ] Session/auth still works
- [ ] No new errors in console
- [ ] Existing tests pass (if any)

### 3.11 Rollback Plan

If anything breaks:
1. Revert service file changes
2. Restore controller to original
3. Document what went wrong
4. Try again with smaller extraction

---

## Timeline Estimate

| Step | Estimated Time | Complexity |
|------|---------------|------------|
| Step 1: Error Middleware | 1-2 hours | Low |
| Step 2: Validation Layer | 4-6 hours | Medium |
| Step 3: Refactor Controllers | 8-12 hours | High |

---

## Success Criteria

### Step 1 Complete When:
- [ ] All custom error classes created
- [ ] Error middleware catches all errors
- [ ] Consistent JSON error responses
- [ ] Server starts without issues

### Step 2 Complete When:
- [ ] Joi installed and configured
- [ ] Validation middleware works
- [ ] At least auth routes validated
- [ ] Clear error messages returned

### Step 3 Complete When:
- [ ] authController.js refactored
- [ ] studentController.js refactored
- [ ] complaintController.js refactored
- [ ] All endpoints still work
- [ ] Code is cleaner and testable

---

## Notes

- API endpoints must NOT change
- Response format should be consistent going forward
- Each step builds on the previous
- Test after each change
