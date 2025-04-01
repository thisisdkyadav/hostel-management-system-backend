import VisitorProfile from "../models/VisitorProfile.js"

export const getVisitorProfiles = async (req, res) => {
  const user = req.user

  try {
    const visitorProfiles = await VisitorProfile.find({ studentUserId: user._id })

    res.status(200).json({
      message: "Visitor profiles fetched successfully",
      success: true,
      data: visitorProfiles || [],
    })
  } catch (error) {
    console.error("Error fetching visitor profiles:", error)
    res.status(500).json({
      message: "Error fetching visitor profiles",
      error: error.message,
    })
  }
}

export const createVisitorProfile = async (req, res) => {
  const { name, phone, email, relation, address } = req.body
  const user = req.user

  try {
    const visitorProfile = new VisitorProfile({
      studentUserId: user._id,
      name,
      phone,
      email,
      relation,
      address,
    })

    await visitorProfile.save()
    res.status(201).json({ message: "Visitor profile created successfully", visitorProfile, success: true })
  } catch (error) {
    console.error("Error creating visitor profile:", error)
    res.status(500).json({ message: "Error creating visitor profile", error: error.message })
  }
}

export const updateVisitorProfile = async (req, res) => {
  const { visitorId } = req.params
  const { name, phone, email, relation, address } = req.body

  try {
    const updatedVisitorProfile = await VisitorProfile.findByIdAndUpdate(visitorId, { name, phone, email, relation, address }, { new: true })

    if (!updatedVisitorProfile) {
      return res.status(404).json({ message: "Visitor profile not found", success: false })
    }

    res.status(200).json({ message: "Visitor profile updated successfully", visitorProfile: updatedVisitorProfile })
  } catch (error) {
    console.error("Error updating visitor profile:", error)
    res.status(500).json({ message: "Error updating visitor profile", error: error.message })
  }
}

export const deleteVisitorProfile = async (req, res) => {
  const { visitorId } = req.params

  try {
    const deletedVisitorProfile = await VisitorProfile.findByIdAndDelete(visitorId)

    if (!deletedVisitorProfile) {
      return res.status(404).json({ message: "Visitor profile not found", success: false })
    }

    res.status(200).json({ message: "Visitor profile deleted successfully", success: true })
  } catch (error) {
    console.error("Error deleting visitor profile:", error)
    res.status(500).json({ message: "Error deleting visitor profile", error: error.message })
  }
}
