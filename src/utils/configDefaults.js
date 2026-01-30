import Configuration from "../models/config/Configuration.model.js"

// Default configuration values
export const defaultConfigs = {
  degrees: {
    value: ["BTech"],
    description: "List of available degree programs",
  },
  departments: {
    value: ["Computer Science", "Electrical Engineering", "Mechanical Engineering", "Civil Engineering", "Chemical Engineering"],
    description: "List of departments in the institution",
  },
  studentEditableFields: {
    value: ["profileImage", "dateOfBirth"],
    description: "Fields that students are allowed to edit in their profile",
  },
  registeredStudents: {
    value: { BTech: { total: 0, boys: 0, girls: 0 }, MTech: { total: 0, boys: 0, girls: 0 }, PhD: { total: 0, boys: 0, girls: 0 } },
    description: "Number of registered students in each program",
  },
  systemSettings: {
    value: { visitorPaymentLink: "" },
    description: "System-wide settings for the hostel management system",
  },
}

/**
 * Get configuration by key, create with default if not exists
 * @param {string} key - Configuration key
 * @returns {Promise<object|null>} Configuration value or null if not found and no default exists
 */
export const getConfigWithDefault = async (key) => {
  try {
    // Try to find existing configuration
    let config = await Configuration.findOne({ key })

    // If not found but default exists, create it
    if (!config && defaultConfigs[key]) {
      const defaultConfig = {
        key,
        value: defaultConfigs[key].value,
        description: defaultConfigs[key].description,
      }

      const newConfig = new Configuration(defaultConfig)
      config = await newConfig.save()
      console.log(`Created default configuration for '${key}'`)
    }

    return config
  } catch (error) {
    console.error(`Error in getConfigWithDefault for '${key}':`, error)
    return null
  }
}

/**
 * Initialize all default configurations if they don't exist
 * @returns {Promise<void>}
 */
export const initializeDefaultConfigs = async () => {
  try {
    const configKeys = Object.keys(defaultConfigs)
    for (const key of configKeys) {
      await getConfigWithDefault(key)
    }
    console.log("Default configurations initialized successfully")
  } catch (error) {
    console.error("Error initializing default configurations:", error)
  }
}
