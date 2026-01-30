import LostAndFound from "../../models/LostAndFound.js"

class LostAndFoundService {
  async createLostAndFound(data) {
    const { itemName, description, dateFound, images, status } = data

    try {
      const lostAndFoundItem = new LostAndFound({
        itemName,
        description,
        dateFound,
        images,
        status,
      })

      await lostAndFoundItem.save()

      return { success: true, statusCode: 201, data: { message: "Lost and found item created successfully", lostAndFoundItem } }
    } catch (error) {
      console.error("Error creating lost and found item:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async getLostAndFound() {
    try {
      const lostAndFoundItems = await LostAndFound.find()
      return { success: true, statusCode: 200, data: { lostAndFoundItems } }
    } catch (error) {
      console.error("Error fetching lost and found items:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async updateLostAndFound(id, data) {
    const { itemName, description, dateFound, images, status } = data

    try {
      const lostAndFoundItem = await LostAndFound.findByIdAndUpdate(id, { itemName, description, dateFound, images, status }, { new: true })

      if (!lostAndFoundItem) {
        return { success: false, statusCode: 404, message: "Lost and found item not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Lost and found item updated successfully", success: true, lostAndFoundItem } }
    } catch (error) {
      console.error("Error updating lost and found item:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }

  async deleteLostAndFound(id) {
    try {
      const lostAndFoundItem = await LostAndFound.findByIdAndDelete(id)

      if (!lostAndFoundItem) {
        return { success: false, statusCode: 404, message: "Lost and found item not found" }
      }

      return { success: true, statusCode: 200, data: { message: "Lost and found item deleted successfully", success: true } }
    } catch (error) {
      console.error("Error deleting lost and found item:", error)
      return { success: false, statusCode: 500, message: "Internal server error" }
    }
  }
}

export const lostAndFoundService = new LostAndFoundService()
