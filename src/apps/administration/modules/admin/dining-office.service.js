/**
 * Dining Office Service
 * CRUD for Dining-role / Office sub-role logins (mess administration staff).
 * Mirrors the warden staff-management pattern.
 *
 * @module services/dining-office
 */

import bcrypt from "bcrypt"

import { User, DiningOfficeStaff } from "../../../../models/index.js"
import { success, notFound, badRequest } from "../../../../services/base/index.js"
import { ROLES, DINING_SUBROLES, DINING_OFFICE_CATEGORIES } from "../../../../core/constants/roles.constants.js"

const isValidCategory = (category) => DINING_OFFICE_CATEGORIES.includes(category)

const serializeStaff = (staff) => ({
  id: staff._id,
  userId: staff.userId?._id || staff.userId,
  name: staff.userId?.name || "",
  email: staff.userId?.email || "",
  phone: staff.userId?.phone || "",
  profileImage: staff.userId?.profileImage || null,
  category: staff.category,
  status: staff.status || "active",
  joinDate: staff.joinDate ? staff.joinDate.toISOString().split("T")[0] : null,
})

export const getAllDiningOfficeStaff = async () => {
  const staff = await DiningOfficeStaff.find()
    .populate("userId", "name email phone profileImage")
    .lean()

  const formatted = staff
    .filter((entry) => entry.userId)
    .map(serializeStaff)
    .sort((a, b) => a.name.localeCompare(b.name))

  return success(formatted)
}

export const createDiningOfficeStaff = async (payload) => {
  const { name, email, password, category, phone, joinDate } = payload || {}

  if (!name || !email || !password) {
    return badRequest("Name, email, and password are required")
  }

  if (!isValidCategory(category)) {
    return badRequest(`Category must be one of: ${DINING_OFFICE_CATEGORIES.join(", ")}`)
  }

  const existingUser = await User.findOne({ email: { $regex: new RegExp(`^${email}$`, "i") } })
  if (existingUser) {
    return badRequest("A user with this email already exists")
  }

  const salt = await bcrypt.genSalt(10)
  const hashedPassword = await bcrypt.hash(password, salt)

  const newUser = await User.create({
    name,
    email,
    password: hashedPassword,
    role: ROLES.DINING,
    subRole: DINING_SUBROLES.OFFICE,
    phone: phone || "",
  })

  await DiningOfficeStaff.create({
    userId: newUser._id,
    category,
    joinDate: joinDate || Date.now(),
  })

  return success(null, 201, "Dining office login created successfully")
}

export const updateDiningOfficeStaff = async (id, payload) => {
  const { name, phone, category, status, joinDate } = payload || {}

  const staff = await DiningOfficeStaff.findById(id).select("userId")
  if (!staff) {
    return notFound("Dining office login")
  }

  if (category !== undefined && !isValidCategory(category)) {
    return badRequest(`Category must be one of: ${DINING_OFFICE_CATEGORIES.join(", ")}`)
  }

  const staffUpdate = {}
  const userUpdate = {}

  if (category !== undefined) staffUpdate.category = category
  if (status !== undefined) staffUpdate.status = status
  if (joinDate !== undefined) staffUpdate.joinDate = joinDate
  if (name !== undefined) userUpdate.name = name
  if (phone !== undefined) userUpdate.phone = phone

  if (Object.keys(userUpdate).length === 0 && Object.keys(staffUpdate).length === 0) {
    return badRequest("No update data provided")
  }

  if (Object.keys(userUpdate).length > 0) {
    await User.findByIdAndUpdate(staff.userId, userUpdate)
  }
  if (Object.keys(staffUpdate).length > 0) {
    await DiningOfficeStaff.findByIdAndUpdate(id, staffUpdate)
  }

  return success(null, 200, "Dining office login updated successfully")
}

export const deleteDiningOfficeStaff = async (id) => {
  const staff = await DiningOfficeStaff.findByIdAndDelete(id)
  if (!staff) {
    return notFound("Dining office login")
  }

  await User.findByIdAndDelete(staff.userId)

  return success(null, 200, "Dining office login deleted successfully")
}
