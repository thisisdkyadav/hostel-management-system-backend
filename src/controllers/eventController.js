import Event from "../../models/Event.js"
import StudentProfile from "../../models/StudentProfile.js"
import Warden from "../../models/Warden.js"
import AssociateWarden from "../../models/AssociateWarden.js"

export const createEvent = async (req, res) => {
  const { eventName, description, dateAndTime, hostelId, gender } = req.body
  const user = req.user

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

    res.status(201).json({ message: "Event created successfully", event })
  } catch (error) {
    console.error("Error creating event:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const getEvents = async (req, res) => {
  const user = req.user
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
      return res.status(200).json({ events })
    } else {
      res.status(404).json({ message: "No events found" })
    }
  } catch (error) {
    console.error("Error fetching events:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
// export const getEventByHostelId = async (req, res) => {
//   const { id } = req.params

//   try {
//     const events = await Event.find({ hostelId: id })
//     if (!events) {
//       return res.status(404).json({ message: "Events not found" })
//     }
//     res.status(200).json({ events })
//   } catch (error) {
//     console.error("Error fetching events by hostel ID:", error)
//     res.status(500).json({ message: "Internal server error" })
//   }
// }

export const updateEvent = async (req, res) => {
  const { id } = req.params
  const { eventName, description, dateAndTime, hostelId, gender } = req.body

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
      return res.status(404).json({ message: "Event not found" })
    }

    res.status(200).json({ message: "Event updated successfully", success: true, event })
  } catch (error) {
    console.error("Error updating event:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const deleteEvent = async (req, res) => {
  const { id } = req.params

  try {
    const event = await Event.findByIdAndDelete(id)

    if (!event) {
      return res.status(404).json({ message: "Event not found" })
    }

    res.status(200).json({ message: "Event deleted successfully", success: true })
  } catch (error) {
    console.error("Error deleting event:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
