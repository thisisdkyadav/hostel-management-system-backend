/**
 * Certificate Queries Service
 * ---------------------------
 * The single READ surface for the Certificate collection. The certificates
 * app-service reads through these instead of importing the model, so
 * Certificate is touched only inside `src/services/certificate/` (writes live
 * in certificateOwner.service.js).
 */

import { Certificate } from "../../models/index.js"

export const certificateQueries = {
  /**
   * A user's certificates, newest first, with the issuer/user populated.
   * Mirrors the previous `findAll({ userId }, { populate: PRESETS.CERTIFICATE })`
   * (default sort createdAt:-1; PRESETS.CERTIFICATE = userId name/email).
   */
  async findCertificatesByUser(userId) {
    return Certificate.find({ userId })
      .sort({ createdAt: -1 })
      .populate({ path: "userId", select: "name email" })
  },

  async findOneByCertificateUrl(certificateUrl, { select, lean } = {}) {
    let query = Certificate.findOne({ certificateUrl })
    if (select) query = query.select(select)
    if (lean) query = query.lean()
    return query
  },
}

export default certificateQueries
