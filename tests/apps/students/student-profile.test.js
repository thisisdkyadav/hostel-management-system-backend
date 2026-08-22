import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { setupTestDb, teardownTestDb } from "../../helpers/db.js"
import { as, anon } from "../../helpers/http.js"
import { seed } from "../../helpers/seed.js"
import {
  createStudentProfile,
  createFamilyMember,
  createHealthRecord,
  setConfig,
} from "../../helpers/seed/students.js"

const BASE = "/api/v1/students/profile"

beforeAll(async () => {
  await setupTestDb()
})

afterAll(async () => {
  await teardownTestDb()
})

describe("student-profile auth wall", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const api = await anon()
    const res = await api.get(BASE)
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it("rejects non-Student roles with 403 (warden)", async () => {
    const warden = await seed.warden()
    const api = await as(warden)
    const res = await api.get(BASE)
    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
  })

  it("rejects admin with 403 on family members", async () => {
    const admin = await seed.admin()
    const api = await as(admin)
    const res = await api.get(`${BASE}/family-members`)
    expect(res.status).toBe(403)
  })
})

describe("GET / and GET /editable", () => {
  let student
  let studentApi

  beforeAll(async () => {
    student = await seed.student({ name: "Profile Owner" })
    await createStudentProfile({
      userId: student._id,
      rollNumber: "SPF001",
      dateOfBirth: "2002-03-04",
      address: "Hostel H-1",
      gender: "Male",
    })
    studentApi = await as(student)
  })

  it("returns 404 when the caller has no student profile", async () => {
    const other = await seed.student()
    const api = await as(other)
    const res = await api.get(BASE)
    expect(res.status).toBe(404)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Student profile not found")
  })

  it("GET / returns the full profile plus the editable-field list", async () => {
    const res = await studentApi.get(BASE)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const profile = res.body.data
    expect(profile.userId).toBe(String(student._id))
    expect(profile.name).toBe("Profile Owner")
    expect(profile.rollNumber).toBe("SPF001")
    expect(profile.dateOfBirth).toBe("2002-03-04")
    expect(profile.gender).toBe("Male")
    expect(profile.status).toBe("Active")

    // Default config: only profileImage + dateOfBirth are student-editable.
    expect(res.body.editableFields).toEqual(["profileImage", "dateOfBirth"])
  })

  it("GET /editable exposes exactly the configured editable fields", async () => {
    const res = await studentApi.get(`${BASE}/editable`)
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.editableFields).toEqual(["profileImage", "dateOfBirth"])
    // data IS the editableProfile map (no wrapper).
    expect(Object.keys(res.body.data).sort()).toEqual(["dateOfBirth", "profileImage"])
    expect(res.body.data.dateOfBirth).toBe("2002-03-04")
  })
})

describe("PUT / (self-service update)", () => {
  let studentApi

  beforeAll(async () => {
    const student = await seed.student()
    await createStudentProfile({
      userId: student._id,
      rollNumber: "SPU001",
      dateOfBirth: "2001-01-01",
    })
    studentApi = await as(student)
  })

  it("rejects fields that are not editable with 400", async () => {
    const res = await studentApi.put(BASE).send({ name: "New Name" })
    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toContain("No valid updates provided")
  })

  it("updates an editable field and persists it", async () => {
    const res = await studentApi.put(BASE).send({ dateOfBirth: "2001-05-06" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.message).toBe("Profile updated successfully")
    expect(res.body.data.dateOfBirth).toBe("2001-05-06")

    const followUp = await studentApi.get(BASE)
    expect(followUp.body.data.dateOfBirth).toBe("2001-05-06")
  })

  it("ignores invalid gender values (falls through to the no-updates error)", async () => {
    const res = await studentApi.put(BASE).send({ gender: "Bogus" })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("No valid updates provided")
  })
})

describe("PUT / with a widened editable-fields config", () => {
  let student
  let studentApi

  beforeAll(async () => {
    // Widen what students may edit; this is read live on every request.
    await setConfig("studentEditableFields", [
      "name",
      "phone",
      "gender",
      "address",
      "secondaryEmail",
      "bloodGroup",
      "emergencyContact",
      "familyMembers",
    ])
    student = await seed.student({ name: "Wide Config", phone: "" })
    await createStudentProfile({
      userId: student._id,
      rollNumber: "SPW001",
      gender: "Male",
    })
    // A Health doc must already exist for blood-group writes to land (see next
    // test's SUSPECTED BUG note about the non-upserting write).
    await createHealthRecord({ userId: student._id })
    studentApi = await as(student)
  })

  it("GET /editable reflects the widened config incl. guardian + family flags", async () => {
    const res = await studentApi.get(`${BASE}/editable`)
    expect(res.status).toBe(200)
    expect(res.body.editableFields).toContain("emergencyContact")
    expect(res.body.editableFields).toContain("familyMembers")

    const editable = res.body.data
    expect(editable.name).toBe("Wide Config")
    expect(editable.familyMembers).toBe(true)
    expect(editable).toHaveProperty("guardian")
    expect(editable).toHaveProperty("guardianPhone")
    expect(editable).toHaveProperty("guardianEmail")
    expect(editable.bloodGroup).toBe("")
  })

  it("updates user-level and profile-level fields in one call", async () => {
    const res = await studentApi.put(BASE).send({
      name: "Renamed Student",
      phone: "9876543210",
      gender: "Female",
      address: "New Address 42",
      secondaryEmail: "Secondary@Example.com",
      bloodGroup: "O+",
      emergencyContact: {
        guardian: "Guardian Name",
        guardianPhone: "9000000000",
        guardianEmail: "guardian@example.com",
      },
    })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const profile = res.body.data
    expect(profile.name).toBe("Renamed Student")
    expect(profile.phone).toBe("9876543210")
    expect(profile.gender).toBe("Female")
    expect(profile.address).toBe("New Address 42")
    // secondaryEmail is lowercased by the schema.
    expect(profile.secondaryEmail).toBe("secondary@example.com")
    expect(profile.guardian).toBe("Guardian Name")
    expect(profile.guardianPhone).toBe("9000000000")
    expect(profile.guardianEmail).toBe("guardian@example.com")

    // bloodGroup lands in the Health collection — verify via GET /health.
    const health = await studentApi.get(`${BASE}/health`)
    expect(health.status).toBe(200)
    expect(health.body.data.bloodGroup).toBe("O+")
  })

  it("still rejects non-editable fields like dateOfBirth with 400", async () => {
    const res = await studentApi.put(BASE).send({ dateOfBirth: "2000-10-10" })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("No valid updates provided")
  })

  it("SUSPECTED BUG: bloodGroup is silently dropped when no Health record exists", async () => {
    // SUSPECTED BUG: the blood-group write goes through
    // healthOwner.setBloodGroupByUser, a plain updateOne WITHOUT upsert. For a
    // student with no Health document the write matches nothing and the request
    // still reports success — the field just vanishes.
    const s = await seed.student()
    await createStudentProfile({ userId: s._id, rollNumber: "SPW002" })
    const api = await as(s)

    const res = await api.put(BASE).send({ bloodGroup: "AB-" })
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const health = await api.get(`${BASE}/health`)
    expect(health.status).toBe(404) // no Health doc was ever created
  })
})

describe("family members CRUD", () => {
  let student
  let otherStudent
  let studentApi
  let otherApi

  beforeAll(async () => {
    student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "FAM001" })
    otherStudent = await seed.student()
    await createStudentProfile({ userId: otherStudent._id, rollNumber: "FAM002" })
    studentApi = await as(student)
    otherApi = await as(otherStudent)
  })

  it("starts empty", async () => {
    const res = await studentApi.get(`${BASE}/family-members`)
    expect(res.status).toBe(200)
    // NOTE: this controller returns { message, data } without a `success` flag.
    expect(res.body.data).toEqual([])
  })

  it("adds a family member (201) and lists it", async () => {
    const res = await studentApi.post(`${BASE}/family-members`).send({
      name: "Test Father",
      relationship: "Father",
      phone: "9111111111",
      email: "father@example.com",
      address: "Home Address",
    })
    expect(res.status).toBe(201)
    expect(res.body.message).toBe("Family member added successfully")
    expect(res.body.data.name).toBe("Test Father")
    expect(res.body.data.relationship).toBe("Father")
    expect(String(res.body.data.userId)).toBe(String(student._id))

    const list = await studentApi.get(`${BASE}/family-members`)
    expect(list.body.data).toHaveLength(1)
    expect(list.body.data[0].phone).toBe("9111111111")
  })

  it("SUSPECTED BUG: missing required fields surface as a raw 422 validation dump", async () => {
    // SUSPECTED BUG: addFamilyMember performs no input validation; a body
    // without name/relationship/phone reaches FamilyMember.create and blows up
    // as a Mongoose ValidationError mapped to a generic 422.
    const res = await studentApi.post(`${BASE}/family-members`).send({ name: "Only A Name" })
    expect(res.status).toBe(422)
    expect(res.body.success).toBe(false)
    expect(res.body.message).toBe("Validation failed")
  })

  it("updates own family member", async () => {
    const member = await createFamilyMember({ userId: student._id, name: "Before Update" })
    const res = await studentApi
      .put(`${BASE}/family-members/${member._id}`)
      .send({ name: "After Update", relationship: "Mother", phone: "8222222222" })
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Family member updated successfully")
    expect(res.body.data.name).toBe("After Update")

    const list = await studentApi.get(`${BASE}/family-members`)
    expect(list.body.data.find((m) => m.name === "After Update")).toBeTruthy()
  })

  it("returns 404 for an unknown member id", async () => {
    const res = await studentApi
      .put(`${BASE}/family-members/000000000000000000000000`)
      .send({ name: "Ghost" })
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Family member not found")
  })

  it("forbids updating another student's family member with 403", async () => {
    const member = await createFamilyMember({ userId: student._id, name: "Not Yours" })
    const res = await otherApi
      .put(`${BASE}/family-members/${member._id}`)
      .send({ name: "Hijacked" })
    expect(res.status).toBe(403)
    expect(res.body.message).toContain("permission")
  })

  it("deletes own family member and confirms via the list", async () => {
    const member = await createFamilyMember({ userId: student._id, name: "Doomed Member" })
    const res = await studentApi.delete(`${BASE}/family-members/${member._id}`)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Family member deleted successfully")

    const list = await studentApi.get(`${BASE}/family-members`)
    expect(list.body.data.find((m) => m.name === "Doomed Member")).toBeUndefined()
  })

  it("returns 404 when deleting an unknown member", async () => {
    const res = await studentApi.delete(`${BASE}/family-members/000000000000000000000000`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Family member not found")
  })

  it("forbids deleting another student's family member with 403", async () => {
    const member = await createFamilyMember({ userId: student._id, name: "Still Not Yours" })
    const res = await otherApi.delete(`${BASE}/family-members/${member._id}`)
    expect(res.status).toBe(403)
  })
})

describe("GET /health", () => {
  it("returns 404 when no health record exists", async () => {
    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "HLT001" })
    const api = await as(student)
    const res = await api.get(`${BASE}/health`)
    expect(res.status).toBe(404)
    expect(res.body.message).toBe("Health data not found")
  })

  it("returns the health record with blood group and insurance number", async () => {
    const student = await seed.student()
    await createStudentProfile({ userId: student._id, rollNumber: "HLT002" })
    await createHealthRecord({
      userId: student._id,
      bloodGroup: "O+",
      insuranceNumber: "INS-123456",
    })
    const api = await as(student)
    const res = await api.get(`${BASE}/health`)
    expect(res.status).toBe(200)
    expect(res.body.message).toBe("Health data fetched successfully")
    expect(res.body.data.bloodGroup).toBe("O+")
    expect(res.body.data.insurance.insuranceNumber).toBe("INS-123456")
  })
})

// ---------------------------------------------------------------------------
// Hardening: PUT / validation one field at a time
// ---------------------------------------------------------------------------

describe("PUT / one-field-at-a-time update semantics", () => {
  let student
  let studentApi

  beforeAll(async () => {
    // NOTE: the widened editable-fields config from the describe above is
    // still live here; it is restored in afterAll below.
    student = await seed.student({ name: "One Field", phone: "" })
    await createStudentProfile({
      userId: student._id,
      rollNumber: "SPO001",
      gender: "Male",
      address: "",
    })
    await createHealthRecord({ userId: student._id })
    studentApi = await as(student)
  })

  afterAll(async () => {
    // Put the shipped default back so nothing downstream inherits the widen.
    await setConfig("studentEditableFields", ["profileImage", "dateOfBirth"])
  })

  it("updates gender alone", async () => {
    const res = await studentApi.put(BASE).send({ gender: "Other" })
    expect(res.status).toBe(200)
    const followUp = await studentApi.get(BASE)
    expect(followUp.body.data.gender).toBe("Other")
    expect(followUp.body.data.name).toBe("One Field") // untouched
  })

  it("updates phone alone", async () => {
    const res = await studentApi.put(BASE).send({ phone: "9123456780" })
    expect(res.status).toBe(200)
    const followUp = await studentApi.get(BASE)
    expect(followUp.body.data.phone).toBe("9123456780")
  })

  it("updates secondaryEmail alone (schema lowercases it)", async () => {
    const res = await studentApi.put(BASE).send({ secondaryEmail: "OneField@Example.COM" })
    expect(res.status).toBe(200)
    const followUp = await studentApi.get(BASE)
    expect(followUp.body.data.secondaryEmail).toBe("onefield@example.com")
  })

  it("updates address alone", async () => {
    const res = await studentApi.put(BASE).send({ address: "Only Address Lane" })
    expect(res.status).toBe(200)
    const followUp = await studentApi.get(BASE)
    expect(followUp.body.data.address).toBe("Only Address Lane")
  })

  it("updates the emergency-contact block alone", async () => {
    const res = await studentApi.put(BASE).send({
      emergencyContact: {
        guardian: "Solo Guardian",
        guardianPhone: "9333333333",
        guardianEmail: "solo-guardian@example.com",
      },
    })
    expect(res.status).toBe(200)
    const followUp = await studentApi.get(BASE)
    expect(followUp.body.data.guardian).toBe("Solo Guardian")
    expect(followUp.body.data.guardianPhone).toBe("9333333333")
    expect(followUp.body.data.guardianEmail).toBe("solo-guardian@example.com")
  })

  it("rejects a single protected field (rollNumber) with 400", async () => {
    const res = await studentApi.put(BASE).send({ rollNumber: "HACKED1" })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain("No valid updates provided")

    const followUp = await studentApi.get(BASE)
    expect(followUp.body.data.rollNumber).toBe("SPO001")
  })

  it("silently drops an invalid value while applying the valid field in the same call", async () => {
    // Bogus gender fails its whitelist check but must not poison the address
    // update riding along in the same payload.
    const res = await studentApi.put(BASE).send({ gender: "Bogus", address: "Mixed Call Road" })
    expect(res.status).toBe(200)
    const followUp = await studentApi.get(BASE)
    expect(followUp.body.data.address).toBe("Mixed Call Road")
    expect(followUp.body.data.gender).toBe("Other") // unchanged from the prior test
  })

  it("ignores null-valued fields instead of clearing them", async () => {
    const res = await studentApi.put(BASE).send({ address: null, gender: "Female" })
    expect(res.status).toBe(200)
    const followUp = await studentApi.get(BASE)
    expect(followUp.body.data.address).toBe("Mixed Call Road") // null did NOT wipe it
    expect(followUp.body.data.gender).toBe("Female")
  })
})
