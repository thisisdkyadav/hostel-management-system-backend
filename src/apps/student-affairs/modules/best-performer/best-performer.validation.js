import Joi from "joi"

const objectIdSchema = Joi.string().trim().hex().length(24)

const proofSchema = Joi.object({
  label: Joi.string().trim().allow("").max(120),
  url: Joi.string().trim().required().max(4000),
})

const referenceSchema = Joi.object({
  name: Joi.string().trim().required().max(160),
  designation: Joi.string().trim().required().max(160),
  department: Joi.string().trim().required().max(160),
  phoneNumber: Joi.string().trim().required().max(40),
})

const scoredItemSchema = Joi.object({
  year: Joi.string().trim().allow("").max(40),
  title: Joi.string().trim().required().max(300),
  level: Joi.string().trim().allow("").max(120),
  eventName: Joi.string().trim().allow("").max(300),
  performance: Joi.string().trim().allow("").max(300),
  participationType: Joi.string().trim().valid("individual", "team").default("individual"),
  referenceCode: Joi.string().trim().allow("").max(40),
  scoreType: Joi.string().trim().required().max(120),
  notes: Joi.string().trim().allow("").max(1000),
  proofs: Joi.array().items(proofSchema).default([]),
})

export const occurrenceIdSchema = Joi.object({
  id: objectIdSchema.required(),
})

export const applicationIdSchema = Joi.object({
  id: objectIdSchema.required(),
})

export const createOccurrenceSchema = Joi.object({
  title: Joi.string().trim().required().max(200),
  awardYear: Joi.number().integer().min(2000).max(3000).required(),
  description: Joi.string().trim().allow("").max(4000),
  applyEndAt: Joi.date().iso().required(),
  eligibleRollNumbers: Joi.array().items(Joi.string().trim().required()).min(1).max(5000).required(),
})

export const updateOccurrenceSchema = Joi.object({
  title: Joi.string().trim().max(200),
  description: Joi.string().trim().allow("").max(4000),
  applyEndAt: Joi.date().iso(),
  eligibleRollNumbers: Joi.array().items(Joi.string().trim().required()).min(1).max(5000),
}).min(1)

export const upsertApplicationSchema = Joi.object({
  personalAcademic: Joi.object({
    programme: Joi.string().trim().allow("").max(160),
    department: Joi.string().trim().allow("").max(160),
    hostelAddress: Joi.string().trim().allow("").max(400),
    homeAddress: Joi.string().trim().allow("").max(400),
    mobileNumber: Joi.string().trim().allow("").max(40),
    facultyAdvisorName: Joi.string().trim().allow("").max(160),
    facultyAdvisorPhone: Joi.string().trim().allow("").max(40),
    projectGuideName: Joi.string().trim().allow("").max(160),
    projectGuidePhone: Joi.string().trim().allow("").max(40),
    thesisGuideName: Joi.string().trim().allow("").max(160),
    thesisGuidePhone: Joi.string().trim().allow("").max(40),
    references: Joi.array().items(referenceSchema).length(3).required(),
    isPassingOutStudent: Joi.boolean().valid(true).required(),
    hasNoDisciplinaryAction: Joi.boolean().valid(true).required(),
    hasNoFrGrade: Joi.boolean().valid(true).required(),
    declarationAccepted: Joi.boolean().valid(true).required(),
  }).required(),
  coursework: Joi.object({
    evaluationMode: Joi.string().trim().valid("ug_cgpa", "pg_cpi", "research_coursework_cpi").required(),
    scoreValue: Joi.number().min(6.5).max(10).required(),
    notes: Joi.string().trim().allow("").max(1000),
  }).required(),
  projectThesis: Joi.object({
    track: Joi.string().trim().valid("btech_project", "pg_thesis").required(),
    btpAwardLevel: Joi.string()
      .trim()
      .valid("none", "institute_best", "second", "third", "department_award_or_nomination")
      .default("none"),
    projectGrade: Joi.string().trim().valid("none", "AP", "AA", "AB", "BB", "OTHER").default("none"),
    publicationItems: Joi.array().items(scoredItemSchema).default([]),
    technologyTransferItems: Joi.array().items(scoredItemSchema).default([]),
  }).required(),
  responsibilityItems: Joi.array().items(scoredItemSchema).default([]),
  awardItems: Joi.array().items(scoredItemSchema).default([]),
  culturalItems: Joi.array().items(scoredItemSchema).default([]),
  scienceTechnologyItems: Joi.array().items(scoredItemSchema).default([]),
  gamesSportsItems: Joi.array().items(scoredItemSchema).default([]),
  coCurricularItems: Joi.array().items(scoredItemSchema).default([]),
})

export const reviewApplicationSchema = Joi.object({
  decision: Joi.string().trim().valid("approved", "rejected").required(),
  remarks: Joi.string().trim().allow("").max(2000),
})
