/**
 * Query Builder
 * Fluent query construction for MongoDB
 * Reduces duplicate query construction code
 * 
 * @module services/base/QueryBuilder
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
   * @param {string} field - Field name
   * @param {any} value - Value to match
   */
  where(field, value) {
    if (value !== undefined && value !== null && value !== '') {
      this._query[field] = value;
    }
    return this;
  }

  /**
   * Add condition only if condition is truthy
   * @param {boolean} condition - Condition to check
   * @param {string} field - Field name
   * @param {any} value - Value to set
   */
  whereIf(condition, field, value) {
    if (condition) {
      this._query[field] = value;
    }
    return this;
  }

  /**
   * Add $in condition
   * @param {string} field - Field name
   * @param {Array} values - Values array
   */
  whereIn(field, values) {
    if (Array.isArray(values) && values.length > 0) {
      this._query[field] = { $in: values };
    }
    return this;
  }

  /**
   * Add $nin condition (not in)
   * @param {string} field - Field name
   * @param {Array} values - Values array
   */
  whereNotIn(field, values) {
    if (Array.isArray(values) && values.length > 0) {
      this._query[field] = { $nin: values };
    }
    return this;
  }

  /**
   * Add date range condition
   * @param {string} field - Field name
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
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
   * @param {string} field - Field name
   * @param {string} term - Search term
   */
  search(field, term) {
    if (term) {
      this._query[field] = { $regex: term, $options: 'i' };
    }
    return this;
  }

  /**
   * Add multiple field search with OR
   * @param {Array} fields - Field names
   * @param {string} term - Search term
   */
  searchMultiple(fields, term) {
    if (term && fields.length > 0) {
      this._query.$or = fields.map(field => ({
        [field]: { $regex: term, $options: 'i' }
      }));
    }
    return this;
  }

  /**
   * Add raw query conditions
   * @param {Object} conditions - Query conditions
   */
  raw(conditions) {
    Object.assign(this._query, conditions);
    return this;
  }

  /**
   * Add pagination
   * @param {number} page - Page number (1-based)
   * @param {number} limit - Items per page
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
   * @param {string|Object} field - Field name or sort object
   * @param {number} order - Sort order (-1 desc, 1 asc)
   */
  sort(field, order = -1) {
    if (typeof field === 'object') {
      this._options.sort = field;
    } else if (field) {
      this._options.sort = { [field]: order };
    }
    return this;
  }

  /**
   * Add populate
   * @param {Array|Object|string} fields - Populate configuration
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
   * @param {string} fields - Space-separated field names
   */
  select(fields) {
    this._options.select = fields;
    return this;
  }

  /**
   * Build and return the mongoose query (without executing)
   */
  build() {
    let query = this.model.find(this._query);
    
    if (this._options.select) query = query.select(this._options.select);
    if (this._options.sort) query = query.sort(this._options.sort);
    if (this._options.skip !== undefined) query = query.skip(this._options.skip);
    if (this._options.limit) query = query.limit(this._options.limit);
    if (this._options.populate.length > 0) {
      this._options.populate.forEach(p => {
        query = query.populate(p);
      });
    }

    return query;
  }

  /**
   * Execute and return raw results
   */
  async execute() {
    return this.build().exec();
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
        totalPages: Math.ceil(total / (this._limit || 10)),
        hasMore: (this._page || 1) * (this._limit || 10) < total
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
    if (this._options.select) query = query.select(this._options.select);
    if (this._options.populate.length > 0) {
      this._options.populate.forEach(p => {
        query = query.populate(p);
      });
    }
    return query.exec();
  }

  /**
   * Check if any document exists
   */
  async exists() {
    return this.model.exists(this._query);
  }

  /**
   * Get the raw query object (for debugging)
   */
  getQuery() {
    return this._query;
  }
}

/**
 * Factory function for cleaner usage
 * @param {Model} model - Mongoose model
 * @returns {QueryBuilder}
 * 
 * @example
 * const leaves = await query(Leave)
 *   .where('userId', userId)
 *   .where('status', 'Pending')
 *   .sort('createdAt', -1)
 *   .paginate(1, 10)
 *   .populate([PRESETS.LEAVE])
 *   .execute();
 */
export function query(model) {
  return new QueryBuilder(model);
}

export default QueryBuilder;
