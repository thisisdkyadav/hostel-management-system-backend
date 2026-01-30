/**
 * Event Service
 * Handles hostel event operations
 * 
 * @module services/event.service
 */

import Event from '../../models/Event.js';
import StudentProfile from '../../models/StudentProfile.js';
import { BaseService, success, notFound, error, PRESETS } from './base/index.js';

class EventService extends BaseService {
  constructor() {
    super(Event, 'Event');
  }

  /**
   * Create a new event
   * @param {Object} data - Event data
   * @param {Object} user - Current user
   */
  async createEvent(data, user) {
    const { eventName, description, dateAndTime, hostelId, gender } = data;

    const staffHostelId = user.hostel ? user.hostel._id : null;

    const result = await this.create({
      eventName,
      description,
      dateAndTime,
      hostelId: staffHostelId || hostelId,
      gender
    });

    if (result.success) {
      return success({ message: 'Event created successfully', event: result.data }, 201);
    }
    return result;
  }

  /**
   * Get events based on user role
   * @param {Object} user - Current user
   */
  async getEvents(user) {
    try {
      const query = {};
      const { role, hostel } = user;

      if (role === 'Student') {
        const studentProfile = await StudentProfile.findOne({ userId: user._id }).populate('currentRoomAllocation');
        const hostelId = studentProfile.currentRoomAllocation.hostelId;
        query.hostelId = { $in: [hostelId, null] };
        query.gender = { $in: [studentProfile.gender, null] };
      } else if (hostel) {
        query.hostelId = { $in: [hostel._id, null] };
      }

      const result = await this.findAll(query, { populate: PRESETS.EVENT });

      if (result.success && result.data.length > 0) {
        return success({ events: result.data });
      }
      return notFound('Events');
    } catch (err) {
      return error('Internal server error', 500, err.message);
    }
  }

  /**
   * Update an event
   * @param {string} id - Event ID
   * @param {Object} data - Update data
   */
  async updateEvent(id, data) {
    const { eventName, description, dateAndTime, hostelId, gender } = data;

    const result = await this.updateById(id, {
      eventName,
      description,
      dateAndTime,
      hostelId: hostelId || null,
      gender
    });

    if (result.success) {
      return success({ message: 'Event updated successfully', success: true, event: result.data });
    }
    return result;
  }

  /**
   * Delete an event
   * @param {string} id - Event ID
   */
  async deleteEvent(id) {
    const result = await this.deleteById(id);
    if (result.success) {
      return success({ message: 'Event deleted successfully', success: true });
    }
    return result;
  }
}

export const eventService = new EventService();
