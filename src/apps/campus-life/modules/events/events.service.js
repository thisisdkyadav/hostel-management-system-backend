/**
 * Event Service
 * Handles hostel event operations
 *
 * @module services/event.service
 */

import { Event } from '../../../../models/index.js';
import { StudentProfile } from '../../../../models/index.js';
import { BaseService, success, error } from '../../../../services/base/index.js';
import {
  COMMON_CACHE_CONFIG,
  getEventsCachePayload,
  refreshCommonCache,
} from '../../../../services/cache/commonData.cache.js';

const EVENT_FILTERS = new Set(['all', 'upcoming', 'past']);
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const FIRST_PAGE_LIMIT = COMMON_CACHE_CONFIG.firstPageLimit || DEFAULT_LIMIT;

const toObjectIdString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'object') {
    if (typeof value.toHexString === 'function') {
      return value.toHexString();
    }
    if (value._id && value._id !== value) return toObjectIdString(value._id);
    if (value.id && value.id !== value) return toObjectIdString(value.id);
  }
  if (typeof value?.toString === 'function') {
    const asString = value.toString();
    if (asString && asString !== '[object Object]') return asString;
  }
  return null;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeSearch = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const normalizeFilter = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (EVENT_FILTERS.has(normalized)) return normalized;
  return 'all';
};

const getEventTimestamp = (event) => {
  const timestamp = new Date(event?.dateAndTime).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  hasMore: page * limit < total,
});

const buildEventStats = (events) => {
  const now = Date.now();
  let upcoming = 0;
  let past = 0;
  let nextEventTimestamp = null;

  for (const event of events) {
    const eventTimestamp = getEventTimestamp(event);
    if (eventTimestamp > now) {
      upcoming += 1;
      if (!nextEventTimestamp || eventTimestamp < nextEventTimestamp) {
        nextEventTimestamp = eventTimestamp;
      }
    } else {
      past += 1;
    }
  }

  return {
    total: events.length,
    upcoming,
    past,
    nextEventDate: nextEventTimestamp ? new Date(nextEventTimestamp).toISOString() : null,
  };
};

const isDefaultFirstPageRequest = ({ page, limit, search }) =>
  page === 1 && limit === FIRST_PAGE_LIMIT && !search;

const filterEventsBySearch = (events, searchTerm) => {
  return events.filter((event) => {
    if (!searchTerm) return true;

    const eventName = typeof event?.eventName === 'string' ? event.eventName.toLowerCase() : '';
    const description = typeof event?.description === 'string' ? event.description.toLowerCase() : '';
    return eventName.includes(searchTerm) || description.includes(searchTerm);
  });
};

const isEventVisibleToHostel = (event, hostelId) => {
  const eventHostelId = toObjectIdString(event?.hostelId);
  if (!eventHostelId) return true;
  return hostelId && eventHostelId === hostelId;
};

const isEventVisibleToStudent = (event, { hostelId, gender }) => {
  const eventHostelId = toObjectIdString(event?.hostelId);
  const eventGender = typeof event?.gender === 'string' ? event.gender.toLowerCase() : null;
  const normalizedGender = typeof gender === 'string' ? gender.toLowerCase() : null;

  const matchesHostel = !eventHostelId || (hostelId && eventHostelId === hostelId);
  const matchesGender = !eventGender || (normalizedGender && eventGender === normalizedGender);

  return matchesHostel && matchesGender;
};

class EventService extends BaseService {
  constructor() {
    super(Event, 'Event');
  }

  async getEventsFromDatabase(user, queryParams = {}) {
    const page = parsePositiveInt(queryParams.page, DEFAULT_PAGE);
    const parsedLimit = parsePositiveInt(queryParams.limit, DEFAULT_LIMIT);
    const limit = Math.min(parsedLimit, MAX_LIMIT);
    const filter = normalizeFilter(queryParams.filter);
    const search = normalizeSearch(queryParams.search);
    const now = Date.now();

    const query = {};

    if (user?.role === 'Student') {
      const studentProfile = await StudentProfile.findOne(
        { userId: user._id },
        { gender: 1, currentRoomAllocation: 1 }
      )
        .populate('currentRoomAllocation', 'hostelId')
        .lean();

      const studentHostelId = toObjectIdString(studentProfile?.currentRoomAllocation?.hostelId);
      const studentGender = studentProfile?.gender || null;

      query.hostelId = { $in: [studentHostelId || null, null] };
      query.gender = { $in: [studentGender || null, null] };
    } else if (user?.hostel) {
      const hostelId = toObjectIdString(user.hostel?._id || user.hostel);
      query.hostelId = { $in: [hostelId || null, null] };
    }

    const scopedEvents = await Event.find(query).lean();

    const upcomingEvents = scopedEvents
      .filter((event) => getEventTimestamp(event) > now)
      .sort((left, right) => getEventTimestamp(left) - getEventTimestamp(right));

    const pastEvents = scopedEvents
      .filter((event) => getEventTimestamp(event) <= now)
      .sort((left, right) => getEventTimestamp(right) - getEventTimestamp(left));

    let baseEvents;
    if (filter === 'upcoming') {
      baseEvents = upcomingEvents;
    } else if (filter === 'past') {
      baseEvents = pastEvents;
    } else {
      baseEvents = [...upcomingEvents, ...pastEvents];
    }

    const eventsAfterSearch = search ? filterEventsBySearch(baseEvents, search) : baseEvents;
    const total = eventsAfterSearch.length;
    const skip = (page - 1) * limit;

    return success({
      events: eventsAfterSearch.slice(skip, skip + limit),
      pagination: buildPagination(page, limit, total),
      stats: buildEventStats(scopedEvents),
      filters: {
        filter,
        search,
      },
    });
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
      await refreshCommonCache('events', { useLock: false }).catch((cacheError) => {
        console.error('Failed to sync events cache after create:', cacheError?.message || cacheError);
      });
      return success({ message: 'Event created successfully', event: result.data }, 201);
    }
    return result;
  }

  /**
   * Get events based on user role
   * @param {Object} user - Current user
   */
  async getEvents(user, queryParams = {}) {
    try {
      const page = parsePositiveInt(queryParams.page, DEFAULT_PAGE);
      const parsedLimit = parsePositiveInt(queryParams.limit, DEFAULT_LIMIT);
      const limit = Math.min(parsedLimit, MAX_LIMIT);
      const filter = normalizeFilter(queryParams.filter);
      const search = normalizeSearch(queryParams.search);

      const cachePayload = await getEventsCachePayload();
      const cachedAllEvents = Array.isArray(cachePayload?.all) ? cachePayload.all : [];
      const cachedUpcomingEvents = Array.isArray(cachePayload?.upcoming) ? cachePayload.upcoming : [];
      const cachedFirstPageAll = Array.isArray(cachePayload?.firstPage?.all) ? cachePayload.firstPage.all : [];
      const cachedFirstPageUpcoming = Array.isArray(cachePayload?.firstPage?.upcoming)
        ? cachePayload.firstPage.upcoming
        : [];

      let scopedAllEvents = cachedAllEvents;
      let scopedUpcomingEvents = cachedUpcomingEvents;
      let isScopedRequest = false;

      if (user?.role === 'Student') {
        isScopedRequest = true;
        const studentProfile = await StudentProfile.findOne(
          { userId: user._id },
          { gender: 1, currentRoomAllocation: 1 }
        )
          .populate('currentRoomAllocation', 'hostelId')
          .lean();

        const studentContext = {
          hostelId: toObjectIdString(studentProfile?.currentRoomAllocation?.hostelId),
          gender: studentProfile?.gender || null,
        };

        scopedAllEvents = cachedAllEvents.filter((event) => isEventVisibleToStudent(event, studentContext));
        scopedUpcomingEvents = cachedUpcomingEvents.filter((event) =>
          isEventVisibleToStudent(event, studentContext)
        );
      } else if (user?.hostel) {
        isScopedRequest = true;
        const hostelId = toObjectIdString(user.hostel?._id || user.hostel);
        scopedAllEvents = cachedAllEvents.filter((event) => isEventVisibleToHostel(event, hostelId));
        scopedUpcomingEvents = cachedUpcomingEvents.filter((event) => isEventVisibleToHostel(event, hostelId));
      }

      let baseEvents;
      if (filter === 'upcoming') {
        baseEvents = scopedUpcomingEvents;
      } else if (filter === 'past') {
        const now = Date.now();
        baseEvents = scopedAllEvents.filter((event) => getEventTimestamp(event) <= now);
      } else {
        baseEvents = scopedAllEvents;
      }

      const eventsAfterSearch = search ? filterEventsBySearch(baseEvents, search) : baseEvents;

      const total = eventsAfterSearch.length;
      const skip = (page - 1) * limit;

      let pagedEvents;
      const canUseGlobalFirstPageCache =
        !isScopedRequest && isDefaultFirstPageRequest({ page, limit, search });

      if (canUseGlobalFirstPageCache && filter === 'all') {
        pagedEvents = cachedFirstPageAll;
      } else if (canUseGlobalFirstPageCache && filter === 'upcoming') {
        pagedEvents = cachedFirstPageUpcoming;
      } else {
        pagedEvents = eventsAfterSearch.slice(skip, skip + limit);
      }

      return success({
        events: pagedEvents,
        pagination: buildPagination(page, limit, total),
        stats: buildEventStats(scopedAllEvents),
        filters: {
          filter,
          search,
        },
      });
    } catch (err) {
      console.error('Events cache path failed, falling back to database:', err?.message || err);
      try {
        return await this.getEventsFromDatabase(user, queryParams);
      } catch (fallbackError) {
        return error('Internal server error', 500, fallbackError?.message || err?.message);
      }
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
      await refreshCommonCache('events', { useLock: false }).catch((cacheError) => {
        console.error('Failed to sync events cache after update:', cacheError?.message || cacheError);
      });
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
      await refreshCommonCache('events', { useLock: false }).catch((cacheError) => {
        console.error('Failed to sync events cache after delete:', cacheError?.message || cacheError);
      });
      return success({ message: 'Event deleted successfully', success: true });
    }
    return result;
  }
}

export const eventService = new EventService();
