/**
 * Certificate Owner Service
 * -------------------------
 * The single WRITE surface for the Certificate collection (certificates issued
 * to users). Every create/update/delete goes through here so the model is
 * mutated only inside `src/services/certificate/` (reads live in
 * certificateQueries.service.js).
 *
 * Methods return raw model results (doc or null); the app service owns the
 * response envelope + error handling, matching the behaviour it had under
 * BaseService.
 */

import { Certificate } from "../../models/index.js"

export const certificateOwner = {
  /** Create a certificate. Returns the created doc (throws on validation/dup). */
  async createCertificate(data) {
    return Certificate.create(data)
  },

  /** Update a certificate by id. Returns the updated doc, or null if not found. */
  async updateCertificate(id, updates) {
    return Certificate.findByIdAndUpdate(id, updates, { new: true, runValidators: true })
  },

  /** Delete a certificate by id. Returns the deleted doc, or null if not found. */
  async deleteCertificate(id) {
    return Certificate.findByIdAndDelete(id)
  },
}

export default certificateOwner
