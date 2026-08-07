/**
 * Accommodation type seeding / lookup.
 * Phase 1 ships a single type (parents-siblings). New categories (guest, intern)
 * are added as documents, not code.
 */

import { ACCOMMODATION_TYPE_KEYS } from "../../../../models/index.js"
import { accommodationOwner } from "../../../../services/accommodation/accommodationOwner.service.js"
import { accommodationQueries } from "../../../../services/accommodation/accommodationQueries.service.js"
import { STAGE, CW_AUTO_APPROVE_HOURS } from "./accommodation.constants.js"

export const DEFAULT_ACCOMMODATION_TYPES = [
  {
    key: ACCOMMODATION_TYPE_KEYS.PARENTS_SIBLINGS,
    label: "Parents / Siblings (Form H2)",
    isActive: true,
    eligibleRequesterRoles: ["Student"],
    requesterEmailDomain: "iiti.ac.in",
    approvalChain: [
      {
        stage: STAGE.FACULTY_ADVISOR,
        action: "recommend",
        viaToken: true,
        optional: true,
        approverSubRole: null,
        autoAdvanceAfterHours: null,
      },
      {
        stage: STAGE.CHIEF_WARDEN,
        action: "approve",
        viaToken: false,
        optional: false,
        approverSubRole: "Chief Warden",
        autoAdvanceAfterHours: CW_AUTO_APPROVE_HOURS,
      },
    ],
    requiredDocuments: ["addressProof"],
  },
]

// Idempotent: seeds any missing default types without overwriting edited ones.
export const ensureDefaultAccommodationTypes = async () => {
  for (const type of DEFAULT_ACCOMMODATION_TYPES) {
    await accommodationOwner.upsertDefaultType(type.key, type)
  }
}

export const getAccommodationType = async (key) => {
  await ensureDefaultAccommodationTypes()
  return accommodationQueries.findActiveTypeByKey(key)
}

export const listAccommodationTypes = async () => {
  await ensureDefaultAccommodationTypes()
  return accommodationQueries.listActiveTypes()
}
