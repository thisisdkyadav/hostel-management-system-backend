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
| 3 | Refactor Fat Controllers → Services | High | ⬜ Not Started |

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

### 2.2 Files to Create

```
src/
├── validations/
│   ├── index.js                 # Validation exports
│   ├── validate.middleware.js   # Validation middleware
│   ├── auth.validation.js       # Auth schemas
│   ├── student.validation.js    # Student schemas
│   ├── complaint.validation.js  # Complaint schemas
│   ├── visitor.validation.js    # Visitor schemas
│   ├── hostel.validation.js     # Hostel schemas
│   ├── leave.validation.js      # Leave schemas
│   ├── event.validation.js      # Event schemas
│   ├── user.validation.js       # User schemas
│   └── common.validation.js     # Common schemas (pagination, etc.)
```

### 2.3 Implementation Details

#### 2.3.1 Install Joi

```bash
npm install joi
```

#### 2.3.2 Validation Middleware

```javascript
// validate.middleware.js
import Joi from 'joi';
import { ValidationError } from '../core/errors/index.js';

export const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(
      {
        body: req.body,
        params: req.params,
        query: req.query,
      },
      { abortEarly: false, stripUnknown: true }
    );
    
    if (error) {
      const details = error.details.map(d => ({
        field: d.path.join('.'),
        message: d.message,
      }));
      throw new ValidationError('Validation failed', details);
    }
    
    // Replace with validated values
    req.body = value.body;
    req.params = value.params;
    req.query = value.query;
    
    next();
  };
};
```

#### 2.3.3 Example Validation Schemas

```javascript
// auth.validation.js
import Joi from 'joi';

export const loginSchema = Joi.object({
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
  }),
});

export const registerSchema = Joi.object({
  body: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('student', 'warden', 'admin', 'security'),
  }),
});
```

#### 2.3.4 Common Schemas

```javascript
// common.validation.js
import Joi from 'joi';

// MongoDB ObjectId validation
export const objectId = Joi.string().regex(/^[0-9a-fA-F]{24}$/);

// Pagination
export const paginationSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

// ID parameter
export const idParamSchema = {
  params: Joi.object({
    id: objectId.required(),
  }),
};
```

### 2.4 Route Integration

```javascript
// Before
router.post('/login', authController.login);

// After
import { validate } from '../validations/validate.middleware.js';
import { loginSchema } from '../validations/auth.validation.js';

router.post('/login', validate(loginSchema), authController.login);
```

### 2.5 Validation Schemas Needed

| Module | Schemas Needed |
|--------|----------------|
| Auth | login, register, changePassword, forgotPassword |
| Student | create, update, search, bulkCreate |
| Complaint | create, update, updateStatus, addComment |
| Visitor | register, checkout, search |
| Leave | apply, approve, reject, search |
| Hostel | create, update, allocateRoom |
| Event | create, update, register |
| User | create, update, updateRole |
| Common | pagination, idParam, dateRange |

### 2.6 Testing Checklist

- [ ] Joi installed
- [ ] validate middleware works
- [ ] Missing required field returns 400
- [ ] Invalid email format returns 400
- [ ] Invalid ObjectId returns 400
- [ ] Extra fields stripped from request
- [ ] Validated values replace original
- [ ] Error details array populated
- [ ] All major routes have validation

---

## Step 3: Refactor Fat Controllers → Services

### 3.1 Objective

Move business logic from controllers to services:
- Controllers only handle HTTP (req/res)
- Services contain business logic
- Makes code testable and reusable

### 3.2 Fat Controllers Identified

| Controller | Lines | Priority | New Service |
|------------|-------|----------|-------------|
| authController.js | 438 | High | auth.service.js |
| studentController.js | 500+ | High | student.service.js |
| complaintController.js | 400+ | High | complaint.service.js |
| wardenController.js | 350+ | Medium | warden.service.js |
| visitorController.js | 300+ | Medium | visitor.service.js |
| adminController.js | 300+ | Medium | admin.service.js |
| hostelController.js | 250+ | Medium | hostel.service.js |
| leaveController.js | 250+ | Low | leave.service.js |

### 3.3 Refactoring Pattern

#### Before (Fat Controller)
```javascript
// authController.js
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Business logic mixed with HTTP handling
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    
    // Create session, generate token, etc.
    req.session.userId = user._id;
    
    res.json({ message: 'Login successful', user });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
```

#### After (Thin Controller + Service)
```javascript
// auth.service.js
export class AuthService {
  async login(email, password) {
    const user = await User.findOne({ email });
    if (!user) {
      throw new NotFoundError('User');
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new AuthenticationError('Invalid credentials');
    }
    
    return user;
  }
}

// authController.js
import { AuthService } from '../services/auth.service.js';

const authService = new AuthService();

export const login = async (req, res, next) => {
  const { email, password } = req.body;
  
  const user = await authService.login(email, password);
  req.session.userId = user._id;
  
  res.json({ 
    success: true, 
    message: 'Login successful', 
    data: { user } 
  });
};
```

### 3.4 Files to Create/Modify

```
src/
├── services/
│   ├── index.js                 # Service exports
│   ├── auth.service.js          # NEW
│   ├── student.service.js       # NEW
│   ├── complaint.service.js     # NEW
│   ├── warden.service.js        # NEW
│   ├── visitor.service.js       # NEW
│   ├── admin.service.js         # NEW
│   ├── hostel.service.js        # NEW
│   ├── leave.service.js         # NEW
│   └── ... (existing services)
├── controllers/
│   └── ... (slim down existing)
```

### 3.5 Refactoring Steps per Controller

1. **Analyze** - List all functions and their responsibilities
2. **Extract** - Move database operations to service
3. **Errors** - Replace res.status() with throw new Error
4. **Test** - Verify endpoint still works
5. **Repeat** - Do for each function

### 3.6 authController.js Breakdown

| Function | Lines | Extract To |
|----------|-------|------------|
| login | 50 | authService.login() |
| logout | 15 | Keep in controller |
| register | 80 | authService.register() |
| changePassword | 40 | authService.changePassword() |
| forgotPassword | 30 | authService.forgotPassword() |
| resetPassword | 35 | authService.resetPassword() |
| verifyEmail | 25 | authService.verifyEmail() |
| getMe | 20 | authService.getUserById() |
| updateProfile | 35 | authService.updateProfile() |
| generateQR | 40 | authService.generateQR() |
| verifyQR | 30 | authService.verifyQR() |

### 3.7 Testing Checklist per Controller

- [ ] All endpoints return same response
- [ ] Error codes unchanged
- [ ] Session handling works
- [ ] Authentication preserved
- [ ] Service methods unit testable

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
