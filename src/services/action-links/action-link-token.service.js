import crypto from "crypto"
import { ActionLinkToken } from "../../models/index.js"
import { SESSION_SECRET } from "../../config/env.config.js"

const DEFAULT_TOKEN_BYTES = 48
const TOKEN_ENCRYPTION_ALGO = "aes-256-gcm"
const TOKEN_ENCRYPTION_KEY = crypto
  .createHash("sha256")
  .update(String(SESSION_SECRET || "hms-action-link-secret"))
  .digest()

export const ACTION_LINK_TOKEN_TYPE = {
  COMPLAINT_FEEDBACK: "complaint_feedback",
  ELECTION_NOMINATION_SUPPORT: "election_nomination_support",
  ELECTION_VOTING_BALLOT: "election_voting_ballot",
}

export const hashActionLinkToken = (rawToken) =>
  crypto.createHash("sha256").update(String(rawToken || "")).digest("hex")

export const generateRawActionLinkToken = () =>
  crypto.randomBytes(DEFAULT_TOKEN_BYTES).toString("base64url")

export const encryptActionLinkToken = (rawToken) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(TOKEN_ENCRYPTION_ALGO, TOKEN_ENCRYPTION_KEY, iv)
  const encrypted = Buffer.concat([cipher.update(String(rawToken || ""), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export const decryptActionLinkToken = (tokenCiphertext = "") => {
  if (!tokenCiphertext) return ""

  const [ivPart, tagPart, encryptedPart] = String(tokenCiphertext || "").split(".")
  if (!ivPart || !tagPart || !encryptedPart) return ""

  try {
    const decipher = crypto.createDecipheriv(
      TOKEN_ENCRYPTION_ALGO,
      TOKEN_ENCRYPTION_KEY,
      Buffer.from(ivPart, "base64url")
    )
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"))
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, "base64url")),
      decipher.final(),
    ])
    return decrypted.toString("utf8")
  } catch {
    return ""
  }
}

export const createActionLinkToken = async ({
  type,
  subjectModel,
  subjectId,
  recipientUserId = null,
  recipientEmail = "",
  payload = {},
  expiresAt,
}) => {
  const rawToken = generateRawActionLinkToken()
  const tokenDoc = await ActionLinkToken.create({
    type,
    tokenHash: hashActionLinkToken(rawToken),
    tokenCiphertext: encryptActionLinkToken(rawToken),
    subjectModel,
    subjectId,
    recipientUserId,
    recipientEmail: String(recipientEmail || "").trim(),
    payload,
    expiresAt,
  })

  return { rawToken, tokenDoc }
}

export const findActionLinkTokenByRawToken = async (
  rawToken,
  {
    type = "",
    includeUsed = false,
    includeInvalidated = false,
  } = {}
) => {
  const filter = {
    tokenHash: hashActionLinkToken(rawToken),
  }

  if (type) {
    filter.type = type
  }
  if (!includeUsed) {
    filter.usedAt = null
  }
  if (!includeInvalidated) {
    filter.invalidatedAt = null
  }

  return ActionLinkToken.findOne(filter)
}

export const invalidateActionLinkTokens = async (filter = {}, reason = "") => {
  const normalizedFilter = {
    ...filter,
    invalidatedAt: null,
  }

  return ActionLinkToken.updateMany(normalizedFilter, {
    $set: {
      invalidatedAt: new Date(),
      invalidationReason: String(reason || "").trim(),
    },
  })
}

export const consumeActionLinkToken = async (tokenDoc, responsePayload = {}) => {
  if (!tokenDoc) return null

  tokenDoc.usedAt = new Date()
  tokenDoc.responsePayload = responsePayload
  await tokenDoc.save()
  return tokenDoc
}

export const isActionLinkTokenExpired = (tokenDoc) => {
  if (!tokenDoc?.expiresAt) return true
  return new Date(tokenDoc.expiresAt).getTime() < Date.now()
}

export const getRawActionLinkToken = (tokenDoc) => decryptActionLinkToken(tokenDoc?.tokenCiphertext || "")

export default {
  ACTION_LINK_TOKEN_TYPE,
  hashActionLinkToken,
  generateRawActionLinkToken,
  encryptActionLinkToken,
  decryptActionLinkToken,
  createActionLinkToken,
  findActionLinkTokenByRawToken,
  invalidateActionLinkTokens,
  consumeActionLinkToken,
  isActionLinkTokenExpired,
  getRawActionLinkToken,
}
