import DisCoAction from "../models/DisCoAction.js"
import User from "../models/User.js"
import StudentProfile from "../models/StudentProfile.js"
export const addDisCoAction = async (req, res) => {
  const { studentId, reason, actionTaken, date, remarks } = req.body
  const user = req.user
  try {
    console.log(studentId)

    const studentProfile = await StudentProfile.findOne({ userId: studentId })

    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }
    console.log(studentProfile)

    const newDisCo = new DisCoAction({
      userId: studentId,
      reason,
      actionTaken,
      date,
      remarks,
    })

    await newDisCo.save()

    res.status(201).json({ message: "DisCo action added successfully" })
  } catch (error) {
    console.error("Error adding DisCo action:", error)
    res.status(500).json({ message: "Error adding DisCo action", error: error.message })
  }
}

export const getDisCoActionsByStudent = async (req, res) => {
  const { studentId } = req.params

  try {
    const actions = await DisCoAction.find({ userId: studentId }).populate("userId", "name email")

    res.status(200).json({
      success: true,
      message: "Disciplinary actions fetched successfully",
      actions,
    })
  } catch (error) {
    console.error("Error fetching disciplinary actions:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching disciplinary actions",
      error: error.message,
    })
  }
}

export const updateDisCoAction = async (req, res) => {
  const { disCoId } = req.params
  const { reason, actionTaken, date, remarks } = req.body

  try {
    const updated = await DisCoAction.findByIdAndUpdate(disCoId, { reason, actionTaken, date, remarks }, { new: true })

    if (!updated) {
      return res.status(404).json({ message: "DisCo action not found" })
    }

    res.status(200).json({ message: "DisCo action updated successfully", action: updated })
  } catch (error) {
    console.error("Error updating DisCo action:", error)
    res.status(500).json({ message: "Error updating DisCo action", error: error.message })
  }
}

export const deleteDisCoAction = async (req, res) => {
  const { disCoId } = req.params

  try {
    const deleted = await DisCoAction.findByIdAndDelete(disCoId)

    if (!deleted) {
      return res.status(404).json({ message: "DisCo action not found" })
    }

    res.status(200).json({ message: "DisCo action deleted successfully" })
  } catch (error) {
    console.error("Error deleting DisCo action:", error)
    res.status(500).json({ message: "Error deleting DisCo action", error: error.message })
  }
}
