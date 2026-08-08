/**
 * Face Scanner Service
 * Handles all business logic for face scanner management
 */

import { scannerOwner } from "../../../../services/scanner/scannerOwner.service.js"
import { scannerQueries } from "../../../../services/scanner/scannerQueries.service.js"
import bcrypt from "bcrypt"
import crypto from "crypto"

const SALT_ROUNDS = 10

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
  const { name, type, direction, hostelId, catererId } = data

  // Generate credentials
  const { username, password } = generateSecureCredentials()
  const passwordHash = await hashPassword(password)

  const scanner = await scannerOwner.createScanner({
    username,
    passwordHash,
    name,
    type,
    direction,
    hostelId: type === "hostel-gate" ? hostelId || null : null,
    catererId: type === "dining-meal" ? catererId || null : null,
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
 * Update scanner (excludes password)
 * @param {string} id - Scanner ID
 * @param {Object} data - Update data
 * @returns {Promise<Object|null>}
 */
export const updateScanner = async (id, data) => {
  const { name, type, direction, hostelId, catererId, isActive } = data

  const updateData = {}
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
