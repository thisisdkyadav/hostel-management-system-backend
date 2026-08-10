/**
 * Who to notify at each point of the accommodation workflow.
 *
 * The chain hands a request between five desks, and none of them share an
 * inbox — without a nudge, work only moves when somebody remembers to open the
 * queue. Every handoff therefore emails the desk that now owns the request.
 *
 * Lookups are best-effort: a notification must never break the transition that
 * triggered it, so failures resolve to an empty recipient list.
 */

import { ROLES, SUBROLES } from "../../../../core/constants/roles.constants.js"
import { userQueries } from "../../../../services/user/userQueries.service.js"
import { staffRolesQueries } from "../../../../services/user/staffRolesQueries.service.js"

const emailsOf = (users = []) =>
  [...new Set(users.map((u) => String(u?.email || "").trim().toLowerCase()).filter(Boolean))]

/** Active admins holding a given sub-role (Chief Warden / CW Office / Accountant). */
export const adminsWithSubRole = async (subRole) => {
  try {
    const users = await userQueries.findUsers(
      { role: ROLES.ADMIN, subRole },
      { select: "email name", lean: true }
    )
    return emailsOf(users)
  } catch (error) {
    console.error(`Accommodation: could not resolve ${subRole} recipients:`, error.message)
    return []
  }
}

/**
 * Hostel supervisors responsible for a hostel — their active hostel or any in
 * their assigned list. With no hostel (nothing allotted yet) nobody is paged.
 */
export const supervisorsForHostel = async (hostelId) => {
  if (!hostelId) return []
  try {
    const profiles = await staffRolesQueries.findManyByRole(
      "HostelSupervisor",
      { $or: [{ activeHostelId: hostelId }, { hostelIds: hostelId }] },
      { populate: { path: "userId", select: "email name" }, lean: true }
    )
    return emailsOf(profiles.map((p) => p.userId))
  } catch (error) {
    console.error("Accommodation: could not resolve supervisor recipients:", error.message)
    return []
  }
}

export const chiefWardenEmails = () => adminsWithSubRole(SUBROLES.CHIEF_WARDEN)
export const chiefWardenOfficeEmails = () => adminsWithSubRole(SUBROLES.CHIEF_WARDEN_OFFICE)
export const accountantEmails = () => adminsWithSubRole(SUBROLES.ACCOUNTANT)

export default {
  adminsWithSubRole,
  supervisorsForHostel,
  chiefWardenEmails,
  chiefWardenOfficeEmails,
  accountantEmails,
}
