import Certificate from "../../models/Certificate.js"
import StudentProfile from "../../models/StudentProfile.js"

class CertificateService {
  async addCertificate(data) {
    const { studentId, certificateType, certificateUrl, issueDate, remarks } = data
    try {
      console.log(studentId)

      const studentProfile = await StudentProfile.findOne({ userId: studentId })

      if (!studentProfile) {
        return { success: false, statusCode: 404, message: "Student profile not found" }
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

      return { success: true, statusCode: 201, data: { message: "Certificate added successfully", certificate: newCertificate } }
    } catch (error) {
      console.error("Error adding certificate:", error)
      return { success: false, statusCode: 500, message: "Error adding certificate", error: error.message }
    }
  }

  async getCertificatesByStudent(studentId) {
    try {
      const certificates = await Certificate.find({ userId: studentId }).populate("userId", "name email")

      return {
        success: true,
        statusCode: 200,
        data: {
          success: true,
          message: "Certificates fetched successfully",
          certificates,
        },
      }
    } catch (error) {
      console.error("Error fetching certificates:", error)
      return {
        success: false,
        statusCode: 500,
        message: "Error fetching certificates",
        error: error.message,
      }
    }
  }

  async updateCertificate(certificateId, data) {
    const { certificateType, certificateUrl, issueDate, remarks } = data

    try {
      const updated = await Certificate.findByIdAndUpdate(certificateId, { certificateType, certificateUrl, issueDate, remarks }, { new: true })

      if (!updated) {
        return { success: false, statusCode: 404, message: "Certificate not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Certificate updated successfully", certificate: updated } }
    } catch (error) {
      console.error("Error updating certificate:", error)
      return { success: false, statusCode: 500, message: "Error updating certificate", error: error.message }
    }
  }

  async deleteCertificate(certificateId) {
    try {
      const deleted = await Certificate.findByIdAndDelete(certificateId)

      if (!deleted) {
        return { success: false, statusCode: 404, message: "Certificate not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Certificate deleted successfully" } }
    } catch (error) {
      console.error("Error deleting certificate:", error)
      return { success: false, statusCode: 500, message: "Error deleting certificate", error: error.message }
    }
  }
}

export const certificateService = new CertificateService()
