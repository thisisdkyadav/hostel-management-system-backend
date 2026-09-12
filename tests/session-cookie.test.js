import { describe, it, expect } from "vitest"
import { defaultSessionSameSite } from "../src/config/session.config.js"

describe("session cookie SameSite", () => {
  it("uses Lax for development / plain HTTP (must not change production None)", () => {
    expect(defaultSessionSameSite(true)).toBe("lax")
  })

  it("keeps None for production / HTTPS", () => {
    expect(defaultSessionSameSite(false)).toBe("None")
  })
})
