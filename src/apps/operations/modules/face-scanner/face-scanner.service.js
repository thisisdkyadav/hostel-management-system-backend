/**
 * Face Scanner Service
 * Handles all business logic for face scanner management
 */

import { scannerOwner } from "../../../../services/scanner/scannerOwner.service.js"
import { scannerQueries } from "../../../../services/scanner/scannerQueries.service.js"
import bcrypt from "bcrypt"
import crypto from "crypto"
import { AppError } from "../../../../core/errors/AppError.js"

const SALT_ROUNDS = 10

const validateProvider = (provider, deviceName) => {
  if (provider !== undefined && !["time-watch", "zkteco"].includes(provider)) {
    throw new AppError("Provider must be Time Watch or ZKTeco", 400)
  }
  if (provider === "zkteco" && (typeof deviceName !== "string" || !deviceName.trim())) {
    throw new AppError("Device name (TERMINAL_ALIAS) is required for ZKTeco", 400)
  }
}

export const validateCredentials = async (username, password, excludeId) => {
  if (typeof username !== "string" || !username.trim() || username.includes(":")) {
    throw new AppError("Username must be non-empty and cannot contain a colon", 400)
  }
  if (typeof password !== "string" || !password || Buffer.byteLength(password, "utf8") > 72) {
    throw new AppError("Password must contain between 1 and 72 bytes", 400)
  }
  const existing = await scannerQueries.findScannersByUsername(username.trim())
  if (existing.some((scanner) => scanner.provider !== "zkteco")) {
    throw new AppError("This username is already used by a Time Watch or legacy scanner", 409)
  }
  const account = await scannerQueries.findAccountByUsername(username.trim())
  if (account && String(account._id) !== String(excludeId)) {
    throw new AppError("This username is already used by a scanner account", 409)
  }
}

const requireAccount = async (accountId) => {
  if (!accountId) throw new AppError("Account is required for ZKTeco", 400)
  if (!(await scannerQueries.findAccountById(accountId))) throw new AppError("Scanner account not found", 400)
}

const rejectDeviceCredentials = (data) => {
  if (data.username !== undefined || data.password !== undefined || data.passwordHash !== undefined) {
    throw new AppError("Credentials belong to the scanner's account", 400)
  }
}

/**
 * Generate secure random credentials for a scanner
 * @returns {{ username: string, password: string }}
 */
export const generateSecureCredentials = () => {
  const username = `scanner-${crypto.randomBytes(8).toString("hex")}`
  const password = crypto.randomBytes(16).toString("base64url")
  return { username, password }
}

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
export const hashPassword = async (password) => {
  return bcrypt.hash(password, SALT_ROUNDS)
}

/**
 * Create a new face scanner
 * @param {Object} data - Scanner data
 * @returns {Promise<{ scanner: Object, plainPassword: string }>}
 */
export const createScanner = async (data) => {
  const { name, type, direction, hostelId, catererId, provider, deviceName } = data
  validateProvider(provider, deviceName)

  let username, password, passwordHash
  if (provider === "zkteco") {
    rejectDeviceCredentials(data)
    await requireAccount(data.accountId)
  } else {
    if (data.username !== undefined || data.password !== undefined) {
      throw new AppError("Custom credentials are supported for ZKTeco only", 400)
    }
    const generated = generateSecureCredentials()
    username = generated.username
    password = generated.password
    await validateCredentials(username, password)
    passwordHash = await hashPassword(password)
  }

  const scanner = await scannerOwner.createScanner({
    username,
    accountId: provider === "zkteco" ? data.accountId : undefined,
    passwordHash,
    provider,
    deviceName: provider === "zkteco" ? deviceName.trim() : undefined,
    name,
    type,
    direction,
    hostelId: type === "hostel-gate" ? hostelId || null : null,
    catererId: type === "dining-meal" ? catererId || null : null,
    ...(typeof data.isActive === "boolean" ? { isActive: data.isActive } : {}),
  })

  // Return scanner with plain password (shown only once)
  return {
    scanner,
    plainPassword: password,
  }
}

/**
 * Get all scanners with optional filters
 * @param {Object} filters - Filter options
 * @returns {Promise<Array>}
 */
export const getAllScanners = async (filters = {}) => {
  const query = {}

  if (filters.type) query.type = filters.type
  if (filters.accountId) query.accountId = filters.accountId
  if (filters.provider) query.provider = filters.provider
  if (filters.direction) query.direction = filters.direction
  if (filters.hostelId) query.hostelId = filters.hostelId
  if (filters.catererId) query.catererId = filters.catererId
  if (filters.isActive !== undefined) query.isActive = filters.isActive === "true"

  const scanners = await scannerQueries.listScanners(query)

  return scanners
}

/**
 * Get scanner by ID
 * @param {string} id - Scanner ID
 * @returns {Promise<Object|null>}
 */
export const getScannerById = async (id) => {
  const scanner = await scannerQueries.findScannerByIdPopulatedLean(id)
  return scanner
}

/**
 * Update scanner settings, including ZKTeco account membership.
 * @param {string} id - Scanner ID
 * @param {Object} data - Update data
 * @returns {Promise<Object|null>}
 */
export const updateScanner = async (id, data) => {
  const { name, type, direction, hostelId, catererId, isActive, provider, deviceName, username, password } = data
  const current = await scannerQueries.findScannerById(id)
  if (!current) return null
  const nextProvider = provider === undefined ? current.provider : provider
  validateProvider(nextProvider, deviceName === undefined ? current.deviceName : deviceName)

  const updateData = {}
  if (current.provider === "zkteco" && nextProvider !== "zkteco") {
    throw new AppError("Create a new scanner to switch from ZKTeco to Time Watch", 400)
  }
  if (provider !== undefined) updateData.provider = provider
  if (nextProvider === "zkteco") {
    rejectDeviceCredentials(data)
    const accountId = data.accountId === undefined ? current.accountId : data.accountId
    await requireAccount(accountId)
    updateData.accountId = accountId
    if (deviceName !== undefined) updateData.deviceName = deviceName.trim()
    updateData.$unset = { username: 1, passwordHash: 1 }
  } else {
    if (username !== undefined || password !== undefined) {
      throw new AppError("Custom credentials are supported for ZKTeco only", 400)
    }
    if (provider === "time-watch") {
      updateData.$unset = { deviceName: 1 }
      const existing = await scannerQueries.findScannersByUsername(current.username)
      const account = await scannerQueries.findAccountByUsername(current.username)
      if (account || existing.some((scanner) => String(scanner._id) !== String(id))) {
        throw new AppError("Time Watch requires a unique username. Configure a unique username before changing provider.", 409)
      }
    }
  }
  if (name !== undefined) updateData.name = name
  if (type !== undefined) updateData.type = type
  if (direction !== undefined) updateData.direction = direction
  if (hostelId !== undefined) updateData.hostelId = hostelId || null
  if (catererId !== undefined) updateData.catererId = catererId || null
  if (isActive !== undefined) updateData.isActive = isActive

  const scanner = await scannerOwner.updateScannerById(id, updateData)

  return scanner
}

/**
 * Delete scanner
 * @param {string} id - Scanner ID
 * @returns {Promise<boolean>}
 */
export const deleteScanner = async (id) => {
  const result = await scannerOwner.deleteScannerById(id)
  return !!result
}

/**
 * Regenerate scanner password
 * @param {string} id - Scanner ID
 * @returns {Promise<{ scanner: Object, plainPassword: string }|null>}
 */
export const regeneratePassword = async (id) => {
  const scanner = await scannerQueries.findScannerById(id)
  if (!scanner) return null

  if (scanner.provider === "zkteco") throw new AppError("Credentials belong to the scanner's account", 400)

  const password = crypto.randomBytes(16).toString("base64url")
  const passwordHash = await hashPassword(password)

  scanner.passwordHash = passwordHash
  await scannerOwner.persistScanner(scanner)

  return {
    scanner,
    plainPassword: password,
  }
}

export default {
  generateSecureCredentials,
  hashPassword,
  createScanner,
  getAllScanners,
  getScannerById,
  updateScanner,
  deleteScanner,
  regeneratePassword,
}
