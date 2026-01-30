import Event from "../../models/Event.js"
import StudentProfile from "../../models/StudentProfile.js"

class EventService {
  async createEvent(data, user) {
    const { eventName, description, dateAndTime, hostelId, gender } = data

    try {
      let StaffHostelId = null

      if (user.hostel) {
        StaffHostelId = user.hostel._id
      }

      const event = new Event({
        eventName,
        description,
        dateAndTime,
        hostelId: StaffHostelId ? StaffHostelId : hostelId,
        gender,
      })

      await event.save()

      return { success: true, statusCode: 201, data: { message: "Event created successfully", event } }
    } catch (error) {
      console.error("Error creating event:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async getEvents(user) {
    try {
      const query = {}
      const role = user.role
      const hostel = user.hostel
      if (role === "Student") {
        const studentProfile = await StudentProfile.findOne({ userId: user._id }).populate("currentRoomAllocation")
        const hostelId = studentProfile.currentRoomAllocation.hostelId
        query.hostelId = { $in: [hostelId, null] }
        query.gender = { $in: [studentProfile.gender, null] }
      } else if (hostel) {
        query.hostelId = { $in: [hostel._id, null] }
      }

      const events = await Event.find(query).populate("hostelId")
      if (events.length > 0) {
        return { success: true, statusCode: 200, data: { events } }
      } else {
        return { success: false, statusCode: 404, message: "No events found" }
      }
    } catch (error) {
      console.error("Error fetching events:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async updateEvent(id, data) {
    const { eventName, description, dateAndTime, hostelId, gender } = data

    try {
      const updates = {
        eventName,
        description,
        dateAndTime,
        hostelId: hostelId ? hostelId : null,
        gender,
      }
      const event = await Event.findByIdAndUpdate(id, updates, { new: true })

      if (!event) {
        return { success: false, statusCode: 404, message: "Event not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Event updated successfully", success: true, event } }
    } catch (error) {
      console.error("Error updating event:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async deleteEvent(id) {
    try {
      const event = await Event.findByIdAndDelete(id)

      if (!event) {
        return { success: false, statusCode: 404, message: "Event not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Event deleted successfully", success: true } }
    } catch (error) {
      console.error("Error deleting event:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }
}

export const eventService = new EventService()
