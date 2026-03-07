export const OCCURRENCE_STATUS = {
  ACTIVE: "active",
  CLOSED: "closed",
}

export const APPLICATION_STATUS = {
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
}

export const COURSEWORK_EVALUATION_MODES = [
  "ug_cgpa",
  "pg_cpi",
  "research_coursework_cpi",
]

export const PROJECT_TRACKS = ["btech_project", "pg_thesis"]

export const BTP_AWARD_POINTS = {
  none: 0,
  institute_best: 5,
  second: 4,
  third: 3,
  department_award_or_nomination: 2,
}

export const PROJECT_GRADE_POINTS = {
  none: 0,
  AP: 5,
  AA: 4,
  AB: 3,
  BB: 2,
  OTHER: 1,
}

export const PUBLICATION_POINTS = {
  journal_first_author: 4,
  journal_co_author: 2,
  patent_granted: 5,
  patent_filed: 2,
  patent_published: 3,
  conference_first_author: 2,
  conference_co_author: 1,
}

export const TECHNOLOGY_TRANSFER_POINTS = {
  lead_role: 4,
  supporting_role: 2,
}

export const RESPONSIBILITY_POINTS = {
  gymkhana_or_fluxus_coordinator_or_il_event_organiser: 5,
  club_head_or_placmgr_or_fluxus_head_or_senator: 4,
  organiser_of_national_level_event: 4,
  chair_of_scientific_body: 4,
  position_holder_in_scientific_body: 3,
  organiser_or_avana_or_coordinator: 3,
  team_member: 2,
  participation: 1,
}

export const AWARD_POINTS = {
  young_scientist_award: 7.5,
  incubator_generating_revenue: 5,
  international_award: 5,
  incubated_startup: 4,
  national_award: 3,
}

export const ACTIVITY_LEVEL_POINTS = {
  inter_iit_top_3: 5,
  inter_iit_top_5: 4,
  intra_iit_top_3: 3,
  intra_iit_top_5: 2,
  participation_inter_iit: 2,
  participation_intra_iit: 1,
}

export const CO_CURRICULAR_POINTS = {
  competitive_exam_topper: 4,
  competitive_exam_rank_2_5: 3,
  competitive_exam_rank_6_10: 2,
  competitive_exam_participation: 1,
  workshop: 2,
  social_service: 2,
}

export const SECTION_MAX_POINTS = {
  coursework: 15,
  projectThesis: 15,
  responsibilities: 15,
  awards: 15,
  cultural: 10,
  scienceTechnology: 10,
  gamesSports: 10,
  coCurricular: 10,
}
