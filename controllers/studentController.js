import StudentProfile from "../models/StudentProfile"

export const createStudentProfile = async (req, res) => {
  const { userId } = req.params
  try {
    const existingProfile = await StudentProfile.findOne({
      userId,
    })

    if (existingProfile) {
      return res.status(400).json({ message: "Profile already exists" })
    }

    const newProfile = new StudentProfile({ userId, ...req.body })
    await newProfile.save()
    res.status(201).json(newProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const getStudentProfile = async (req, res) => {
  const { userId } = req.params
  try {
    const studentProfile = await StudentProfile.findOne({ userId })
      .populate("userId", "name email role")
      .exec()
    if (!studentProfile) {
      return res.status(404).json({ message: "Student profile not found" })
    }
    res.status(200).json(studentProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}

export const updateStudentProfile = async (req, res) => {
  const { userId } = req.params
  try {
    const updatedProfile = await StudentProfile.findOneAndUpdate(
      { userId },
      { $set: req.body },
      { new: true }
    )
    if (!updatedProfile) {
      return res.status(404).json({ message: "Profile update failed" })
    }
    res.status(200).json(updatedProfile)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: "Server error" })
  }
}
