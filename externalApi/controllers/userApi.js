import User from "../../models/User.js"

export const searchUsers = async (req, res) => {
  const query = req.query
  try {
    const { _id, email, name, phone, role } = query
    const filter = {}
    if (_id) filter._id = _id
    if (email) filter.email = email
    if (name) filter.name = name
    if (phone) filter.phone = phone
    if (role) filter.role = role

    const userDetails = await User.find(filter)
    res.status(200).json(userDetails)
  } catch (error) {
    console.error("Error fetching user details:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
