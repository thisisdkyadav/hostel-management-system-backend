import VisitorProfile from "../../models/VisitorProfile.js"

class VisitorProfileService {
  async getVisitorProfiles(userId) {
    try {
      const visitorProfiles = await VisitorProfile.find({ studentUserId: userId })

      return {
        success: true,
        statusCode: 200,
        data: {
          message: "Visitor profiles fetched successfully",
          success: true,
          data: visitorProfiles || [],
        },
      }
    } catch (error) {
      console.error("Error fetching visitor profiles:", error)
      return {
        success: false,
        statusCode: 500,
        message: "Error fetching visitor profiles",
        error: error.message,
      }
    }
  }

  async createVisitorProfile(data, userId) {
    const { name, phone, email, relation, address } = data

    try {
      const visitorProfile = new VisitorProfile({
        studentUserId: userId,
        name,
        phone,
        email,
        relation,
        address,
      })

      await visitorProfile.save()
      return { success: true, statusCode: 201, data: { message: "Visitor profile created successfully", visitorProfile, success: true } }
    } catch (error) {
      console.error("Error creating visitor profile:", error)
      return { success: false, statusCode: 500, message: "Error creating visitor profile", error: error.message }
    }
  }

  async updateVisitorProfile(visitorId, data) {
    const { name, phone, email, relation, address } = data

    try {
      const updatedVisitorProfile = await VisitorProfile.findByIdAndUpdate(visitorId, { name, phone, email, relation, address }, { new: true })

      if (!updatedVisitorProfile) {
        return { success: false, statusCode: 404, message: "Visitor profile not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Visitor profile updated successfully", visitorProfile: updatedVisitorProfile } }
    } catch (error) {
      console.error("Error updating visitor profile:", error)
      return { success: false, statusCode: 500, message: "Error updating visitor profile", error: error.message }
    }
  }

  async deleteVisitorProfile(visitorId) {
    try {
      const deletedVisitorProfile = await VisitorProfile.findByIdAndDelete(visitorId)

      if (!deletedVisitorProfile) {
        return { success: false, statusCode: 404, message: "Visitor profile not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Visitor profile deleted successfully", success: true } }
    } catch (error) {
      console.error("Error deleting visitor profile:", error)
      return { success: false, statusCode: 500, message: "Error deleting visitor profile", error: error.message }
    }
  }
}

export const visitorProfileService = new VisitorProfileService()
