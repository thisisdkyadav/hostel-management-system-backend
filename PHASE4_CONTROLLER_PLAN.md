# Phase 4: Controller Layer Cleanup

> **Created**: January 31, 2026
> **Status**: READY TO START
> **Constraint**: NO FRONTEND BREAKING CHANGES

---

## Objective

Reduce controller boilerplate using helpers while **preserving all existing response formats**.

---

## Current State Analysis

| Metric | Count |
|--------|-------|
| Total controllers | 43 |
| Try-catch blocks | 209 |
| 500 error handlers | 208 |
| console.error calls | 177 |
| result.success checks | 195 |
| **Estimated duplicate lines** | ~1,500 |

---

## Helpers Created

Located in: `src/utils/controllerHelpers.js`

### 1. `asyncHandler(fn)`
Wraps async functions to catch errors automatically.

```javascript
import { asyncHandler } from '../utils/controllerHelpers.js';

// Before (with try-catch)
export const getUsers = async (req, res) => {
  try {
    const result = await userService.getUsers();
    res.json(result.data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error' });
  }
};

// After (clean)
export const getUsers = asyncHandler(async (req, res) => {
  const result = await userService.getUsers();
  res.json(result.data);
});
```

### 2. `sendRawResponse(res, result)`
Sends service result.data directly (most common pattern).

```javascript
// Before
if (!result.success) {
  return res.status(result.statusCode).json({ message: result.message });
}
res.status(result.statusCode).json(result.data);

// After
sendRawResponse(res, result);
```

### 3. `createServiceHandler(serviceCall, options)`
Creates a complete handler for simple endpoints.

```javascript
// Before (15+ lines)
export const getLeaves = async (req, res) => {
  try {
    const result = await leaveService.getMyLeaves(req.user._id);
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ message: 'Error' });
  }
};

// After (3 lines)
export const getLeaves = createServiceHandler(
  (req) => leaveService.getMyLeaves(req.user._id),
  { raw: true }
);
```

### 4. `createCustomHandler(serviceCall, transformer)`
For endpoints that need custom response transformation.

```javascript
// When frontend expects specific format
export const getComplaints = createCustomHandler(
  (req) => complaintService.getAll(req.query, req.user),
  (result) => ({
    data: result.data.complaints || [],
    meta: {
      total: result.data.total,
      currentPage: result.data.page,
      totalPages: result.data.totalPages,
    },
    message: 'Complaints fetched successfully',
    status: 'success',
  })
);
```

---

## Response Format Categories

Before refactoring, identify which format each endpoint uses:

### Format A: Raw Data Response (SAFE TO REFACTOR)
```javascript
// Service returns: { success, statusCode, data: { users: [...] } }
// Controller sends: result.data directly
res.status(result.statusCode).json(result.data);
```
**Use**: `createServiceHandler(fn, { raw: true })` or `sendRawResponse()`

### Format B: Wrapped Response (SAFE TO REFACTOR)
```javascript
// Service returns: { success, statusCode, data, message }
// Controller wraps it
res.status(result.statusCode).json({
  success: true,
  data: result.data,
  message: result.message,
});
```
**Use**: `createServiceHandler(fn)` or `sendServiceResponse()`

### Format C: Custom Response (NEEDS CUSTOM TRANSFORMER)
```javascript
// Controller builds custom response
res.status(200).json({
  data: result.complaints,
  meta: { total: result.total, page: result.page },
  status: 'success',
});
```
**Use**: `createCustomHandler(fn, transformer)`

### Format D: Complex Logic (KEEP AS-IS FOR NOW)
```javascript
// Multiple service calls, conditional responses
const result1 = await service1.method();
if (result1.someCondition) {
  const result2 = await service2.method();
  // ...complex logic
}
```
**Action**: Just wrap with `asyncHandler()` to remove try-catch

---

## Implementation Strategy

### Step 1: Quick Wins (Low Risk)
Apply `asyncHandler()` wrapper to ALL controllers:
- Removes try-catch blocks
- Removes console.error (errors go to global handler)
- Removes manual 500 responses
- **NO response format changes**

```javascript
// Just wrap existing function
export const complexEndpoint = asyncHandler(async (req, res) => {
  // Keep ALL existing logic unchanged
  // Just remove try-catch wrapper
});
```

### Step 2: Simple Endpoints (Medium Risk)
Refactor endpoints that use Format A or B:
- Use `createServiceHandler()` for single-service-call endpoints
- Use `sendRawResponse()` or `sendServiceResponse()` for multi-step

### Step 3: Custom Endpoints (Higher Risk)
Refactor endpoints with custom response formats:
- Use `createCustomHandler()` with exact transformer
- **Test each endpoint after refactoring**

---

## Controller Refactoring Checklist

### Priority 1: Apply asyncHandler Only (SAFE)
These controllers can have try-catch removed immediately:

| Controller | Methods | Effort |
|------------|---------|--------|
| taskController.js | 7 | 5 min |
| feedbackController.js | 4 | 3 min |
| lostAndFoundController.js | 6 | 5 min |
| certificateController.js | 5 | 3 min |
| inventoryItemTypeController.js | 4 | 3 min |
| configController.js | 4 | 3 min |

### Priority 2: Simple CRUD (MEDIUM)
Use createServiceHandler after verifying response format:

| Controller | Pattern | Notes |
|------------|---------|-------|
| leaveController.js | Format A | Most use raw response |
| eventController.js | Format A | Standard CRUD |
| notificationController.js | Format A | Standard CRUD |

### Priority 3: Complex/Custom (LATER)
Need careful transformer functions:

| Controller | Issue |
|------------|-------|
| complaintController.js | Uses custom meta format |
| studentController.js | Mixed formats, complex logic |
| dashboardController.js | Multiple service calls |

---

## Example Refactoring: leaveController.js

### Before (Current State)
```javascript
export const getMyLeaves = async (req, res) => {
  try {
    const result = await leaveService.getMyLeaves(req.user._id);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Get my leaves error:', error);
    res.status(500).json({ message: 'Failed to get leaves' });
  }
};

export const createLeave = async (req, res) => {
  try {
    const result = await leaveService.createLeave(req.user._id, req.body);
    
    if (!result.success) {
      return res.status(result.statusCode).json({ message: result.message });
    }
    
    res.status(result.statusCode).json(result.data);
  } catch (error) {
    console.error('Create leave error:', error);
    res.status(500).json({ message: 'Failed to create leave' });
  }
};
// ... 10 more similar methods
```

### After (Refactored)
```javascript
import { createServiceHandler, asyncHandler, sendRawResponse } from '../utils/controllerHelpers.js';
import { leaveService } from '../services/leave.service.js';

// Simple pass-through endpoints
export const getMyLeaves = createServiceHandler(
  (req) => leaveService.getMyLeaves(req.user._id),
  { raw: true }
);

export const createLeave = createServiceHandler(
  (req) => leaveService.createLeave(req.user._id, req.body),
  { raw: true }
);

export const updateLeave = createServiceHandler(
  (req) => leaveService.updateLeave(req.params.id, req.body, req.user),
  { raw: true }
);

// More complex endpoint - use asyncHandler + manual response
export const getLeaveStats = asyncHandler(async (req, res) => {
  const result = await leaveService.getLeaveStats(req.user._id, req.query);
  sendRawResponse(res, result);
});
```

**Lines saved**: ~120 lines (from ~180 to ~60)

---

## Testing Strategy

After each controller refactoring:

1. **Check response format unchanged**:
   ```bash
   # Use curl or Postman to compare responses
   curl http://localhost:5000/api/endpoint > before.json
   # Refactor
   curl http://localhost:5000/api/endpoint > after.json
   diff before.json after.json
   ```

2. **Check error handling**:
   - Test with invalid data
   - Test with missing auth
   - Verify error format unchanged

3. **Check frontend**:
   - Test the corresponding frontend feature
   - Ensure no breaking changes

---

## Estimated Impact

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| Try-catch blocks | 209 | 0 | 100% |
| Console.error calls | 177 | 0 | 100% |
| 500 error handlers | 208 | 0 | 100% |
| Total controller lines | ~4,500 | ~2,500 | ~44% |

---

## Files Modified

```
src/utils/
├── asyncHandler.js       (existing)
└── controllerHelpers.js  (NEW - created)

src/controllers/
├── *.js                  (43 files to refactor incrementally)
```

---

## Commands

### Verify syntax after changes
```bash
node --check src/controllers/leaveController.js
```

### Test server
```bash
npm run dev
```

### Find controllers not yet using helpers
```bash
grep -L "asyncHandler\|createServiceHandler" src/controllers/*.js
```

---

## Next Phase (Future)

After Phase 4 is complete:
- Phase 5: Unit Testing for Services
- Phase 6: API Documentation (Swagger)
- Phase 7: Performance Optimization
