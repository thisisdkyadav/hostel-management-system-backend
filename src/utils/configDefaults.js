import { configOwner } from "../services/config/configOwner.service.js"
import { configQueries } from "../services/config/configQueries.service.js"
import { DEFAULT_REBATE_RULES } from "../services/dining/rebateRules.js"

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
  studentBatches: {
    value: {},
    description: "Batch options grouped by degree and department scopes. Exact scopes and mixed scopes are both supported.",
  },
  studentGroups: {
    value: [],
    description: "Flat list of assignable student groups. Students can belong to multiple groups.",
  },
  studentEditableFields: {
    value: ["profileImage", "dateOfBirth"],
    description: "Fields that students are allowed to edit in their profile",
  },
  systemSettings: {
    value: { visitorPaymentLink: "" },
    description: "System-wide settings for the hostel management system",
  },
  internAccommodation: {
    value: { accommodationPaymentLink: "", messPaymentLink: "", gstPercentage: 0, accommodationDailyRate: 0, messDailyRate: 0 },
    description: "Intern accommodation: payment links, GST and daily accommodation/mess rates.",
  },
  accommodation: {
    value: {
      // Uploaded QR image fileRef shown to students (no payment link).
      defaultPaymentQR: "",
      // Three preset prices per person (Chief Warden Office picks one per guest, or types a custom amount).
      pricePerPerson1: 0,
      pricePerPerson2: 0,
      pricePerPerson3: 0,
      // Three preset GST percentages (same idea — pick per guest or enter manually).
      gstPercentage1: 0,
      gstPercentage2: 0,
      gstPercentage3: 0,
      gstin: "",
    },
    description:
      "Visitor accommodation: payment QR image, three preset prices per person, three GST % options (Chief Warden Office selects per guest when requesting payment), and GSTIN for invoices.",
  },
  academicHolidays: {
    value: {},
    description: "Year-wise academic holidays map. Example: { \"2026\": [{ title, date }] }",
  },
  gymkhanaEventCategories: {
    value: [
      { key: "academic", label: "Academic", isDefault: true },
      { key: "cultural", label: "Cultural", isDefault: true },
      { key: "sports", label: "Sports", isDefault: true },
      { key: "technical", label: "Technical", isDefault: true },
    ],
    description: "Global Gymkhana event categories used across calendars, budgets, and related workflows.",
  },
  diningRebate: {
    value: {
      ...DEFAULT_REBATE_RULES,
      longTermFormRef: "",
      longTermFormName: "",
    },
    description:
      "Dining rebate settings: the global short-term rules (max days per dining period, max continuous days, min days per request, min advance days) and the blank long-term rebate form (media ref + display name). When the form is set, students must upload the filled form with every long-term rebate request.",
  },
  porCertificateTemplate: {
    value: {
      eyebrow: "Indian Institute of Technology Indore",
      title: "Certificate of Appointment",
      body: "This is to certify that {{name}} ({{rollNumber}}) has been appointed as {{position}} of {{club}} for the tenure {{tenure}}.\n\nWe acknowledge their valuable contribution and wish them success in their role.",
      logoRef: null,
      theme: {
        orientation: "landscape",
        fontFamily: "Times",
        accentColor: "#1360AB",
        textColor: "#1f2937",
        border: true,
      },
      signatories: [],
    },
    description:
      "POR certificate template: top logo, eyebrow/title, body text with {{variables}} (name, rollNumber, email, department, degree, batch, club, category, position, tenure, status, date), theme, and configured signatory user IDs (each must have a usable signature).",
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
    let config = await configQueries.findByKey(key)

    // If not found but default exists, create it
    if (!config && defaultConfigs[key]) {
      const defaultConfig = {
        key,
        value: defaultConfigs[key].value,
        description: defaultConfigs[key].description,
      }

      config = await configOwner.createConfig(defaultConfig)
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
