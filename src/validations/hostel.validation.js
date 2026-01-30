/**
 * Hostel Validation Schemas
 */

import Joi from 'joi';
import { objectId, name } from './common.validation.js';

/**
 * Create hostel
 * POST /api/hostel
 */
export const createHostelSchema = Joi.object({
  body: Joi.object({
    name: name.required(),
    code: Joi.string().max(20).required(),
    type: Joi.string().valid('boys', 'girls', 'mixed').required(),
    address: Joi.string().max(500),
    totalCapacity: Joi.number().integer().min(1),
    description: Joi.string().max(1000),
    amenities: Joi.array().items(Joi.string().max(50)),
    contactNumber: Joi.string().pattern(/^[0-9]{10}$/),
    wardenId: objectId,
  }),
});

/**
 * Update hostel
 * PUT /api/hostel/:id
 */
export const updateHostelSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    name: name,
    code: Joi.string().max(20),
    type: Joi.string().valid('boys', 'girls', 'mixed'),
    address: Joi.string().max(500),
    totalCapacity: Joi.number().integer().min(1),
    description: Joi.string().max(1000),
    amenities: Joi.array().items(Joi.string().max(50)),
    contactNumber: Joi.string().pattern(/^[0-9]{10}$/),
    wardenId: objectId,
    isActive: Joi.boolean(),
  }),
});

/**
 * Get hostel by ID
 * GET /api/hostel/:id
 */
export const getHostelByIdSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
});

/**
 * Create room
 * POST /api/hostel/:id/rooms
 */
export const createRoomSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    roomNumber: Joi.string().max(20).required(),
    floor: Joi.number().integer().min(0),
    capacity: Joi.number().integer().min(1).max(10).required(),
    type: Joi.string().valid('single', 'double', 'triple', 'quad').default('double'),
    amenities: Joi.array().items(Joi.string().max(50)),
    isActive: Joi.boolean().default(true),
  }),
});

/**
 * Create unit (building/block)
 * POST /api/hostel/:id/units
 */
export const createUnitSchema = Joi.object({
  params: Joi.object({
    id: objectId.required(),
  }),
  body: Joi.object({
    name: name.required(),
    floors: Joi.number().integer().min(1).max(50),
    roomsPerFloor: Joi.number().integer().min(1).max(100),
  }),
});

/**
 * Get hostels with filters
 * GET /api/hostel
 */
export const getHostelsSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    type: Joi.string().valid('boys', 'girls', 'mixed'),
    isActive: Joi.boolean(),
    search: Joi.string().max(200),
  }),
});

export default {
  createHostelSchema,
  updateHostelSchema,
  getHostelByIdSchema,
  createRoomSchema,
  createUnitSchema,
  getHostelsSchema,
};
