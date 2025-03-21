import Event from "../models/Events.js"
import StudentProfile from "../models/StudentProfile.js"
import Warden from "../models/Warden.js"

export const createEvent = async (req, res) => {
  const { eventName, description, dateAndTime, hostelId } = req.body

  try {
    const event = new Event({
      eventName,
      description,
      dateAndTime,
      hostelId,
    })

    await event.save()

    res.status(201).json({ message: "Event created successfully", event })
  } catch (error) {
    console.error("Error creating event:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const getEvents = async (req, res) => {
  console.log("Fetching events...")

  const user = req.user
  try {
    if (user.role === "Student") {
      const studentProfile = await StudentProfile.findOne({ userId: user._id }).populate({
        path: "currentRoomAllocation",
        populate: {
          path: "roomId",
          select: "hostelId",
        },
      })

      const events =
        (await Event.find({
          hostelId: studentProfile.currentRoomAllocation.roomId.hostelId,
        })) || []

      return res.status(200).json({ events })
    } else if (user.role === "Warden") {
      const warden = await Warden.findOne({ userId: user._id })
      const events = (await Event.find({ hostelId: warden.hostelId })) || []
      return res.status(200).json({ events })
    } else if (user.role === "Admin") {
      const events = (await Event.find()) || []
      return res.status(200).json({ events })
    }
    res.status(404).json({ message: "No events found" })
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
  const { eventName, description, dateAndTime } = req.body

  try {
    const event = await Event.findByIdAndUpdate(id, { eventName, description, dateAndTime }, { new: true })

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
