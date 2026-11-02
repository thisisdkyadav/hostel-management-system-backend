import { describe, expect, it } from "vitest"
import { findMealSlotForTime } from "../../../src/services/dining/mealSchedule.js"

const slots = [
  { name: "Breakfast", startTime: "07:30", endTime: "09:30" },
  { name: "Lunch", startTime: "12:00", endTime: "14:00" },
  { name: "Snacks", startTime: "17:00", endTime: "18:00" },
  { name: "Dinner", startTime: "19:30", endTime: "21:30" },
]
const at = (hhmm) => {
  const [h, m] = hhmm.split(":").map(Number)
  return new Date(2026, 10, 2, h, m)
}
const mealAt = (hhmm, list = slots) => {
  const found = findMealSlotForTime(list, at(hhmm))
  return found ? `${found.slot.name}:${found.match}` : null
}

describe("findMealSlotForTime (meal buffers)", () => {
  it("matches inside a meal's own timings, edges included", () => {
    expect(mealAt("07:30")).toBe("Breakfast:inside")
    expect(mealAt("13:00")).toBe("Lunch:inside")
    expect(mealAt("21:30")).toBe("Dinner:inside")
  })

  it("counts up to 30 minutes before a meal as that meal", () => {
    expect(mealAt("07:00")).toBe("Breakfast:early")
    expect(mealAt("11:45")).toBe("Lunch:early")
    expect(mealAt("06:59")).toBeNull()
  })

  it("counts up to 60 minutes after a meal as that meal", () => {
    expect(mealAt("10:30")).toBe("Breakfast:late")
    expect(mealAt("15:00")).toBe("Lunch:late")
    expect(mealAt("22:30")).toBe("Dinner:late")
    expect(mealAt("10:31")).toBeNull()
    expect(mealAt("22:31")).toBeNull()
  })

  it("keeps times outside every buffer as outside meal time", () => {
    expect(mealAt("11:00")).toBeNull()
    expect(mealAt("16:00")).toBeNull()
    expect(mealAt("03:00")).toBeNull()
  })

  it("picks the nearer meal when buffers overlap; inside always wins", () => {
    // Snacks end 18:00 (late buffer to 19:00); Dinner starts 19:30 (early buffer from 19:00).
    expect(mealAt("18:40")).toBe("Snacks:late")
    expect(mealAt("19:10")).toBe("Dinner:early")
    const tight = [
      { name: "Lunch", startTime: "12:00", endTime: "14:00" },
      { name: "Tea", startTime: "14:20", endTime: "15:00" },
    ]
    expect(mealAt("14:05", tight)).toBe("Lunch:late")
    expect(mealAt("14:15", tight)).toBe("Tea:early")
    expect(mealAt("14:20", tight)).toBe("Tea:inside")
  })

  it("handles overnight meals and does not carry a late buffer past midnight", () => {
    const night = [{ name: "Night", startTime: "22:00", endTime: "02:00" }]
    expect(mealAt("23:30", night)).toBe("Night:inside")
    expect(mealAt("01:00", night)).toBe("Night:inside")
    expect(mealAt("02:45", night)).toBe("Night:late")
    expect(mealAt("21:40", night)).toBe("Night:early")
    expect(mealAt("00:30")).toBeNull() // dinner's buffer ends 22:30
  })

  it("ignores slots with bad timings", () => {
    expect(mealAt("12:00", [{ name: "Broken", startTime: "", endTime: "x" }])).toBeNull()
  })
})
