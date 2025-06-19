import FamilyMember from "../models/FamilyMember.js"
import User from "../models/User.js"
import StudentProfile from "../models/StudentProfile.js"
import mongoose from "mongoose"

export const createFamilyMember = async (req, res) => {
  const { name, relationship, phone, email, address } = req.body
  const userId = req.params.userId
  try {
    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    const familyMember = await FamilyMember.create({ userId, name, relationship, phone, email, address })
    res.status(201).json({ message: "Family member created successfully", familyMember })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const getFamilyMembers = async (req, res) => {
  const userId = req.params.userId
  try {
    const familyMembers = await FamilyMember.find({ userId })
    res.status(200).json({ message: "Family members fetched successfully", data: familyMembers })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const updateFamilyMember = async (req, res) => {
  const { id } = req.params
  const { name, relationship, phone, email, address } = req.body
  try {
    const familyMember = await FamilyMember.findByIdAndUpdate(id, { name, relationship, phone, email, address }, { new: true })
    res.status(200).json({ message: "Family member updated successfully", familyMember })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const deleteFamilyMember = async (req, res) => {
  const { id } = req.params
  try {
    await FamilyMember.findByIdAndDelete(id)
    res.status(200).json({ message: "Family member deleted successfully" })
  } catch (error) {
    res.status(500).json({ message: "Internal server error", error: error.message })
  }
}

export const updateBulkFamilyMembers = async (req, res) => {
  const { familyData } = req.body

  if (!familyData || !Array.isArray(familyData.members) || familyData.members.length === 0) {
    return res.status(400).json({ message: "Valid family members data is required" })
  }

  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Extract all roll numbers from the request
    const rollNumbers = [...new Set(familyData.members.map((member) => member.rollNumber.toUpperCase()))]

    // Find student profiles by roll numbers
    const studentProfiles = await StudentProfile.find({
      rollNumber: { $in: rollNumbers },
    }).session(session)

    if (studentProfiles.length === 0) {
      await session.abortTransaction()
      return res.status(404).json({ message: "No students found with the provided roll numbers" })
    }

    // Create mappings for easier processing
    const studentProfileMap = {}
    studentProfiles.forEach((profile) => {
      studentProfileMap[profile.rollNumber] = profile
    })

    // Track results
    const results = {
      success: [],
      notFound: [],
      failed: [],
    }

    // If deleteExisting is true, remove all existing family members for these students
    if (familyData.deleteExisting) {
      const userIds = studentProfiles.map((profile) => profile.userId)
      await FamilyMember.deleteMany({
        userId: { $in: userIds },
      }).session(session)
    }

    // Process each family member
    const familyMembersToCreate = []

    for (const member of familyData.members) {
      const rollNumber = member.rollNumber.toUpperCase()

      // Check if student exists
      if (!studentProfileMap[rollNumber]) {
        results.notFound.push(rollNumber)
        continue
      }

      const studentProfile = studentProfileMap[rollNumber]

      // Prepare family member data
      familyMembersToCreate.push({
        userId: studentProfile.userId,
        name: member.name,
        relationship: member.relationship || "",
        phone: member.phone || "",
        email: member.email || "",
        address: member.address || "",
      })

      results.success.push({
        rollNumber,
        name: member.name,
        userId: studentProfile.userId,
      })
    }

    // Bulk create family members
    if (familyMembersToCreate.length > 0) {
      await FamilyMember.insertMany(familyMembersToCreate, { session })
    }

    // Commit the transaction
    await session.commitTransaction()

    res.status(200).json({
      success: true,
      message: "Family members updated successfully",
      data: {
        totalUpdated: results.success.length,
        totalProcessed: familyData.members.length,
        notFoundCount: results.notFound.length,
        failedCount: results.failed.length,
        notFound: results.notFound,
        failed: results.failed,
      },
    })
  } catch (error) {
    await session.abortTransaction()
    res.status(500).json({ message: "Server error", error: error.message })
  } finally {
    session.endSession()
  }
}
