import Joi from "joi"
import { objectId } from "../../../../validations/common.validation.js"
import {
  ELECTION_STATUS,
  ELECTION_PHASE,
  ELECTION_POST_CATEGORY,
  NOMINATION_STATUS,
} from "./elections.constants.js"

const rollNumber = Joi.string().trim().uppercase().max(30)
const url = Joi.string().uri().allow("")
const uploadedDocumentPath = Joi.string()
  .trim()
  .max(2000)
  .pattern(/^(\/uploads\/|https?:\/\/)/, "uploaded document path")

const eligibilityScopeSchema = Joi.object({
  batches: Joi.array().items(Joi.string().trim().max(100)).default([]),
  extraRollNumbers: Joi.array().items(rollNumber).default([]),
})

const postRequirementsSchema = Joi.object({
  minCgpa: Joi.number().min(0).max(10).default(6),
  minCompletedSemestersUg: Joi.number().integer().min(0).default(3),
  minCompletedSemestersPg: Joi.number().integer().min(0).default(1),
  minRemainingSemesters: Joi.number().integer().min(0).default(2),
  proposersRequired: Joi.number().integer().min(0).default(3),
  secondersRequired: Joi.number().integer().min(0).default(5),
  requireElectorateMembership: Joi.boolean().default(true),
  requireHostelResident: Joi.boolean().default(false),
  allowedHostelNames: Joi.array().items(Joi.string().trim().max(120)).default([]),
  notes: Joi.string().trim().max(2000).allow("").default(""),
})

const postSchema = Joi.object({
  id: objectId,
  title: Joi.string().trim().min(2).max(200).required(),
  code: Joi.string().trim().uppercase().max(60).allow("").default(""),
  category: Joi.string()
    .valid(...Object.values(ELECTION_POST_CATEGORY))
    .default(ELECTION_POST_CATEGORY.CUSTOM),
  description: Joi.string().trim().max(4000).allow("").default(""),
  candidateEligibility: eligibilityScopeSchema.required(),
  voterEligibility: eligibilityScopeSchema.required(),
  requirements: postRequirementsSchema.default(),
})

const timelineSchema = Joi.object({
  announcementAt: Joi.date().iso().required(),
  nominationStartAt: Joi.date().iso().required(),
  nominationEndAt: Joi.date().iso().required(),
  withdrawalEndAt: Joi.date().iso().required(),
  campaigningStartAt: Joi.date().iso().required(),
  campaigningEndAt: Joi.date().iso().required(),
  votingStartAt: Joi.date().iso().required(),
  votingEndAt: Joi.date().iso().required(),
  resultsAnnouncedAt: Joi.date().iso().required(),
  handoverAt: Joi.date().iso().allow(null),
})

export const electionIdSchema = Joi.object({
  id: objectId.required(),
})

export const nominationIdSchema = Joi.object({
  id: objectId.required(),
  nominationId: objectId.required(),
})

export const postIdSchema = Joi.object({
  id: objectId.required(),
  postId: objectId.required(),
})

export const createElectionSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
  academicYear: Joi.string().trim().min(4).max(50).required(),
  phase: Joi.string()
    .valid(...Object.values(ELECTION_PHASE))
    .default(ELECTION_PHASE.PHASE_1),
  description: Joi.string().trim().max(5000).allow("").default(""),
  status: Joi.string()
    .valid(...Object.values(ELECTION_STATUS))
    .default(ELECTION_STATUS.DRAFT),
  electionCommission: Joi.object({
    chiefElectionOfficerRollNumber: rollNumber.allow("").default(""),
    officerRollNumbers: Joi.array().items(rollNumber).max(12).default([]),
  }).default(),
  timeline: timelineSchema.required(),
  posts: Joi.array().items(postSchema).min(1).required(),
})

export const updateElectionSchema = createElectionSchema

export const listAdminElectionsSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  status: Joi.string().valid(...Object.values(ELECTION_STATUS)),
  phase: Joi.string().valid(...Object.values(ELECTION_PHASE)),
  search: Joi.string().trim().max(100),
})

export const upsertNominationSchema = Joi.object({
  pitch: Joi.string().trim().max(3000).allow("").default(""),
  agendaPoints: Joi.array().items(Joi.string().trim().max(200)).max(8).default([]),
  cgpa: Joi.number().min(0).max(10).required(),
  completedSemesters: Joi.number().integer().min(0).required(),
  remainingSemesters: Joi.number().integer().min(0).required(),
  proposerRollNumbers: Joi.array().items(rollNumber).min(0).max(20).default([]),
  seconderRollNumbers: Joi.array().items(rollNumber).min(0).max(20).default([]),
  gradeCardUrl: uploadedDocumentPath.required(),
  manifestoUrl: uploadedDocumentPath.allow("").default(""),
  attachments: Joi.array().items(
    Joi.object({
      label: Joi.string().trim().min(1).max(120).required(),
      url: Joi.string().uri().required(),
    })
  ).max(10).default([]),
})

export const reviewNominationSchema = Joi.object({
  status: Joi.string()
    .valid(NOMINATION_STATUS.VERIFIED, NOMINATION_STATUS.REJECTED)
    .required(),
  notes: Joi.string().trim().max(3000).allow("").default(""),
})

export const castVoteSchema = Joi.object({
  candidateNominationId: objectId.required(),
})

export const publishResultsSchema = Joi.object({
  posts: Joi.array().items(
    Joi.object({
      postId: objectId.required(),
      winnerNominationId: objectId.allow(null, ""),
      notes: Joi.string().trim().max(3000).allow("").default(""),
    })
  ).default([]),
})

export default {
  electionIdSchema,
  nominationIdSchema,
  postIdSchema,
  createElectionSchema,
  updateElectionSchema,
  listAdminElectionsSchema,
  upsertNominationSchema,
  reviewNominationSchema,
  castVoteSchema,
  publishResultsSchema,
}
