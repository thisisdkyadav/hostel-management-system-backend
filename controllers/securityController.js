import Security from "../models/Security.js"
import Hostel from "../models/Hostel.js"
import User from "../models/User.js"

export const getSecurity = async (req, res) => {
  const user = req.user

  try {
    const security = await Security.findOne({ userId: user._id }).populate("hostelId", "name type").exec()
    if (!security) {
      return res.status(404).json({ message: "Security not found" })
    }
    if (!security) {
      return res.status(404).json({ message: "Security not found" })
    }

    res.status(200).json({
      security: {
        _id: security._id,
        name: security.name,
        email: security.email,
        phone: security.phone,
        hostelId: security.hostelId,
        hostelName: security.hostelId ? security.hostelId.name : null,
        hostelType: security.hostelId ? security.hostelId.type : "unit-based",
      },
    })
  } catch (error) {
    console.error("Error fetching security:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
