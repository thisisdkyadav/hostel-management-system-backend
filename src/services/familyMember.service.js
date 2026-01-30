import FamilyMember from "../../models/FamilyMember.js"
import User from "../../models/User.js"
import StudentProfile from "../../models/StudentProfile.js"
import mongoose from "mongoose"

class FamilyMemberService {
  async createFamilyMember(userId, data) {
    const { name, relationship, phone, email, address } = data
    try {
      const user = await User.findById(userId)
      if (!user) {
        return { success: false, statusCode: 404, message: "User not found" }
      }
      const familyMember = await FamilyMember.create({ userId, name, relationship, phone, email, address })
      return { success: true, statusCode: 201, data: { message: "Family member created successfully", familyMember } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Internal server error", error: error.message }
    }
  }

  async getFamilyMembers(userId) {
    try {
      const familyMembers = await FamilyMember.find({ userId })
      return { success: true, statusCode: 200, data: { message: "Family members fetched successfully", data: familyMembers } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Internal server error", error: error.message }
    }
  }

  async updateFamilyMember(id, data) {
    const { name, relationship, phone, email, address } = data
    try {
      const familyMember = await FamilyMember.findByIdAndUpdate(id, { name, relationship, phone, email, address }, { new: true })
      return { success: true, statusCode: 200, data: { message: "Family member updated successfully", familyMember } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Internal server error", error: error.message }
    }
  }

  async deleteFamilyMember(id) {
    try {
      await FamilyMember.findByIdAndDelete(id)
      return { success: true, statusCode: 200, data: { message: "Family member deleted successfully" } }
    } catch (error) {
      return { success: false, statusCode: 500, message: "Internal server error", error: error.message }
    }
  }

  async updateBulkFamilyMembers(data) {
    const { familyData } = data

    if (!familyData || !Array.isArray(familyData.members) || familyData.members.length === 0) {
      return { success: false, statusCode: 400, message: "Valid family members data is required" }
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
        return { success: false, statusCode: 404, message: "No students found with the provided roll numbers" }
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

      return {
        success: true,
        statusCode: 200,
        data: {
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
        },
      }
    } catch (error) {
      await session.abortTransaction()
      return { success: false, statusCode: 500, message: "Server error", error: error.message }
    } finally {
      session.endSession()
    }
  }
}

export const familyMemberService = new FamilyMemberService()
