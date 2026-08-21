/**
 * Signature Service
 * Self-service management of a user's certificate signature (position + name +
 * image or text), plus an admin directory of users who have a usable signature.
 *
 * The signature lives on the User document (`signature` subdoc). Images are stored
 * in the storage service (policy `signature-image`) and referenced here by media ref.
 */

import { userOwner } from "../../../../services/user/userOwner.service.js"
import { userQueries } from "../../../../services/user/userQueries.service.js"
import { success, badRequest, notFound } from "../../../../services/base/ServiceResponse.js"
import { ROLES } from "../../../../core/constants/roles.constants.js"

const text = (value) => String(value ?? "").trim()

const serializeSignature = (signature) => {
  if (!signature) return null
  return {
    type: signature.type === "text" ? "text" : "image",
    name: text(signature.name),
    position: text(signature.position),
    text: text(signature.text),
    imageRef: signature.imageRef || null,
    updatedAt: signature.updatedAt || null,
  }
}

/** A signature is usable on a certificate only if it has a name and either an image or text. */
const isUsableSignature = (signature) => {
  if (!signature || !text(signature.name)) return false
  if (signature.type === "image") return Boolean(signature.imageRef)
  if (signature.type === "text") return Boolean(text(signature.text))
  return false
}

class SignatureService {
  async getMySignature(user) {
    const doc = await userQueries.findUserById(user._id, { select: "signature", lean: true })
    return success({ signature: serializeSignature(doc?.signature) })
  }

  async updateMySignature(user, data = {}) {
    const type = data.type === "text" ? "text" : "image"
    // Session userData does not carry `name`, so fall back to the stored user.
    let displayName = text(data.name) || text(user.name)
    if (!displayName) {
      const stored = await userQueries.findUserById(user._id, { select: "name", lean: true })
      displayName = text(stored?.name)
    }
    const name = displayName

    if (!name) {
      return badRequest("A name is required for the signature")
    }

    // Students always sign as "Student"; everyone else sets their own designation.
    const position =
      user.role === ROLES.STUDENT
        ? "Student"
        : text(data.position) || text(user.subRole) || text(user.role)

    const signature = { type, name, position, updatedAt: new Date() }

    if (type === "image") {
      const imageRef = text(data.imageRef)
      if (!imageRef) return badRequest("Upload a signature image before saving")
      signature.imageRef = imageRef
      signature.text = ""
    } else {
      const signatureText = text(data.text)
      if (!signatureText) return badRequest("Enter your signature text before saving")
      signature.text = signatureText
      signature.imageRef = null
    }

    const updated = await userOwner.updateUserById(
      user._id,
      { $set: { signature } },
      { new: true, runValidators: true, select: "signature", lean: true }
    )

    return success({ signature: serializeSignature(updated?.signature) }, 200, "Signature saved")
  }

  async deleteMySignature(user) {
    await userOwner.updateUserById(user._id, { $unset: { signature: "" } })
    return success({ signature: null }, 200, "Signature removed")
  }

  /**
   * Admin directory: users who already have a usable signature, for the certificate
   * signatory picker. Returns metadata only (images are embedded at generation time).
   */
  async listSignatories({ search } = {}) {
    const query = {
      $or: [
        { "signature.type": "image", "signature.imageRef": { $nin: [null, ""] } },
        { "signature.type": "text", "signature.text": { $nin: [null, ""] } },
      ],
    }

    const term = text(search)
    if (term) {
      query.$and = [{ name: { $regex: term, $options: "i" } }]
    }

    const users = await userQueries.findUsers(query, { select: "name role subRole signature", lean: true })

    const signatories = users
      .filter((entry) => isUsableSignature(entry.signature))
      .map((entry) => ({
        userId: String(entry._id),
        name: text(entry.name),
        role: text(entry.role),
        subRole: text(entry.subRole),
        position: text(entry.signature?.position),
        type: entry.signature?.type === "text" ? "text" : "image",
        hasImage: Boolean(entry.signature?.imageRef),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))

    return success({ signatories })
  }
}

export const signatureService = new SignatureService()
export default signatureService
