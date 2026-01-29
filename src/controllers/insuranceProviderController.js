import InsuranceProvider from "../../models/InsuranceProvider.js"
import StudentProfile from "../../models/StudentProfile.js"
import Health from "../../models/Health.js"
import mongoose from "mongoose"

export const createInsuranceProvider = async (req, res) => {
  const { name, address, phone, email, startDate, endDate } = req.body
  try {
    const insuranceProvider = await InsuranceProvider.create({ name, address, phone, email, startDate, endDate })
    res.status(201).json({ message: "Insurance provider created", insuranceProvider })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getInsuranceProviders = async (req, res) => {
  try {
    const insuranceProviders = await InsuranceProvider.find()
    res.status(200).json({ message: "Insurance providers fetched", insuranceProviders })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateInsuranceProvider = async (req, res) => {
  const { id } = req.params
  const { name, address, phone, email, startDate, endDate } = req.body
  try {
    const insuranceProvider = await InsuranceProvider.findByIdAndUpdate(id, { name, address, phone, email, startDate, endDate }, { new: true })
    res.status(200).json({ message: "Insurance provider updated", insuranceProvider })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteInsuranceProvider = async (req, res) => {
  const { id } = req.params
  try {
    await InsuranceProvider.findByIdAndDelete(id)
    res.status(200).json({ message: "Insurance provider deleted" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateBulkStudentInsurance = async (req, res) => {
  const { insuranceProviderId, studentsData } = req.body

  // Validate input
  if (!insuranceProviderId) {
    return res.status(400).json({ message: "Insurance provider ID is required" })
  }

  if (!Array.isArray(studentsData) || studentsData.length === 0) {
    return res.status(400).json({ message: "Students data array is required and must not be empty" })
  }

  // Start a MongoDB session for transaction
  const session = await mongoose.startSession()
  session.startTransaction()

  try {
    // Verify insurance provider exists
    const insuranceProvider = await InsuranceProvider.findById(insuranceProviderId)
    if (!insuranceProvider) {
      await session.abortTransaction()
      return res.status(404).json({ message: "Insurance provider not found" })
    }

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
    const insuranceDataMap = {}
    studentsData.forEach((student) => {
      const rollNumber = student.rollNumber.toUpperCase()
      if (studentProfileMap[rollNumber]) {
        const userId = studentProfileMap[rollNumber].userId.toString()
        insuranceDataMap[userId] = {
          rollNumber,
          insuranceNumber: student.insuranceNumber,
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
      const insuranceData = insuranceDataMap[userIdStr]

      // Skip if we don't have insurance data for this user
      if (!insuranceData) return

      // Check if insurance number is empty, null or blank string
      const isEmptyInsurance = !insuranceData.insuranceNumber || insuranceData.insuranceNumber.trim() === ""

      if (healthRecordMap[userIdStr]) {
        // Update existing record
        const healthRecord = healthRecordMap[userIdStr]
        healthRecord.insurance = isEmptyInsurance
          ? { insuranceProvider: null, insuranceNumber: null }
          : {
              insuranceProvider: insuranceProviderId,
              insuranceNumber: insuranceData.insuranceNumber,
            }
        healthRecordsToUpdate.push(healthRecord)
      } else {
        // Create new record
        healthRecordsToCreate.push({
          userId: userId,
          bloodGroup: "",
          insurance: isEmptyInsurance
            ? { insuranceProvider: null, insuranceNumber: null }
            : {
                insuranceProvider: insuranceProviderId,
                insuranceNumber: insuranceData.insuranceNumber,
              },
        })
      }

      // Only add to success if we have valid insurance data
      if (!isEmptyInsurance) {
        results.success.push({
          rollNumber: insuranceData.rollNumber,
          userId: userId,
          insuranceNumber: insuranceData.insuranceNumber,
        })
      } else {
        results.success.push({
          rollNumber: insuranceData.rollNumber,
          userId: userId,
          insuranceNumber: null,
          note: "Insurance data set to null",
        })
      }
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
            insurance: record.insurance,
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
      message: "Insurance provider update completed",
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
