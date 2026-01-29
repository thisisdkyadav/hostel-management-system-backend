import LostAndFound from "../../models/LostAndFound.js"

export const createLostAndFound = async (req, res) => {
  const { itemName, description, dateFound, images, status } = req.body

  try {
    const lostAndFoundItem = new LostAndFound({
      itemName,
      description,
      dateFound,
      images,
      status,
    })

    await lostAndFoundItem.save()

    res.status(201).json({ message: "Lost and found item created successfully", lostAndFoundItem })
  } catch (error) {
    console.error("Error creating lost and found item:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const getLostAndFound = async (req, res) => {
  try {
    const lostAndFoundItems = await LostAndFound.find()
    res.status(200).json({ lostAndFoundItems })
  } catch (error) {
    console.error("Error fetching lost and found items:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const updateLostAndFound = async (req, res) => {
  const { id } = req.params
  const { itemName, description, dateFound, images, status } = req.body

  try {
    const lostAndFoundItem = await LostAndFound.findByIdAndUpdate(id, { itemName, description, dateFound, images, status }, { new: true })

    if (!lostAndFoundItem) {
      return res.status(404).json({ message: "Lost and found item not found" })
    }

    res.status(200).json({ message: "Lost and found item updated successfully", success: true, lostAndFoundItem })
  } catch (error) {
    console.error("Error updating lost and found item:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}

export const deleteLostAndFound = async (req, res) => {
  const { id } = req.params

  try {
    const lostAndFoundItem = await LostAndFound.findByIdAndDelete(id)

    if (!lostAndFoundItem) {
      return res.status(404).json({ message: "Lost and found item not found" })
    }

    res.status(200).json({ message: "Lost and found item deleted successfully", success: true })
  } catch (error) {
    console.error("Error deleting lost and found item:", error)
    res.status(500).json({ message: "Internal server error" })
  }
}
