/**
 * Lost and Found Service
 * Handles CRUD operations for lost and found items
 * 
 * @module services/lostAndFound.service
 */

import LostAndFound from '../../models/LostAndFound.js';
import { BaseService, success } from './base/index.js';

class LostAndFoundService extends BaseService {
  constructor() {
    super(LostAndFound, 'Lost and found item');
  }

  /**
   * Create a new lost and found item
   * @param {Object} data - Item data
   */
  async createLostAndFound(data) {
    const result = await this.create(data);
    if (result.success) {
      return success(
        { message: 'Lost and found item created successfully', lostAndFoundItem: result.data },
        201
      );
    }
    return result;
  }

  /**
   * Get all lost and found items
   */
  async getLostAndFound() {
    const result = await this.findAll();
    if (result.success) {
      return success({ lostAndFoundItems: result.data });
    }
    return result;
  }

  /**
   * Update a lost and found item
   * @param {string} id - Item ID
   * @param {Object} data - Update data
   */
  async updateLostAndFound(id, data) {
    const result = await this.updateById(id, data);
    if (result.success) {
      return success({
        message: 'Lost and found item updated successfully',
        success: true,
        lostAndFoundItem: result.data
      });
    }
    return result;
  }

  /**
   * Delete a lost and found item
   * @param {string} id - Item ID
   */
  async deleteLostAndFound(id) {
    const result = await this.deleteById(id);
    if (result.success) {
      return success({ message: 'Lost and found item deleted successfully', success: true });
    }
    return result;
  }
}

export const lostAndFoundService = new LostAndFoundService();
