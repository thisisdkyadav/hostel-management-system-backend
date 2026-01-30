/**
 * Student Validation Schemas
 */

import Joi from 'joi';
import { objectId, email, phone, name } from './common.validation.js';

/**
 * Student profile schema (single)
 */
const studentProfileBody = Joi.object({
  name: name.required(),
  email: email.required(),
  rollNumber: Joi.string().required().trim(),
  phone: phone,
  gender: Joi.string().valid('Male', 'Female', 'Other'),
  dateOfBirth: Joi.date().iso(),
  address: Joi.string().max(500),
  department: Joi.string().max(100),
  degree: Joi.string().max(100),
  admissionDate: Joi.date().iso(),
  guardian: Joi.string().max(100),
  guardianPhone: phone,
  guardianEmail: email,
  hostel: objectId,
  room: objectId,
  profileImage: Joi.string().uri(),
});

/**
 * Create student profiles (single or bulk)
 * POST /api/student/profiles
 */
export const createStudentsProfilesSchema = Joi.object({
  body: Joi.alternatives().try(
    studentProfileBody,
    Joi.array().items(studentProfileBody).min(1).max(500)
  ),
});

/**
 * Update student profiles (single or bulk)
 * PUT /api/student/profiles
 */
export const updateStudentsProfilesSchema = Joi.object({
  body: Joi.alternatives().try(
    studentProfileBody.fork(
      ['name', 'email', 'rollNumber'],
      (schema) => schema.optional()
    ),
    Joi.array().items(
      studentProfileBody.fork(
        ['name', 'email', 'rollNumber'],
        (schema) => schema.optional()
      )
    ).min(1).max(500)
  ),
});

/**
 * Room allocation schema
 */
const roomAllocationBody = Joi.object({
  rollNumber: Joi.string().required(),
  roomId: objectId.required(),
});

/**
 * Update room allocations
 * PUT /api/student/:hostelId/room-allocations
 */
export const updateRoomAllocationsSchema = Joi.object({
  params: Joi.object({
    hostelId: objectId.required(),
  }),
  body: Joi.alternatives().try(
    roomAllocationBody,
    Joi.array().items(roomAllocationBody).min(1).max(500)
  ),
});

/**
 * Get students with filters
 * GET /api/student
 */
export const getStudentsSchema = Joi.object({
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().max(200),
    hostel: objectId,
    room: objectId,
    status: Joi.string().valid('active', 'inactive', 'graduated', 'suspended'),
    gender: Joi.string().valid('Male', 'Female', 'Other'),
    department: Joi.string().max(100),
    sortBy: Joi.string().max(50),
    sortOrder: Joi.string().valid('asc', 'desc'),
  }),
});

/**
 * Get student details by ID
 * GET /api/student/:userId
 */
export const getStudentDetailsSchema = Joi.object({
  params: Joi.object({
    userId: objectId.required(),
  }),
});

/**
 * Get multiple student details
 * POST /api/student/multiple
 */
export const getMultipleStudentDetailsSchema = Joi.object({
  body: Joi.object({
    userIds: Joi.array().items(objectId).min(1).max(100).required(),
  }),
});

/**
 * Update student profile
 * PUT /api/student/:userId
 */
export const updateStudentProfileSchema = Joi.object({
  params: Joi.object({
    userId: objectId.required(),
  }),
  body: Joi.object({
    name: name,
    email: email,
    rollNumber: Joi.string().trim(),
    phone: phone,
    gender: Joi.string().valid('Male', 'Female', 'Other'),
    dateOfBirth: Joi.date().iso(),
    address: Joi.string().max(500),
    department: Joi.string().max(100),
    degree: Joi.string().max(100),
    admissionDate: Joi.date().iso(),
    guardian: Joi.string().max(100),
    guardianPhone: phone,
    guardianEmail: email,
    profileImage: Joi.string().uri(),
  }),
});

/**
 * File complaint
 * POST /api/student/:userId/complaint
 */
export const fileComplaintSchema = Joi.object({
  params: Joi.object({
    userId: objectId.required(),
  }),
  body: Joi.object({
    title: Joi.string().min(5).max(200).required(),
    description: Joi.string().min(10).max(2000).required(),
    complaintType: Joi.string().max(50),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    attachments: Joi.array().items(Joi.string().uri()),
    location: Joi.string().max(200),
    hostel: objectId,
    roomNumber: Joi.string().max(20),
  }),
});

/**
 * Update complaint
 * PUT /api/student/complaint/:complaintId
 */
export const updateComplaintSchema = Joi.object({
  params: Joi.object({
    complaintId: objectId.required(),
  }),
  body: Joi.object({
    title: Joi.string().min(5).max(200),
    description: Joi.string().min(10).max(2000),
    complaintType: Joi.string().max(50),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    status: Joi.string().valid('pending', 'in_progress', 'resolved', 'closed'),
  }),
});

/**
 * Delete complaint
 * DELETE /api/student/complaint/:complaintId
 */
export const deleteComplaintSchema = Joi.object({
  params: Joi.object({
    complaintId: objectId.required(),
  }),
});

/**
 * Upload student ID card
 * POST /api/student/:userId/id-card
 */
export const uploadStudentIdCardSchema = Joi.object({
  params: Joi.object({
    userId: objectId.required(),
  }),
  body: Joi.object({
    front: Joi.string().required(),
    back: Joi.string().required(),
  }),
});

/**
 * Bulk update students status
 * PUT /api/student/bulk/status
 */
export const bulkUpdateStudentsStatusSchema = Joi.object({
  body: Joi.object({
    status: Joi.string().valid('active', 'inactive', 'graduated', 'suspended').required(),
    rollNumbers: Joi.array().items(Joi.string()).min(1).max(1000).required(),
  }),
});

/**
 * Bulk update day scholar details
 * PUT /api/student/bulk/day-scholar
 */
export const bulkUpdateDayScholarDetailsSchema = Joi.object({
  body: Joi.object({
    data: Joi.array().items(
      Joi.object({
        rollNumber: Joi.string().required(),
        isDayScholar: Joi.boolean().required(),
      })
    ).min(1).max(1000).required(),
  }),
});

export default {
  createStudentsProfilesSchema,
  updateStudentsProfilesSchema,
  updateRoomAllocationsSchema,
  getStudentsSchema,
  getStudentDetailsSchema,
  getMultipleStudentDetailsSchema,
  updateStudentProfileSchema,
  fileComplaintSchema,
  updateComplaintSchema,
  deleteComplaintSchema,
  uploadStudentIdCardSchema,
  bulkUpdateStudentsStatusSchema,
  bulkUpdateDayScholarDetailsSchema,
};
