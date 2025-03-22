import Warden from "../models/Warden.js"

export const getWardenProfile = async (req, res) => {
  const user = req.user
  const userId = user._id
  try {
    const wardenProfile = await Warden.findOne({ userId }).populate("userId", "name email role").populate("hostelId", "name type").exec()

    if (!wardenProfile) {
      return res.status(404).json({ message: "Warden profile not found" })
    }

    res.status(200).json(wardenProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}
