/**
 * Lost and Found Service
 * Handles CRUD operations for lost and found items
 *
 * @module services/lostAndFound.service
 */

import { LostAndFound } from '../../../../models/index.js';
import { BaseService, success } from '../../../../services/base/index.js';
import {
  COMMON_CACHE_CONFIG,
  getLostAndFoundCachePayload,
  refreshCommonCache,
} from '../../../../services/cache/commonData.cache.js';

const STATUS_FILTERS = new Set(['all', 'active', 'claimed']);
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const FIRST_PAGE_LIMIT = COMMON_CACHE_CONFIG.firstPageLimit || DEFAULT_LIMIT;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeSearch = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const normalizeStatus = (value) => {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (STATUS_FILTERS.has(normalized)) return normalized;
  return 'all';
};

const isDefaultFirstPageRequest = ({ page, limit, status, search }) =>
  page === 1 && limit === FIRST_PAGE_LIMIT && status === 'all' && !search;

const toCanonicalStatus = (statusFilter) => {
  if (statusFilter === 'active') return 'Active';
  if (statusFilter === 'claimed') return 'Claimed';
  return null;
};

const getFoundTimestamp = (item) => {
  const timestamp = new Date(item?.dateFound).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const buildPagination = (page, limit, total) => ({
  page,
  limit,
  total,
  totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  hasMore: page * limit < total,
});

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
      await refreshCommonCache('lostAndFound', { useLock: false }).catch((cacheError) => {
        console.error(
          'Failed to sync lost-and-found cache after create:',
          cacheError?.message || cacheError
        );
      });
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
  async getLostAndFound(queryParams = {}) {
    const page = parsePositiveInt(queryParams.page, DEFAULT_PAGE);
    const parsedLimit = parsePositiveInt(queryParams.limit, DEFAULT_LIMIT);
    const limit = Math.min(parsedLimit, MAX_LIMIT);
    const status = normalizeStatus(queryParams.status);
    const search = normalizeSearch(queryParams.search);

    const cachePayload = await getLostAndFoundCachePayload();
    const items = Array.isArray(cachePayload?.all) ? cachePayload.all : [];
    const firstPageAll = Array.isArray(cachePayload?.firstPage?.all) ? cachePayload.firstPage.all : [];
    const cachedStats = cachePayload?.stats || {
      total: items.length,
      active: items.filter((item) => item?.status === 'Active').length,
      claimed: items.filter((item) => item?.status === 'Claimed').length,
      latestItemDate: items[0]?.dateFound || null,
    };

    const canonicalStatus = toCanonicalStatus(status);
    const filteredItems = items
      .filter((item) => {
        if (canonicalStatus && item?.status !== canonicalStatus) return false;
        if (!search) return true;

        const itemName = typeof item?.itemName === 'string' ? item.itemName.toLowerCase() : '';
        const description = typeof item?.description === 'string' ? item.description.toLowerCase() : '';
        const itemId = item?._id?.toString?.().toLowerCase?.() || '';
        return itemName.includes(search) || description.includes(search) || itemId.includes(search);
      })
      .sort((itemA, itemB) => getFoundTimestamp(itemB) - getFoundTimestamp(itemA));

    const total = filteredItems.length;
    const skip = (page - 1) * limit;
    const pagedItems = isDefaultFirstPageRequest({ page, limit, status, search })
      ? firstPageAll
      : filteredItems.slice(skip, skip + limit);

    return success({
      lostAndFoundItems: pagedItems,
      pagination: buildPagination(page, limit, total),
      stats: cachedStats,
      filters: {
        status,
        search,
      },
    });
  }

  /**
   * Update a lost and found item
   * @param {string} id - Item ID
   * @param {Object} data - Update data
   */
  async updateLostAndFound(id, data) {
    const result = await this.updateById(id, data);
    if (result.success) {
      await refreshCommonCache('lostAndFound', { useLock: false }).catch((cacheError) => {
        console.error(
          'Failed to sync lost-and-found cache after update:',
          cacheError?.message || cacheError
        );
      });
      return success({
        message: 'Lost and found item updated successfully',
        success: true,
        lostAndFoundItem: result.data,
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
      await refreshCommonCache('lostAndFound', { useLock: false }).catch((cacheError) => {
        console.error(
          'Failed to sync lost-and-found cache after delete:',
          cacheError?.message || cacheError
        );
      });
      return success({ message: 'Lost and found item deleted successfully', success: true });
    }
    return result;
  }
}

export const lostAndFoundService = new LostAndFoundService();
