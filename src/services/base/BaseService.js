/**
 * Base Service Class
 * Provides common CRUD operations and patterns for all services
 * Extend this class to reduce boilerplate in service implementations
 * 
 * @module services/base/BaseService
 */

import { ServiceResponse } from './ServiceResponse.js';
import { withTransaction } from './TransactionHelper.js';
import { query } from './QueryBuilder.js';
import logger from './Logger.js';

export class BaseService {
  /**
   * Create a new BaseService instance
   * @param {Model} model - Mongoose model
   * @param {string} entityName - Entity name for error messages (e.g., 'Leave', 'Complaint')
   */
  constructor(model, entityName = 'Resource') {
    this.model = model;
    this.entityName = entityName;
  }

  // ==================== Query Builder Access ====================

  /**
   * Get a query builder for this model
   * @returns {QueryBuilder}
   */
  query() {
    return query(this.model);
  }

  // ==================== Basic CRUD ====================

  /**
   * Find by ID with optional populate
   * @param {string} id - Document ID
   * @param {Array|Object} populate - Populate config
   * @param {string} select - Fields to select
   */
  async findById(id, populate = [], select = null) {
    try {
      let query = this.model.findById(id);
      if (select) query = query.select(select);
      if (Array.isArray(populate)) {
        populate.forEach(p => query = query.populate(p));
      } else if (populate) {
        query = query.populate(populate);
      }
      
      const doc = await query.exec();
      if (!doc) {
        return ServiceResponse.notFound(this.entityName);
      }
      return ServiceResponse.success(doc);
    } catch (error) {
      logger.error(`Error finding ${this.entityName} by ID`, { id, error: error.message });
      return ServiceResponse.error(`Failed to fetch ${this.entityName}`, 500, error.message);
    }
  }

  /**
   * Find one document by filter
   * @param {Object} filter - Query filter
   * @param {Array} populate - Populate config
   * @param {string} select - Fields to select
   */
  async findOne(filter, populate = [], select = null) {
    try {
      let query = this.model.findOne(filter);
      if (select) query = query.select(select);
      if (Array.isArray(populate)) {
        populate.forEach(p => query = query.populate(p));
      }
      
      const doc = await query.exec();
      if (!doc) {
        return ServiceResponse.notFound(this.entityName);
      }
      return ServiceResponse.success(doc);
    } catch (error) {
      logger.error(`Error finding ${this.entityName}`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to fetch ${this.entityName}`, 500, error.message);
    }
  }

  /**
   * Find all documents matching filter
   * @param {Object} filter - Query filter
   * @param {Object} options - { populate, sort, select }
   */
  async findAll(filter = {}, options = {}) {
    try {
      const { populate = [], sort = { createdAt: -1 }, select = null } = options;
      
      let query = this.model.find(filter).sort(sort);
      if (select) query = query.select(select);
      if (Array.isArray(populate)) {
        populate.forEach(p => query = query.populate(p));
      }
      
      const docs = await query.exec();
      return ServiceResponse.success(docs);
    } catch (error) {
      logger.error(`Error finding ${this.entityName}s`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to fetch ${this.entityName}s`, 500, error.message);
    }
  }

  /**
   * Find with pagination
   * @param {Object} filter - Query filter
   * @param {Object} options - { page, limit, populate, sort, select }
   */
  async findPaginated(filter = {}, options = {}) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        populate = [], 
        sort = { createdAt: -1 },
        select = null 
      } = options;

      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      let query = this.model.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));
        
      if (select) query = query.select(select);
      if (Array.isArray(populate)) {
        populate.forEach(p => query = query.populate(p));
      }

      const [items, total] = await Promise.all([
        query.exec(),
        this.model.countDocuments(filter)
      ]);

      return ServiceResponse.paginated(items, { page, limit, total });
    } catch (error) {
      logger.error(`Error paginating ${this.entityName}s`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to fetch ${this.entityName}s`, 500, error.message);
    }
  }

  /**
   * Create a new document
   * @param {Object} data - Document data
   */
  async create(data) {
    try {
      const doc = await this.model.create(data);
      return ServiceResponse.created(doc);
    } catch (error) {
      logger.error(`Error creating ${this.entityName}`, { error: error.message });
      
      // Handle duplicate key error
      if (error.code === 11000) {
        return ServiceResponse.conflict(`${this.entityName} already exists`);
      }
      
      return ServiceResponse.error(`Failed to create ${this.entityName}`, 500, error.message);
    }
  }

  /**
   * Create multiple documents
   * @param {Array} dataArray - Array of document data
   */
  async createMany(dataArray) {
    try {
      const docs = await this.model.insertMany(dataArray);
      return ServiceResponse.created(docs);
    } catch (error) {
      logger.error(`Error creating ${this.entityName}s`, { error: error.message });
      return ServiceResponse.error(`Failed to create ${this.entityName}s`, 500, error.message);
    }
  }

  /**
   * Update by ID
   * @param {string} id - Document ID
   * @param {Object} updates - Update data
   * @param {Object} options - { populate, returnNew }
   */
  async updateById(id, updates, options = {}) {
    try {
      const { populate = [], returnNew = true } = options;
      
      let query = this.model.findByIdAndUpdate(
        id,
        updates,
        { new: returnNew, runValidators: true }
      );
      
      if (Array.isArray(populate)) {
        populate.forEach(p => query = query.populate(p));
      }

      const doc = await query.exec();
      if (!doc) {
        return ServiceResponse.notFound(this.entityName);
      }
      return ServiceResponse.success(doc);
    } catch (error) {
      logger.error(`Error updating ${this.entityName}`, { id, error: error.message });
      return ServiceResponse.error(`Failed to update ${this.entityName}`, 500, error.message);
    }
  }

  /**
   * Update one document by filter
   * @param {Object} filter - Query filter
   * @param {Object} updates - Update data
   * @param {Object} options - { populate, returnNew }
   */
  async updateOne(filter, updates, options = {}) {
    try {
      const { populate = [], returnNew = true } = options;
      
      let query = this.model.findOneAndUpdate(
        filter,
        updates,
        { new: returnNew, runValidators: true }
      );
      
      if (Array.isArray(populate)) {
        populate.forEach(p => query = query.populate(p));
      }

      const doc = await query.exec();
      if (!doc) {
        return ServiceResponse.notFound(this.entityName);
      }
      return ServiceResponse.success(doc);
    } catch (error) {
      logger.error(`Error updating ${this.entityName}`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to update ${this.entityName}`, 500, error.message);
    }
  }

  /**
   * Update many documents
   * @param {Object} filter - Query filter
   * @param {Object} updates - Update data
   */
  async updateMany(filter, updates) {
    try {
      const result = await this.model.updateMany(filter, updates);
      return ServiceResponse.success({
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      logger.error(`Error updating ${this.entityName}s`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to update ${this.entityName}s`, 500, error.message);
    }
  }

  /**
   * Delete by ID
   * @param {string} id - Document ID
   */
  async deleteById(id) {
    try {
      const doc = await this.model.findByIdAndDelete(id);
      if (!doc) {
        return ServiceResponse.notFound(this.entityName);
      }
      return ServiceResponse.success(doc, 200, `${this.entityName} deleted successfully`);
    } catch (error) {
      logger.error(`Error deleting ${this.entityName}`, { id, error: error.message });
      return ServiceResponse.error(`Failed to delete ${this.entityName}`, 500, error.message);
    }
  }

  /**
   * Delete one by filter
   * @param {Object} filter - Query filter
   */
  async deleteOne(filter) {
    try {
      const doc = await this.model.findOneAndDelete(filter);
      if (!doc) {
        return ServiceResponse.notFound(this.entityName);
      }
      return ServiceResponse.success(doc, 200, `${this.entityName} deleted successfully`);
    } catch (error) {
      logger.error(`Error deleting ${this.entityName}`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to delete ${this.entityName}`, 500, error.message);
    }
  }

  /**
   * Delete many by filter
   * @param {Object} filter - Query filter
   */
  async deleteMany(filter) {
    try {
      const result = await this.model.deleteMany(filter);
      return ServiceResponse.success({
        deletedCount: result.deletedCount
      }, 200, `${result.deletedCount} ${this.entityName}(s) deleted`);
    } catch (error) {
      logger.error(`Error deleting ${this.entityName}s`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to delete ${this.entityName}s`, 500, error.message);
    }
  }

  // ==================== Utility Methods ====================

  /**
   * Count documents matching filter
   * @param {Object} filter - Query filter
   */
  async count(filter = {}) {
    try {
      const count = await this.model.countDocuments(filter);
      return ServiceResponse.success({ count });
    } catch (error) {
      logger.error(`Error counting ${this.entityName}s`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to count ${this.entityName}s`, 500, error.message);
    }
  }

  /**
   * Check if document exists
   * @param {Object} filter - Query filter
   */
  async exists(filter) {
    try {
      const exists = await this.model.exists(filter);
      return ServiceResponse.success({ exists: !!exists });
    } catch (error) {
      logger.error(`Error checking ${this.entityName} existence`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to check ${this.entityName}`, 500, error.message);
    }
  }

  /**
   * Aggregate helper
   * @param {Array} pipeline - Aggregation pipeline
   */
  async aggregate(pipeline) {
    try {
      const results = await this.model.aggregate(pipeline);
      return ServiceResponse.success(results);
    } catch (error) {
      logger.error(`Error aggregating ${this.entityName}s`, { error: error.message });
      return ServiceResponse.error(`Failed to aggregate ${this.entityName}s`, 500, error.message);
    }
  }

  /**
   * Execute within transaction
   * @param {Function} callback - Async function receiving session
   */
  async withTransaction(callback) {
    return withTransaction(callback);
  }

  /**
   * Find or create document
   * @param {Object} filter - Query filter
   * @param {Object} createData - Data to create if not found
   */
  async findOrCreate(filter, createData) {
    try {
      let doc = await this.model.findOne(filter);
      if (doc) {
        return ServiceResponse.success(doc);
      }
      doc = await this.model.create({ ...filter, ...createData });
      return ServiceResponse.created(doc);
    } catch (error) {
      logger.error(`Error in findOrCreate ${this.entityName}`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to find/create ${this.entityName}`, 500, error.message);
    }
  }

  /**
   * Upsert (update or create)
   * @param {Object} filter - Query filter
   * @param {Object} data - Data to set
   */
  async upsert(filter, data) {
    try {
      const doc = await this.model.findOneAndUpdate(
        filter,
        { $set: data },
        { new: true, upsert: true, runValidators: true }
      );
      return ServiceResponse.success(doc);
    } catch (error) {
      logger.error(`Error upserting ${this.entityName}`, { filter, error: error.message });
      return ServiceResponse.error(`Failed to upsert ${this.entityName}`, 500, error.message);
    }
  }

  // ==================== Soft Delete Support ====================

  /**
   * Soft delete by ID (sets isDeleted: true)
   * @param {string} id - Document ID
   */
  async softDelete(id) {
    return this.updateById(id, { isDeleted: true, deletedAt: new Date() });
  }

  /**
   * Restore soft deleted document
   * @param {string} id - Document ID
   */
  async restore(id) {
    return this.updateById(id, { isDeleted: false, deletedAt: null });
  }
}

export default BaseService;
