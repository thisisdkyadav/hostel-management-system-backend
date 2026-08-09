/**
 * Hostel Gate Service
 * Handles hostel gate login/user operations
 * 
 * @module services/hostelGate.service
 */

import bcrypt from 'bcrypt';
import { success, notFound, conflict, error } from '../../../../services/base/index.js';
import { userOwner } from '../../../../services/user/userOwner.service.js';
import { staffRolesOwner } from '../../../../services/user/staffRolesOwner.service.js';
import { staffRolesQueries } from '../../../../services/user/staffRolesQueries.service.js';
import { hostelQueries } from '../../../../services/hostel/hostelQueries.service.js';

const ENTITY = 'Hostel gate';

class HostelGateService {
  /**
   * Create hostel gate login
   * @param {Object} data - Gate data with hostelId and password
   */
  async createHostelGate(data) {
    try {
      const { hostelId, password } = data;

      const hostel = await hostelQueries.findHostelById(hostelId);
      if (!hostel) {
        return notFound('Hostel');
      }

      const existing = await staffRolesQueries.findOneByRole('HostelGate', { hostelId });
      if (existing) {
        return conflict('Hostel gate already exists');
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user for gate
      const user = await userOwner.createUser({
        name: hostel.name,
        email: `${hostel.name.toLowerCase()}.gate.login@iiti.ac.in`,
        password: hashedPassword,
        role: 'Hostel Gate'
      });

      await staffRolesOwner.create('HostelGate', { userId: user._id, hostelId });
      return success({ message: 'Hostel gate created successfully' }, 201);
    } catch (err) {
      return error(err.message, 500, err.message);
    }
  }

  /**
   * Get all hostel gates
   */
  async getAllHostelGates() {
    try {
      const hostelGates = await staffRolesQueries.findManyByRole('HostelGate', {}, {
        sort: { createdAt: -1 },
        populate: [
          { path: 'userId', select: 'name email' },
          { path: 'hostelId', select: 'name' }
        ]
      });

      return success({ hostelGates });
    } catch (err) {
      return error(`Failed to fetch ${ENTITY}s`, 500, err.message);
    }
  }

  /**
   * Update hostel gate password
   * @param {string} hostelId - Hostel ID
   * @param {Object} data - Password data
   */
  async updateHostelGate(hostelId, data) {
    try {
      const { password } = data;

      const hostelGate = await staffRolesQueries.findOneByRole('HostelGate', { hostelId });
      if (!hostelGate) {
        return notFound(ENTITY);
      }

      const salt = await bcrypt.genSalt(10);
      hostelGate.password = await bcrypt.hash(password, salt);
      await staffRolesOwner.persist(hostelGate);

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
    const hostelGate = await staffRolesQueries.findOneByRole('HostelGate', { hostelId });
    if (!hostelGate) {
      return notFound(ENTITY);
    }

    await staffRolesOwner.deleteDoc(hostelGate);
    return success({ message: 'Hostel gate deleted successfully' });
  }

  /**
   * Get hostel gate profile
   * @param {string} hostelId - Hostel ID
   */
  async getHostelGateProfile(hostelId) {
    try {
      const hostelGate = await staffRolesQueries.findOneByRole('HostelGate', { hostelId });
      if (!hostelGate) {
        return notFound(ENTITY);
      }
      return success({ message: 'Hostel gate profile fetched successfully', hostelGate });
    } catch (err) {
      return error(`Failed to fetch ${ENTITY}`, 500, err.message);
    }
  }
}

export const hostelGateService = new HostelGateService();
