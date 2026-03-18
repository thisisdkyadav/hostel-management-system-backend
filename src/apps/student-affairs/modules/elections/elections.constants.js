export const ELECTION_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
}

export const ELECTION_PHASE = {
  PHASE_1: "phase1",
  HORC: "horc",
  CUSTOM: "custom",
}

export const ELECTION_POST_CATEGORY = {
  EXECUTIVE: "executive",
  SENATOR: "senator",
  HORC: "horc",
  CUSTOM: "custom",
}

export const NOMINATION_STATUS = {
  SUBMITTED: "submitted",
  VERIFIED: "verified",
  MODIFICATION_REQUESTED: "modification_requested",
  REJECTED: "rejected",
  WITHDRAWN: "withdrawn",
}

export const NOMINATION_SUPPORTER_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
}

export const ELECTION_STAGE = {
  DRAFT: "draft",
  ANNOUNCED: "announced",
  NOMINATION: "nomination",
  WITHDRAWAL: "withdrawal",
  CAMPAIGNING: "campaigning",
  VOTING: "voting",
  RESULTS: "results",
  HANDOVER: "handover",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
}

export const DEFAULT_POST_REQUIREMENTS_BY_CATEGORY = {
  [ELECTION_POST_CATEGORY.EXECUTIVE]: {
    minCgpa: 6,
    minCompletedSemestersUg: 3,
    minCompletedSemestersPg: 1,
    minRemainingSemesters: 2,
    proposersRequired: 3,
    secondersRequired: 5,
    requireElectorateMembership: true,
    requireHostelResident: false,
  },
  [ELECTION_POST_CATEGORY.SENATOR]: {
    minCgpa: 6,
    minCompletedSemestersUg: 1,
    minCompletedSemestersPg: 1,
    minRemainingSemesters: 2,
    proposersRequired: 2,
    secondersRequired: 3,
    requireElectorateMembership: true,
    requireHostelResident: false,
  },
  [ELECTION_POST_CATEGORY.HORC]: {
    minCgpa: 6,
    minCompletedSemestersUg: 1,
    minCompletedSemestersPg: 1,
    minRemainingSemesters: 2,
    proposersRequired: 2,
    secondersRequired: 3,
    requireElectorateMembership: true,
    requireHostelResident: true,
  },
  [ELECTION_POST_CATEGORY.CUSTOM]: {
    minCgpa: 6,
    minCompletedSemestersUg: 1,
    minCompletedSemestersPg: 1,
    minRemainingSemesters: 2,
    proposersRequired: 1,
    secondersRequired: 1,
    requireElectorateMembership: true,
    requireHostelResident: false,
  },
}

export default {
  ELECTION_STATUS,
  ELECTION_PHASE,
  ELECTION_POST_CATEGORY,
  NOMINATION_STATUS,
  NOMINATION_SUPPORTER_STATUS,
  ELECTION_STAGE,
  DEFAULT_POST_REQUIREMENTS_BY_CATEGORY,
}
