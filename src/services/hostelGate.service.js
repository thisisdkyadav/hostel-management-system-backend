/**
 * Hostel Gate Service
 * Handles hostel gate login/user operations
 * 
 * @module services/hostelGate.service
 */

import { HostelGate } from '../models/index.js';
import { Hostel } from '../models/index.js';
import { User } from '../models/index.js';
import bcrypt from 'bcrypt';
import { BaseService, success, notFound, conflict, error } from './base/index.js';

class HostelGateService extends BaseService {
  constructor() {
    super(HostelGate, 'Hostel gate');
  }

  /**
   * Create hostel gate login
   * @param {Object} data - Gate data with hostelId and password
   */
  async createHostelGate(data) {
    try {
      const { hostelId, password } = data;

      const hostel = await Hostel.findById(hostelId);
      if (!hostel) {
        return notFound('Hostel');
      }

      const existing = await this.model.findOne({ hostelId });
      if (existing) {
        return conflict('Hostel gate already exists');
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user for gate
      const user = await User.create({
        name: hostel.name,
        email: `${hostel.name.toLowerCase()}.gate.login@iiti.ac.in`,
        password: hashedPassword,
        role: 'Hostel Gate'
      });

      await this.model.create({ userId: user._id, hostelId });
      return success({ message: 'Hostel gate created successfully' }, 201);
    } catch (err) {
      return error(err.message, 500, err.message);
    }
  }

  /**
   * Get all hostel gates
   */
  async getAllHostelGates() {
    const result = await this.findAll({}, {
      populate: [
        { path: 'userId', select: 'name email' },
        { path: 'hostelId', select: 'name' }
      ]
    });

    if (result.success) {
      return success({ hostelGates: result.data });
    }
    return result;
  }

  /**
   * Update hostel gate password
   * @param {string} hostelId - Hostel ID
   * @param {Object} data - Password data
   */
  async updateHostelGate(hostelId, data) {
    try {
      const { password } = data;

      const hostelGate = await this.model.findOne({ hostelId });
      if (!hostelGate) {
        return notFound(this.entityName);
      }

      const salt = await bcrypt.genSalt(10);
      hostelGate.password = await bcrypt.hash(password, salt);
      await hostelGate.save();

      return success({ message: 'Hostel gate updated successfully' });
    } catch (err) {
      return error(err.message, 500, err.message);
    }
  }

  /**
   * Delete hostel gate
   * @param {string} hostelId - Hostel ID
   */
  async deleteHostelGate(hostelId) {
    const hostelGate = await this.model.findOne({ hostelId });
    if (!hostelGate) {
      return notFound(this.entityName);
    }

    await hostelGate.deleteOne();
    return success({ message: 'Hostel gate deleted successfully' });
  }

  /**
   * Get hostel gate profile
   * @param {string} hostelId - Hostel ID
   */
  async getHostelGateProfile(hostelId) {
    const result = await this.findOne({ hostelId });
    if (result.success) {
      return success({ message: 'Hostel gate profile fetched successfully', hostelGate: result.data });
    }
    return result;
  }
}

export const hostelGateService = new HostelGateService();
