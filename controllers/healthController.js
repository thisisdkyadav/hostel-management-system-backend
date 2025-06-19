import Health from "../models/Health.js"
import InsuranceClaim from "../models/InsuranceClaim.js"
import StudentProfile from "../models/StudentProfile.js"
import mongoose from "mongoose"

export const getHealth = async (req, res) => {
  const { userId } = req.params
  try {
    const health = await Health.findOne({ userId }).populate("insurance.insuranceProvider")
    if (!health) {
      // if health is not found, create a new health
      const newHealth = new Health({ userId, bloodGroup: "", insurance: {} })
      await newHealth.save()
      return res.status(201).json({ message: "Health created", health: newHealth })
    }
    res.status(200).json({ message: "Health fetched", health })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateHealth = async (req, res) => {
  const { userId } = req.params
  const { bloodGroup, insurance } = req.body
  console.log("Insurance in updateHealth:", insurance)

  try {
    const health = await Health.findOneAndUpdate({ userId }, { bloodGroup, insurance }, { new: true })
    res.status(200).json({ message: "Health updated", health })
  } catch (error) {
    console.log(error)

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateBulkStudentHealth = async (req, res) => {
  const { studentsData } = req.body

  // Validate input
  if (!Array.isArray(studentsData) || studentsData.length === 0) {
    return res.status(400).json({ message: "Students data array is required and must not be empty" })
  }

  // Start a MongoDB session for transaction
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Get roll numbers from request data
    const rollNumbers = studentsData.map((student) => student.rollNumber.toUpperCase())

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
    const userIdToRollNumberMap = {}
    const userIds = []

    studentProfiles.forEach((profile) => {
      studentProfileMap[profile.rollNumber] = profile
      userIdToRollNumberMap[profile.userId.toString()] = profile.rollNumber
      userIds.push(profile.userId)
    })

    // Track results for the response
    const results = {
      success: [],
      notFound: [],
      failed: [],
    }

    // Track students data by user ID for faster lookup
    const healthDataMap = {}
    studentsData.forEach((student) => {
      const rollNumber = student.rollNumber.toUpperCase()
      if (studentProfileMap[rollNumber]) {
        const userId = studentProfileMap[rollNumber].userId.toString()
        healthDataMap[userId] = {
          rollNumber,
          bloodGroup: student.bloodGroup,
        }
      } else {
        results.notFound.push(rollNumber)
      }
    })

    // Get all existing health records in one query
    const existingHealthRecords = await Health.find({
      userId: { $in: userIds },
    }).session(session)

    // Create a map of userId to health record
    const healthRecordMap = {}
    existingHealthRecords.forEach((record) => {
      healthRecordMap[record.userId.toString()] = record
    })

    // Identify userIds that need new health records and those that need updates
    const healthRecordsToCreate = []
    const healthRecordsToUpdate = []

    userIds.forEach((userId) => {
      const userIdStr = userId.toString()
      const healthData = healthDataMap[userIdStr]

      // Skip if we don't have health data for this user
      if (!healthData) return

      if (healthRecordMap[userIdStr]) {
        // Update existing record
        const healthRecord = healthRecordMap[userIdStr]
        healthRecord.bloodGroup = healthData.bloodGroup || healthRecord.bloodGroup
        healthRecord.updatedAt = Date.now()
        healthRecordsToUpdate.push(healthRecord)
      } else {
        // Create new record
        healthRecordsToCreate.push({
          userId: userId,
          bloodGroup: healthData.bloodGroup || "",
          insurance: { insuranceProvider: null, insuranceNumber: null },
        })
      }

      // Add to success
      results.success.push({
        rollNumber: healthData.rollNumber,
        userId: userId,
        bloodGroup: healthData.bloodGroup,
      })
    })

    // Bulk create new health records
    if (healthRecordsToCreate.length > 0) {
      await Health.insertMany(healthRecordsToCreate, { session })
    }

    // Bulk update existing health records
    const bulkUpdateOps = healthRecordsToUpdate.map((record) => ({
      updateOne: {
        filter: { _id: record._id },
        update: {
          $set: {
            bloodGroup: record.bloodGroup,
            updatedAt: Date.now(),
          },
        },
      },
    }))

    if (bulkUpdateOps.length > 0) {
      await Health.bulkWrite(bulkUpdateOps, { session })
    }

    // Commit the transaction
    await session.commitTransaction()

    res.status(200).json({
      message: "Bulk health update completed",
      results: {
        totalProcessed: studentsData.length,
        successfulUpdates: results.success.length,
        notFoundCount: results.notFound.length,
        failedCount: results.failed.length,
        notFound: results.notFound,
        failed: results.failed,
      },
      successDetails: results.success,
    })
  } catch (error) {
    // Abort transaction on error
    await session.abortTransaction()
    res.status(500).json({ message: "Server error", error: error.message })
  } finally {
    // End session
    session.endSession()
  }
}

// health deletion is not allowed

// insurance claim controller

export const createInsuranceClaim = async (req, res) => {
  const { userId, insuranceProvider, insuranceNumber, amount, hospitalName, description } = req.body
  try {
    const insuranceClaim = await InsuranceClaim.create({ userId, insuranceProvider, insuranceNumber, amount, hospitalName, description })
    res.status(201).json({ message: "Insurance claim created", insuranceClaim })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getInsuranceClaims = async (req, res) => {
  const { userId } = req.params
  try {
    const insuranceClaims = await InsuranceClaim.find({ userId })
    res.status(200).json({ message: "Insurance claims fetched", insuranceClaims })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateInsuranceClaim = async (req, res) => {
  const { id } = req.params
  const { userId, insuranceProvider, insuranceNumber, amount, hospitalName, description } = req.body
  try {
    const insuranceClaim = await InsuranceClaim.findByIdAndUpdate(id, { userId, insuranceProvider, insuranceNumber, amount, hospitalName, description }, { new: true })
    res.status(200).json({ message: "Insurance claim updated", insuranceClaim })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteInsuranceClaim = async (req, res) => {
  const { id } = req.params
  try {
    await InsuranceClaim.findByIdAndDelete(id)
    res.status(200).json({ message: "Insurance claim deleted" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
