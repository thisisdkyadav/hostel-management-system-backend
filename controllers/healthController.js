import Health from "../models/Health.js"
import InsuranceClaim from "../models/InsuranceClaim.js"
export const getHealth = async (req, res) => {
  const { userId } = req.params
  try {
    const health = await Health.findOne({ userId }).populate("insurance.insuranceProvider")
    if (!health) {
      // if health is not found, create a new health
      const newHealth = new Health({ userId, bloodGroup: "", insurance: {} })
      await newHealth.save()
      return res.status(201).json({ message: "Health created", health: newHealth })
    }
    res.status(200).json({ message: "Health fetched", health })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateHealth = async (req, res) => {
  const { userId } = req.params
  const { bloodGroup, insurance } = req.body
  console.log("Insurance in updateHealth:", insurance)

  try {
    const health = await Health.findOneAndUpdate({ userId }, { bloodGroup, insurance }, { new: true })
    res.status(200).json({ message: "Health updated", health })
  } catch (error) {
    console.log(error)

    res.status(500).json({ message: "Server error", error: error.message })
  }
}

// health deletion is not allowed

// insurance claim controller

export const createInsuranceClaim = async (req, res) => {
  const { userId, insuranceProvider, insuranceNumber, amount, hospitalName, description } = req.body
  try {
    const insuranceClaim = await InsuranceClaim.create({ userId, insuranceProvider, insuranceNumber, amount, hospitalName, description })
    res.status(201).json({ message: "Insurance claim created", insuranceClaim })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const getInsuranceClaims = async (req, res) => {
  const { userId } = req.params
  try {
    const insuranceClaims = await InsuranceClaim.find({ userId })
    res.status(200).json({ message: "Insurance claims fetched", insuranceClaims })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const updateInsuranceClaim = async (req, res) => {
  const { id } = req.params
  const { userId, insuranceProvider, insuranceNumber, amount, hospitalName, description } = req.body
  try {
    const insuranceClaim = await InsuranceClaim.findByIdAndUpdate(id, { userId, insuranceProvider, insuranceNumber, amount, hospitalName, description }, { new: true })
    res.status(200).json({ message: "Insurance claim updated", insuranceClaim })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

export const deleteInsuranceClaim = async (req, res) => {
  const { id } = req.params
  try {
    await InsuranceClaim.findByIdAndDelete(id)
    res.status(200).json({ message: "Insurance claim deleted" })
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message })
  }
}
