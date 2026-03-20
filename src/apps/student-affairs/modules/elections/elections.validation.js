import Joi from "joi"
import { objectId } from "../../../../validations/common.validation.js"
import {
  ELECTION_STATUS,
  ELECTION_PHASE,
  ELECTION_POST_CATEGORY,
  NOMINATION_STATUS,
} from "./elections.constants.js"

const rollNumber = Joi.string().trim().uppercase().max(30)
const nominationSelection = Joi.alternatives().try(objectId, Joi.string().valid("nota"))
const uploadedPdfPath = Joi.string()
  .trim()
  .max(2000)
  .pattern(/^(\/uploads\/|https?:\/\/).+\.pdf(\?.*)?$/i, "uploaded PDF path")

const eligibilityScopeSchema = Joi.object({
  batches: Joi.array().items(Joi.string().trim().max(100)).default([]),
  extraRollNumbers: Joi.array().items(rollNumber).default([]),
})

export const scopeCountSchema = eligibilityScopeSchema.required()

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

export const supporterLookupQuerySchema = Joi.object({
  rollNumber: rollNumber.required(),
  supportType: Joi.string().valid("proposer", "seconder").required(),
  nominationId: objectId.allow("", null).default(""),
})

export const supporterConfirmationTokenSchema = Joi.object({
  token: Joi.string().trim().min(20).max(300).required(),
})

export const ballotTokenSchema = supporterConfirmationTokenSchema

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

export const cloneElectionSchema = Joi.object({
  title: Joi.string().trim().min(3).max(200).required(),
})

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
  hasNoActiveBacklogs: Joi.boolean().valid(true).required(),
  proposerRollNumbers: Joi.array().items(rollNumber).min(0).max(20).default([]),
  seconderRollNumbers: Joi.array().items(rollNumber).min(0).max(20).default([]),
  gradeCardUrl: uploadedPdfPath.required(),
  manifestoUrl: uploadedPdfPath.allow("").default(""),
  porDocumentUrl: uploadedPdfPath.allow("").default(""),
  attachments: Joi.array().items(
    Joi.object({
      label: Joi.string().trim().min(1).max(120).required(),
      url: Joi.string().uri().required(),
    })
  ).max(10).default([]),
})

export const reviewNominationSchema = Joi.object({
  status: Joi.string()
    .valid(
      NOMINATION_STATUS.VERIFIED,
      NOMINATION_STATUS.MODIFICATION_REQUESTED,
      NOMINATION_STATUS.REJECTED
    )
    .required(),
  notes: Joi.when("status", {
    is: NOMINATION_STATUS.MODIFICATION_REQUESTED,
    then: Joi.string().trim().min(3).max(3000).required(),
    otherwise: Joi.string().trim().max(3000).allow("").default(""),
  }),
})

export const castVoteSchema = Joi.object({
  candidateNominationId: nominationSelection.required(),
})

export const supporterConfirmationResponseSchema = Joi.object({
  decision: Joi.string().valid("accepted", "rejected").required(),
})

export const submitBallotSchema = Joi.object({
  votes: Joi.array()
    .items(
      Joi.object({
        postId: objectId.required(),
        candidateNominationId: nominationSelection.required(),
      })
    )
    .min(1)
    .required(),
})

export const publishResultsSchema = Joi.object({
  posts: Joi.array().items(
    Joi.object({
      postId: objectId.required(),
      winnerNominationId: objectId.allow(null, ""),
      winnerNominationIds: Joi.array().items(nominationSelection).default([]),
      winnerIsNota: Joi.boolean().default(false),
      winnerIsTie: Joi.boolean().default(false),
      notes: Joi.string().trim().max(3000).allow("").default(""),
    })
  ).default([]),
})

export default {
  electionIdSchema,
  nominationIdSchema,
  postIdSchema,
  scopeCountSchema,
  supporterLookupQuerySchema,
  supporterConfirmationTokenSchema,
  ballotTokenSchema,
  createElectionSchema,
  updateElectionSchema,
  cloneElectionSchema,
  listAdminElectionsSchema,
  upsertNominationSchema,
  reviewNominationSchema,
  castVoteSchema,
  supporterConfirmationResponseSchema,
  submitBallotSchema,
  publishResultsSchema,
}
