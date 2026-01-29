import Undertaking from "../../models/Undertaking.js"
import UndertakingAssignment from "../../models/UndertakingAssignment.js"
import StudentProfile from "../../models/StudentProfile.js"
import mongoose from "mongoose"

// Admin APIs

// 1. Get All Undertakings
export const getAllUndertakings = async (req, res) => {
  try {
    console.log("getAllUndertakings")
    const undertakings = await Undertaking.find().populate("createdBy", "name email").sort({ createdAt: -1 }).populate("totalStudents").populate("acceptedCount")

    const formattedUndertakings = undertakings.map((undertaking) => {
      return {
        id: undertaking._id,
        title: undertaking.title,
        description: undertaking.description,
        content: undertaking.content,
        deadline: undertaking.deadline,
        createdAt: undertaking.createdAt,
        totalStudents: undertaking.totalStudents || 0,
        acceptedCount: undertaking.acceptedCount || 0,
        status: undertaking.status,
      }
    })

    res.status(200).json({ undertakings: formattedUndertakings })
  } catch (error) {
    console.error("Error fetching undertakings:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 2. Create Undertaking
export const createUndertaking = async (req, res) => {
  const { title, description, content, deadline } = req.body
  const user = req.user

  try {
    const undertaking = new Undertaking({
      title,
      description,
      content,
      deadline,
      createdBy: user._id,
    })

    await undertaking.save()

    res.status(201).json({
      message: "Undertaking created successfully",
      undertaking: {
        id: undertaking._id,
        title: undertaking.title,
        description: undertaking.description,
        content: undertaking.content,
        deadline: undertaking.deadline,
        createdAt: undertaking.createdAt,
        status: undertaking.status,
      },
    })
  } catch (error) {
    console.error("Error creating undertaking:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 3. Update Undertaking
export const updateUndertaking = async (req, res) => {
  const { undertakingId } = req.params
  const { title, description, content, deadline } = req.body

  try {
    const updates = {
      title,
      description,
      content,
      deadline,
      updatedAt: new Date(),
    }

    const undertaking = await Undertaking.findByIdAndUpdate(undertakingId, updates, { new: true })

    if (!undertaking) {
      return res.status(404).json({ message: "Undertaking not found" })
    }

    res.status(200).json({
      message: "Undertaking updated successfully",
      undertaking: {
        id: undertaking._id,
        title: undertaking.title,
        description: undertaking.description,
        content: undertaking.content,
        deadline: undertaking.deadline,
        updatedAt: undertaking.updatedAt,
      },
    })
  } catch (error) {
    console.error("Error updating undertaking:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 4. Delete Undertaking
export const deleteUndertaking = async (req, res) => {
  const { undertakingId } = req.params

  try {
    const undertaking = await Undertaking.findByIdAndDelete(undertakingId)

    if (!undertaking) {
      return res.status(404).json({ message: "Undertaking not found" })
    }

    // Delete all assignments related to this undertaking
    await UndertakingAssignment.deleteMany({ undertakingId })

    res.status(200).json({
      message: "Undertaking deleted successfully",
      undertakingId,
    })
  } catch (error) {
    console.error("Error deleting undertaking:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 5. Get Students Assigned to Undertaking
export const getAssignedStudents = async (req, res) => {
  const { undertakingId } = req.params

  try {
    const assignments = await UndertakingAssignment.find({ undertakingId }).populate({
      path: "studentId",
      select: "_id rollNumber",
      populate: {
        path: "userId",
        select: "name email",
      },
    })

    if (!assignments || assignments.length === 0) {
      return res.status(200).json({ students: [] })
    }

    const students = assignments.map((assignment) => ({
      id: assignment.studentId._id,
      name: assignment.studentId.userId?.name || "",
      email: assignment.studentId.userId?.email || "",
      rollNumber: assignment.studentId.rollNumber,
      status: assignment.status,
      acceptedAt: assignment.acceptedAt,
    }))

    res.status(200).json({ students })
  } catch (error) {
    console.error("Error fetching assigned students:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 6. Add Students to Undertaking
// Request body: { rollNumbers: ["CS21B001", "CS21B002", ...] }
export const addStudentsToUndertaking = async (req, res) => {
  console.log("addStudentsToUndertaking")
  const { undertakingId } = req.params
  const { rollNumbers } = req.body

  console.log(rollNumbers)

  try {
    const undertaking = await Undertaking.findById(undertakingId)

    if (!undertaking) {
      return res.status(404).json({ message: "Undertaking not found" })
    }

    // Find student profiles by roll numbers
    const studentProfiles = await StudentProfile.find({
      rollNumber: { $in: rollNumbers },
    })

    if (studentProfiles.length === 0) {
      return res.status(404).json({ message: "No students found with the provided roll numbers" })
    }

    // Get student IDs from profiles
    const studentIds = studentProfiles.map((profile) => profile._id)

    // Create assignment entries for each student
    const assignments = studentIds.map((studentId) => ({
      undertakingId,
      studentId,
      status: "not_viewed",
      assignedAt: new Date(),
    }))

    // Use insertMany with ordered: false to ignore duplicates
    const result = await UndertakingAssignment.insertMany(assignments, { ordered: false }).catch((err) => {
      // If there are duplicate key errors, count how many were successfully inserted
      if (err.code === 11000) {
        return err.insertedDocs || []
      }
      throw err
    })

    // Map roll numbers to student profiles for response
    const addedStudents = studentProfiles.map((profile) => ({
      id: profile._id,
      rollNumber: profile.rollNumber,
    }))

    res.status(200).json({
      message: "Students added to undertaking successfully",
      addedCount: result.length,
      undertakingId,
      addedStudents,
    })
  } catch (error) {
    console.error("Error adding students to undertaking:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 7. Remove Student from Undertaking
export const removeStudentFromUndertaking = async (req, res) => {
  const { undertakingId, studentId } = req.params

  try {
    const result = await UndertakingAssignment.findOneAndDelete({
      undertakingId,
      studentId,
    })

    if (!result) {
      return res.status(404).json({ message: "Assignment not found" })
    }

    res.status(200).json({
      message: "Student removed from undertaking successfully",
      undertakingId,
      studentId,
    })
  } catch (error) {
    console.error("Error removing student from undertaking:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 8. Get Undertaking Acceptance Status
export const getUndertakingStatus = async (req, res) => {
  const { undertakingId } = req.params

  try {
    const undertaking = await Undertaking.findById(undertakingId)

    if (!undertaking) {
      return res.status(404).json({ message: "Undertaking not found" })
    }

    const assignments = await UndertakingAssignment.find({ undertakingId }).populate({
      path: "studentId",
      select: "_id rollNumber",
      populate: {
        path: "userId",
        select: "name email",
      },
    })

    // Calculate stats
    const totalStudents = assignments.length
    const accepted = assignments.filter((a) => a.status === "accepted").length
    const pending = assignments.filter((a) => a.status === "pending").length
    const notViewed = assignments.filter((a) => a.status === "not_viewed").length

    // Format student details
    const students = assignments.map((assignment) => ({
      id: assignment.studentId._id,
      name: assignment.studentId.userId?.name || "",
      email: assignment.studentId.userId?.email || "",
      rollNumber: assignment.studentId.rollNumber,
      status: assignment.status,
      acceptedAt: assignment.acceptedAt,
    }))

    res.status(200).json({
      undertakingId,
      title: undertaking.title,
      stats: {
        totalStudents,
        accepted,
        pending,
        notViewed,
      },
      students,
    })
  } catch (error) {
    console.error("Error fetching undertaking status:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// Student APIs

// 9. Get Student's Pending Undertakings
export const getStudentPendingUndertakings = async (req, res) => {
  const userId = req.user._id

  try {
    const studentProfile = await StudentProfile.findOne({ userId })

    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }

    const assignments = await UndertakingAssignment.find({
      studentId: studentProfile._id,
      status: { $in: ["not_viewed", "pending"] },
    }).populate("undertakingId")

    const pendingUndertakings = assignments.map((assignment) => ({
      id: assignment.undertakingId._id,
      title: assignment.undertakingId.title,
      description: assignment.undertakingId.description,
      content: assignment.undertakingId.content,
      deadline: assignment.undertakingId.deadline,
      status: assignment.status,
    }))

    res.status(200).json({ pendingUndertakings })
  } catch (error) {
    console.error("Error fetching student pending undertakings:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 10. Get Undertaking Details (Student view)
export const getUndertakingDetails = async (req, res) => {
  const { undertakingId } = req.params
  const userId = req.user._id

  try {
    const studentProfile = await StudentProfile.findOne({ userId })

    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }

    const undertaking = await Undertaking.findById(undertakingId)

    if (!undertaking) {
      return res.status(404).json({ message: "Undertaking not found" })
    }

    // Find the assignment and update viewedAt if not viewed
    const assignment = await UndertakingAssignment.findOne({
      undertakingId,
      studentId: studentProfile._id,
    })

    if (!assignment) {
      return res.status(404).json({ message: "Undertaking not assigned to this student" })
    }

    // Mark as viewed if not already
    if (assignment.status === "not_viewed") {
      assignment.status = "pending"
      assignment.viewedAt = new Date()
      await assignment.save()
    }

    res.status(200).json({
      undertaking: {
        id: undertaking._id,
        title: undertaking.title,
        description: undertaking.description,
        content: undertaking.content,
        deadline: undertaking.deadline,
        status: assignment.status,
      },
    })
  } catch (error) {
    console.error("Error fetching undertaking details:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 11. Accept Undertaking
export const acceptUndertaking = async (req, res) => {
  const { undertakingId } = req.params
  const { accepted } = req.body
  const userId = req.user._id

  try {
    if (!accepted) {
      return res.status(400).json({ message: "Acceptance confirmation required" })
    }

    const studentProfile = await StudentProfile.findOne({ userId })

    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }

    const assignment = await UndertakingAssignment.findOne({
      undertakingId,
      studentId: studentProfile._id,
    })

    if (!assignment) {
      return res.status(404).json({ message: "Undertaking not assigned to this student" })
    }

    const now = new Date()
    assignment.status = "accepted"
    assignment.acceptedAt = now
    assignment.viewedAt = assignment.viewedAt || now

    await assignment.save()

    res.status(200).json({
      message: "Undertaking accepted successfully",
      undertakingId,
      acceptedAt: assignment.acceptedAt,
    })
  } catch (error) {
    console.error("Error accepting undertaking:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

// 12. Get Student's Accepted Undertakings
export const getStudentAcceptedUndertakings = async (req, res) => {
  const userId = req.user._id

  try {
    const studentProfile = await StudentProfile.findOne({ userId })

    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }

    const assignments = await UndertakingAssignment.find({
      studentId: studentProfile._id,
      status: "accepted",
    }).populate("undertakingId")

    const acceptedUndertakings = assignments.map((assignment) => ({
      id: assignment.undertakingId._id,
      title: assignment.undertakingId.title,
      description: assignment.undertakingId.description,
      acceptedAt: assignment.acceptedAt,
    }))

    res.status(200).json({ acceptedUndertakings })
  } catch (error) {
    console.error("Error fetching student accepted undertakings:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const getStudentPendingUndertakingsCount = async (req, res) => {
  const userId = req.user._id

  try {
    const studentProfile = await StudentProfile.findOne({ userId })

    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }

    const count = await UndertakingAssignment.countDocuments({
      studentId: studentProfile._id,
      status: { $in: ["not_viewed", "pending"] },
    })

    res.status(200).json({ count })
  } catch (error) {
    console.error("Error fetching student pending undertakings count:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
