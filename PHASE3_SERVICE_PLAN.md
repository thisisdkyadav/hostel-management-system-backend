# Phase 3: Service Layer Perfection Plan

> **Created**: January 30, 2026
> **Goal**: Transform 43 services from "moved code" to "clean architecture"
> **Estimated Effort**: 3-4 sessions
> **Critical Rule**: NO API CHANGES - All endpoints must work identically

---

## Overview

Current services are just controller logic moved to separate files. This plan transforms them into a proper service layer with:
- ✅ BaseService for common CRUD operations
- ✅ Transaction utilities
- ✅ Proper logging
- ✅ Query builders
- ✅ Standardized response helpers
- ✅ Populate presets

---

## Phase 3.1: Foundation Layer

### Step 1: Create Base Directory Structure

```bash
mkdir -p src/services/base
```

**Files to create**:
```
src/services/base/
├── BaseService.js       # Core CRUD operations
├── ServiceResponse.js   # Response helpers
├── QueryBuilder.js      # Query construction
├── TransactionHelper.js # Transaction wrapper
├── PopulatePresets.js   # Reusable populate configs
├── Logger.js            # Structured logging
└── index.js             # Central exports
```

---

### Step 2: Create ServiceResponse.js

**Purpose**: Standardize all service responses

```javascript
// src/services/base/ServiceResponse.js

/**
 * Service Response Helpers
 * Standardizes all service layer responses
 */

export class ServiceResponse {
  /**
   * Success response
   * @param {any} data - Response data
   * @param {number} statusCode - HTTP status code (default: 200)
   * @param {string} message - Optional success message
   */
  static success(data, statusCode = 200, message = null) {
    const response = { success: true, statusCode, data };
    if (message) response.message = message;
    return response;
  }

  /**
   * Created response (201)
   */
  static created(data, message = 'Created successfully') {
    return { success: true, statusCode: 201, data, message };
  }

  /**
   * Error response
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {string} errorDetails - Optional error details (for logging)
   */
  static error(message, statusCode = 500, errorDetails = null) {
    const response = { success: false, statusCode, message };
    if (errorDetails && process.env.NODE_ENV === 'development') {
      response.error = errorDetails;
    }
    return response;
  }

  /**
   * Not Found response (404)
   */
  static notFound(entity = 'Resource') {
    return { success: false, statusCode: 404, message: `${entity} not found` };
  }

  /**
   * Bad Request response (400)
   */
  static badRequest(message = 'Bad request') {
    return { success: false, statusCode: 400, message };
  }

  /**
   * Unauthorized response (401)
   */
  static unauthorized(message = 'Unauthorized') {
    return { success: false, statusCode: 401, message };
  }

  /**
   * Forbidden response (403)
   */
  static forbidden(message = 'Access denied') {
    return { success: false, statusCode: 403, message };
  }

  /**
   * Conflict response (409)
   */
  static conflict(message = 'Resource already exists') {
    return { success: false, statusCode: 409, message };
  }

  /**
   * Paginated response
   */
  static paginated(items, { page, limit, total }) {
    return {
      success: true,
      statusCode: 200,
      data: {
        items,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total
        }
      }
    };
  }
}

// Shorthand exports
export const { success, created, error, notFound, badRequest, unauthorized, forbidden, conflict, paginated } = ServiceResponse;
```

---

### Step 3: Create TransactionHelper.js

**Purpose**: Eliminate repeated transaction boilerplate

```javascript
// src/services/base/TransactionHelper.js

import mongoose from 'mongoose';
import { error } from './ServiceResponse.js';

/**
 * Execute callback within a MongoDB transaction
 * Handles session creation, commit, rollback, and cleanup
 * 
 * @param {Function} callback - Async function receiving session
 * @returns {Promise<any>} Result from callback
 * 
 * @example
 * const result = await withTransaction(async (session) => {
 *   await User.create([userData], { session });
 *   await Profile.create([profileData], { session });
 *   return { user, profile };
 * });
 */
export async function withTransaction(callback) {
  const session = await mongoose.startSession();
  
  try {
    let result;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result;
  } catch (err) {
    console.error('Transaction failed:', err.message);
    throw err;
  } finally {
    session.endSession();
  }
}

/**
 * Execute callback within transaction and return ServiceResponse
 * Catches errors and returns proper error response
 * 
 * @param {Function} callback - Async function receiving session
 * @param {string} errorMessage - Message to return on failure
 * @returns {Promise<ServiceResponse>}
 */
export async function withTransactionResponse(callback, errorMessage = 'Operation failed') {
  try {
    return await withTransaction(callback);
  } catch (err) {
    return error(errorMessage, 500, err.message);
  }
}
```

---

### Step 4: Create PopulatePresets.js

**Purpose**: Reusable populate configurations

```javascript
// src/services/base/PopulatePresets.js

/**
 * Standardized populate configurations
 * Prevents duplicate populate strings across services
 */

// User populates
export const USER_BASIC = { path: 'userId', select: 'name email' };
export const USER_WITH_PHONE = { path: 'userId', select: 'name email phone' };
export const USER_WITH_IMAGE = { path: 'userId', select: 'name email profileImage' };
export const USER_FULL = { path: 'userId', select: 'name email phone profileImage role' };

// Staff populates (assignedTo, resolvedBy, createdBy, etc.)
export const STAFF_BASIC = { select: 'name email phone' };
export const STAFF_WITH_IMAGE = { select: 'name email phone profileImage' };

// Hostel populates
export const HOSTEL_BASIC = { path: 'hostelId', select: 'name' };
export const HOSTEL_FULL = { path: 'hostelId', select: 'name gender type' };

// Room populates
export const ROOM_BASIC = { path: 'roomId', select: 'roomNumber' };
export const ROOM_FULL = { path: 'roomId', select: 'roomNumber capacity status occupancy' };

// Unit populates
export const UNIT_BASIC = { path: 'unitId', select: 'unitNumber' };
export const UNIT_FULL = { path: 'unitId', select: 'unitNumber floor' };

// Compound presets for common entities
export const PRESETS = {
  // Complaint with all relations
  COMPLAINT: [
    { path: 'userId', select: 'name email profileImage phone role' },
    { path: 'hostelId', select: 'name' },
    { path: 'roomId', select: 'roomNumber' },
    { path: 'unitId', select: 'unitNumber' },
    { path: 'assignedTo', select: 'name email phone profileImage' },
    { path: 'resolvedBy', select: 'name email phone profileImage' }
  ],

  // Visitor request
  VISITOR_REQUEST: [
    { path: 'userId', select: 'name email profileImage' },
    { path: 'visitors' },
    { path: 'hostelId', select: 'name' }
  ],

  // Leave with user
  LEAVE: [
    { path: 'userId', select: 'name email' },
    { path: 'approvalBy', select: 'name email' }
  ],

  // Room allocation
  ROOM_ALLOCATION: [
    { path: 'userId', select: 'name email' },
    { path: 'hostelId', select: 'name' },
    { path: 'roomId', select: 'roomNumber capacity' },
    { path: 'unitId', select: 'unitNumber' }
  ],

  // Feedback
  FEEDBACK: [
    { path: 'userId', select: 'name email profileImage' },
    { path: 'hostelId', select: 'name' }
  ],

  // Task
  TASK: [
    { path: 'assignedTo', select: 'name email phone' },
    { path: 'createdBy', select: 'name email' },
    { path: 'hostelId', select: 'name' }
  ]
};

/**
 * Helper to build populate array
 * @param  {...string} presetNames - Names from PRESETS
 * @returns {Array} Combined populate array
 */
export function buildPopulate(...presetNames) {
  return presetNames.flatMap(name => PRESETS[name] || []);
}
```

---

### Step 5: Create QueryBuilder.js

**Purpose**: Fluent query construction

```javascript
// src/services/base/QueryBuilder.js

/**
 * Fluent Query Builder for MongoDB
 * Reduces duplicate query construction code
 */
export class QueryBuilder {
  constructor(model) {
    this.model = model;
    this._query = {};
    this._options = {
      sort: { createdAt: -1 },
      populate: []
    };
  }

  /**
   * Add simple equality condition
   */
  where(field, value) {
    if (value !== undefined && value !== null && value !== '') {
      this._query[field] = value;
    }
    return this;
  }

  /**
   * Add condition only if value is truthy
   */
  whereIf(condition, field, value) {
    if (condition) {
      this._query[field] = value;
    }
    return this;
  }

  /**
   * Add $in condition
   */
  whereIn(field, values) {
    if (Array.isArray(values) && values.length > 0) {
      this._query[field] = { $in: values };
    }
    return this;
  }

  /**
   * Add date range condition
   */
  dateRange(field, startDate, endDate) {
    if (startDate || endDate) {
      this._query[field] = {};
      if (startDate) this._query[field].$gte = new Date(startDate);
      if (endDate) this._query[field].$lte = new Date(endDate);
    }
    return this;
  }

  /**
   * Add regex search (case-insensitive)
   */
  search(field, term) {
    if (term) {
      this._query[field] = { $regex: term, $options: 'i' };
    }
    return this;
  }

  /**
   * Add pagination
   */
  paginate(page = 1, limit = 10) {
    this._options.skip = (parseInt(page) - 1) * parseInt(limit);
    this._options.limit = parseInt(limit);
    this._page = parseInt(page);
    this._limit = parseInt(limit);
    return this;
  }

  /**
   * Add sorting
   */
  sort(field, order = -1) {
    if (typeof field === 'object') {
      this._options.sort = field;
    } else {
      this._options.sort = { [field]: order };
    }
    return this;
  }

  /**
   * Add populate
   */
  populate(fields) {
    if (Array.isArray(fields)) {
      this._options.populate = [...this._options.populate, ...fields];
    } else if (fields) {
      this._options.populate.push(fields);
    }
    return this;
  }

  /**
   * Select specific fields
   */
  select(fields) {
    this._options.select = fields;
    return this;
  }

  /**
   * Execute and return raw results
   */
  async execute() {
    let query = this.model.find(this._query);
    
    if (this._options.select) query = query.select(this._options.select);
    if (this._options.sort) query = query.sort(this._options.sort);
    if (this._options.skip) query = query.skip(this._options.skip);
    if (this._options.limit) query = query.limit(this._options.limit);
    if (this._options.populate.length > 0) {
      this._options.populate.forEach(p => {
        query = query.populate(p);
      });
    }

    return query.exec();
  }

  /**
   * Execute and return with pagination info
   */
  async executeWithPagination() {
    const [items, total] = await Promise.all([
      this.execute(),
      this.model.countDocuments(this._query)
    ]);

    return {
      items,
      pagination: {
        page: this._page || 1,
        limit: this._limit || 10,
        total,
        totalPages: Math.ceil(total / (this._limit || 10))
      }
    };
  }

  /**
   * Get count only
   */
  async count() {
    return this.model.countDocuments(this._query);
  }

  /**
   * Get first matching document
   */
  async findOne() {
    let query = this.model.findOne(this._query);
    if (this._options.populate.length > 0) {
      this._options.populate.forEach(p => {
        query = query.populate(p);
      });
    }
    return query.exec();
  }
}

/**
 * Factory function for cleaner usage
 */
export function query(model) {
  return new QueryBuilder(model);
}
```

---

### Step 6: Create Logger.js

**Purpose**: Structured logging to replace console.log/error

```javascript
// src/services/base/Logger.js

/**
 * Simple structured logger
 * Can be replaced with winston/pino later
 */

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

export const logger = {
  error(message, meta = {}) {
    if (CURRENT_LEVEL >= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, meta));
    }
  },

  warn(message, meta = {}) {
    if (CURRENT_LEVEL >= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },

  info(message, meta = {}) {
    if (CURRENT_LEVEL >= LOG_LEVELS.info) {
      console.log(formatMessage('info', message, meta));
    }
  },

  debug(message, meta = {}) {
    if (CURRENT_LEVEL >= LOG_LEVELS.debug) {
      console.log(formatMessage('debug', message, meta));
    }
  }
};

export default logger;
```

---

### Step 7: Create BaseService.js

**Purpose**: Core CRUD operations that all services can inherit

```javascript
// src/services/base/BaseService.js

import { ServiceResponse } from './ServiceResponse.js';
import { QueryBuilder } from './QueryBuilder.js';
import { withTransaction } from './TransactionHelper.js';
import logger from './Logger.js';

/**
 * Base Service Class
 * Provides common CRUD operations for all services
 * 
 * @example
 * class LeaveService extends BaseService {
 *   constructor() {
 *     super(Leave, 'Leave');
 *   }
 *   
 *   // Custom methods use inherited helpers
 *   async getMyLeaves(userId) {
 *     return this.findAll({ userId });
 *   }
 * }
 */
export class BaseService {
  /**
   * @param {Model} model - Mongoose model
   * @param {string} modelName - Name for error messages
   * @param {Object} options - Default options
   */
  constructor(model, modelName, options = {}) {
    this.model = model;
    this.modelName = modelName;
    this.defaultPopulate = options.populate || [];
    this.defaultSort = options.sort || { createdAt: -1 };
  }

  // ==================== Response Helpers ====================

  success(data, statusCode = 200) {
    return ServiceResponse.success(data, statusCode);
  }

  created(data, message) {
    return ServiceResponse.created(data, message || `${this.modelName} created successfully`);
  }

  error(message, statusCode = 500, errorDetails = null) {
    logger.error(message, { model: this.modelName, error: errorDetails });
    return ServiceResponse.error(message, statusCode, errorDetails);
  }

  notFound() {
    return ServiceResponse.notFound(this.modelName);
  }

  badRequest(message) {
    return ServiceResponse.badRequest(message);
  }

  // ==================== Query Builder ====================

  query() {
    return new QueryBuilder(this.model);
  }

  // ==================== Transaction Helper ====================

  async withTransaction(callback) {
    return withTransaction(callback);
  }

  // ==================== Common CRUD Operations ====================

  /**
   * Find by ID
   */
  async findById(id, populate = this.defaultPopulate) {
    try {
      const item = await this.model.findById(id).populate(populate);
      if (!item) return this.notFound();
      return this.success(item);
    } catch (err) {
      return this.error(`Error fetching ${this.modelName}`, 500, err.message);
    }
  }

  /**
   * Find one by query
   */
  async findOne(query, populate = this.defaultPopulate) {
    try {
      const item = await this.model.findOne(query).populate(populate);
      if (!item) return this.notFound();
      return this.success(item);
    } catch (err) {
      return this.error(`Error fetching ${this.modelName}`, 500, err.message);
    }
  }

  /**
   * Find all with optional pagination
   */
  async findAll(query = {}, options = {}) {
    try {
      const { page, limit, sort = this.defaultSort, populate = this.defaultPopulate } = options;

      let dbQuery = this.model.find(query).populate(populate).sort(sort);

      if (page && limit) {
        const skip = (parseInt(page) - 1) * parseInt(limit);
        dbQuery = dbQuery.skip(skip).limit(parseInt(limit));

        const [items, total] = await Promise.all([
          dbQuery.exec(),
          this.model.countDocuments(query)
        ]);

        return ServiceResponse.paginated(items, { page, limit, total });
      }

      const items = await dbQuery.exec();
      return this.success(items);
    } catch (err) {
      return this.error(`Error fetching ${this.modelName}s`, 500, err.message);
    }
  }

  /**
   * Create new document
   */
  async create(data) {
    try {
      const item = new this.model(data);
      await item.save();
      return this.created(item);
    } catch (err) {
      if (err.code === 11000) {
        return ServiceResponse.conflict(`${this.modelName} already exists`);
      }
      return this.error(`Error creating ${this.modelName}`, 500, err.message);
    }
  }

  /**
   * Update by ID
   */
  async updateById(id, data, options = { new: true }) {
    try {
      const item = await this.model.findByIdAndUpdate(id, data, options);
      if (!item) return this.notFound();
      return this.success(item);
    } catch (err) {
      return this.error(`Error updating ${this.modelName}`, 500, err.message);
    }
  }

  /**
   * Delete by ID
   */
  async deleteById(id) {
    try {
      const item = await this.model.findByIdAndDelete(id);
      if (!item) return this.notFound();
      return this.success({ message: `${this.modelName} deleted successfully` });
    } catch (err) {
      return this.error(`Error deleting ${this.modelName}`, 500, err.message);
    }
  }

  /**
   * Count documents
   */
  async count(query = {}) {
    try {
      const count = await this.model.countDocuments(query);
      return this.success({ count });
    } catch (err) {
      return this.error(`Error counting ${this.modelName}s`, 500, err.message);
    }
  }

  /**
   * Check if exists
   */
  async exists(query) {
    try {
      const exists = await this.model.exists(query);
      return this.success({ exists: !!exists });
    } catch (err) {
      return this.error(`Error checking ${this.modelName}`, 500, err.message);
    }
  }
}

export default BaseService;
```

---

### Step 8: Create index.js

```javascript
// src/services/base/index.js

export { BaseService } from './BaseService.js';
export { ServiceResponse, success, created, error, notFound, badRequest, unauthorized, forbidden, conflict, paginated } from './ServiceResponse.js';
export { QueryBuilder, query } from './QueryBuilder.js';
export { withTransaction, withTransactionResponse } from './TransactionHelper.js';
export { logger } from './Logger.js';
export * from './PopulatePresets.js';
```

---

## Phase 3.2: Refactor Simple Services First

### Target: Services with basic CRUD (10 services)

| Service | Current Lines | Target Lines | Reduction |
|---------|--------------|--------------|-----------|
| lostAndFound.service.js | 65 | ~25 | 60% |
| certificate.service.js | 92 | ~40 | 55% |
| disCo.service.js | 85 | ~35 | 60% |
| visitorProfile.service.js | 82 | ~30 | 65% |
| event.service.js | 99 | ~45 | 55% |
| feedback.service.js | 126 | ~50 | 60% |
| inventoryItemType.service.js | ~100 | ~40 | 60% |
| config.service.js | ~80 | ~30 | 60% |
| hostelGate.service.js | ~100 | ~40 | 60% |
| health.service.js | ~80 | ~35 | 55% |

**Example Refactor - lostAndFound.service.js**:

```javascript
// BEFORE (65 lines)
import LostAndFound from "../../models/LostAndFound.js"

class LostAndFoundService {
  async createLostAndFound(data) {
    const { itemName, description, dateFound, images, status } = data
    try {
      const lostAndFoundItem = new LostAndFound({
        itemName, description, dateFound, images, status,
      })
      await lostAndFoundItem.save()
      return { success: true, statusCode: 201, data: { message: "Lost and found item created successfully", lostAndFoundItem } }
    } catch (error) {
      console.error("Error creating lost and found item:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async getLostAndFound() {
    try {
      const lostAndFoundItems = await LostAndFound.find()
      return { success: true, statusCode: 200, data: { lostAndFoundItems } }
    } catch (error) {
      console.error("Error fetching lost and found items:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async updateLostAndFound(id, data) {
    const { itemName, description, dateFound, images, status } = data
    try {
      const lostAndFoundItem = await LostAndFound.findByIdAndUpdate(id, { itemName, description, dateFound, images, status }, { new: true })
      if (!lostAndFoundItem) {
        return { success: false, statusCode: 404, message: "Lost and found item not found" }
      }
      return { success: true, statusCode: 200, data: { message: "Lost and found item updated successfully", success: true, lostAndFoundItem } }
    } catch (error) {
      console.error("Error updating lost and found item:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async deleteLostAndFound(id) {
    try {
      const lostAndFoundItem = await LostAndFound.findByIdAndDelete(id)
      if (!lostAndFoundItem) {
        return { success: false, statusCode: 404, message: "Lost and found item not found" }
      }
      return { success: true, statusCode: 200, data: { message: "Lost and found item deleted successfully", success: true } }
    } catch (error) {
      console.error("Error deleting lost and found item:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }
}

export const lostAndFoundService = new LostAndFoundService()


// AFTER (25 lines)
import { BaseService } from './base/index.js';
import LostAndFound from '../../models/LostAndFound.js';

class LostAndFoundService extends BaseService {
  constructor() {
    super(LostAndFound, 'Lost and found item');
  }

  async createLostAndFound(data) {
    return this.create(data);
  }

  async getLostAndFound() {
    const result = await this.findAll();
    // Maintain original response format
    return { ...result, data: { lostAndFoundItems: result.data } };
  }

  async updateLostAndFound(id, data) {
    return this.updateById(id, data);
  }

  async deleteLostAndFound(id) {
    return this.deleteById(id);
  }
}

export const lostAndFoundService = new LostAndFoundService();
```

---

## Phase 3.3: Refactor Medium Services

### Target: Services with custom logic (15 services)

| Service | Complexity | Notes |
|---------|------------|-------|
| leave.service.js | Medium | Has approve/reject/join flows |
| feedback.service.js | Medium | Role-based queries |
| task.service.js | Medium | Assignment logic |
| notification.service.js | Medium | Already class-based |
| user.service.js | Medium | Password handling |
| warden.service.js | Medium | Hostel assignments |
| associateWarden.service.js | Medium | Similar to warden |
| hostelSupervisor.service.js | Medium | Similar to warden |
| security.service.js | Medium | Similar pattern |
| staffAttendance.service.js | Medium | QR verification |

**Pattern**: Extend BaseService + add custom methods

---

## Phase 3.4: Refactor Complex Services

### Target: Large services with transactions (10 services)

| Service | Lines | Transactions | Challenge |
|---------|-------|--------------|-----------|
| student.service.js | 1319 | Yes | Bulk operations |
| hostel.service.js | 963 | Yes | Room/Unit creation |
| visitor.service.js | 541 | Yes | Room allocation |
| admin.service.js | 570 | No | Multiple entity types |
| complaint.service.js | 517 | No | Complex formatting |
| dashboard.service.js | ~400 | No | Aggregations |
| undertaking.service.js | ~400 | Yes | Assignments |
| studentInventory.service.js | ~300 | Yes | Allocation logic |
| permission.service.js | ~300 | No | Role-based |
| sheet.service.js | ~200 | No | File generation |

**Pattern**: 
1. Use BaseService for simple operations
2. Use withTransaction for complex operations
3. Keep custom formatters as private methods

---

## Implementation Order

### Session 1: Foundation (Today)
1. ✅ Create `src/services/base/` directory
2. ✅ Create all base files (ServiceResponse, TransactionHelper, etc.)
3. ✅ Create BaseService
4. ✅ Verify with `node --check`

### Session 2: Simple Services
1. Refactor 10 simple CRUD services
2. Verify each works identically
3. Run server test

### Session 3: Medium Services
1. Refactor 15 medium complexity services
2. Test thoroughly

### Session 4: Complex Services
1. Refactor 10 complex services
2. Full regression test

---

## Success Criteria

| Metric | Before | Target |
|--------|--------|--------|
| Total service lines | 13,494 | ~8,000 |
| Try-catch blocks | ~100 | ~30 |
| Repeated 404/500 patterns | 233 | 0 |
| console.log/error calls | 94 | 0 |
| Code duplication | High | Low |
| **API behavior** | Works | **Identical** |

---

## Testing Strategy

1. **After each service refactor**:
   - `node --check` for syntax
   - Test 1-2 endpoints manually

2. **After each session**:
   - Start server
   - Test critical flows (auth, complaints, leaves)

3. **Final validation**:
   - Full API test with Postman/curl
   - Compare responses with original
