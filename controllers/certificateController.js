import Certificate from "../models/Certificate.js"
import User from "../models/User.js"
import StudentProfile from "../models/StudentProfile.js"

export const addCertificate = async (req, res) => {
  const { studentId, certificateType, certificateUrl, issueDate, remarks } = req.body
  const user = req.user
  try {
    console.log(studentId)

    const studentProfile = await StudentProfile.findOne({ userId: studentId })

    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }
    console.log(studentProfile)

    const newCertificate = new Certificate({
      userId: studentId,
      certificateType,
      certificateUrl,
      issueDate,
      remarks,
    })

    await newCertificate.save()

    res.status(201).json({ message: "Certificate added successfully", certificate: newCertificate })
  } catch (error) {
    console.error("Error adding certificate:", error)
    res.status(500).json({ message: "Error adding certificate", error: error.message })
  }
}

export const getCertificatesByStudent = async (req, res) => {
  const { studentId } = req.params

  try {
    const certificates = await Certificate.find({ userId: studentId }).populate("userId", "name email")

    res.status(200).json({
      success: true,
      message: "Certificates fetched successfully",
      certificates,
    })
  } catch (error) {
    console.error("Error fetching certificates:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching certificates",
      error: error.message,
    })
  }
}

export const updateCertificate = async (req, res) => {
  const { certificateId } = req.params
  const { certificateType, certificateUrl, issueDate, remarks } = req.body

  try {
    const updated = await Certificate.findByIdAndUpdate(certificateId, { certificateType, certificateUrl, issueDate, remarks }, { new: true })

    if (!updated) {
      return res.status(404).json({ message: "Certificate not found" })
    }

    res.status(200).json({ message: "Certificate updated successfully", certificate: updated })
  } catch (error) {
    console.error("Error updating certificate:", error)
    res.status(500).json({ message: "Error updating certificate", error: error.message })
  }
}

export const deleteCertificate = async (req, res) => {
  const { certificateId } = req.params

  try {
    const deleted = await Certificate.findByIdAndDelete(certificateId)

    if (!deleted) {
      return res.status(404).json({ message: "Certificate not found" })
    }

    res.status(200).json({ message: "Certificate deleted successfully" })
  } catch (error) {
    console.error("Error deleting certificate:", error)
    res.status(500).json({ message: "Error deleting certificate", error: error.message })
  }
}
