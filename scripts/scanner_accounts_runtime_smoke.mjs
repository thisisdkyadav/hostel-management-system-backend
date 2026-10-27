/** Real HTTP + Mongo/Redis smoke. ONLY hms_scanner_smoke may be dropped.
 * Run from backend/: npm run smoke:scanner-accounts
 */
import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import mongoose from "mongoose"
import crypto from "node:crypto"

const run = promisify(execFile)
const uri = process.env.SCANNER_SMOKE_MONGO_URI || "mongodb://127.0.0.1:27017/hms_scanner_smoke?replicaSet=rs0"
if (new URL(uri).pathname !== "/hms_scanner_smoke") throw new Error("Smoke URI must use hms_scanner_smoke")
Object.assign(process.env, {
  MONGO_URI: uri, NODE_ENV: "development", SESSION_SECRET: "scanner-smoke-secret",
  REDIS_SESSION_PREFIX: `scanner-smoke:${process.pid}:`, USE_LOCAL_STORAGE: "true",
  SMTP_USER: "", SMTP_PASS: "", SMTP_ACCOUNTS: "[]",
})
let assertions = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); assertions++ }
const ok = (value, label) => { assert.ok(value, label); assertions++ }
const noHashes = (value) => { ok(!JSON.stringify(value).includes('"passwordHash"'), "no hashes in HTTP response") }
const base = "/api/v1/face-scanner"
const basic = (username, password) => `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`
const migration = async (...args) => {
  const result = await run(process.execPath, ["scripts/migrate_face_scanner_accounts.mjs", ...args], { env: process.env, cwd: new URL("..", import.meta.url) })
  return result.stdout + result.stderr
}

try {
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false })
  eq(mongoose.connection.db.databaseName, "hms_scanner_smoke", "database guard")
  await mongoose.connection.db.dropDatabase()
  const { scannerOwner } = await import("../src/services/scanner/scannerOwner.service.js")
  const { scannerQueries } = await import("../src/services/scanner/scannerQueries.service.js")
  await scannerOwner.syncAccountScannerIndexes()
  const { seed } = await import("../tests/helpers/seed.js")
  const { as, anon } = await import("../tests/helpers/http.js")
  const { allocateStudent } = await import("../tests/helpers/seed/face-scan.js")
  const { catererFixture, periodFixture, studentFixture, roomFixture } = await import("../tests/helpers/seed/dining-caterer.js")
  const { initRealtime } = await import("../tests/helpers/seed/operations.js")
  await initRealtime()
  const api = await as(await seed.admin())
  const publicApi = await anon()
  const request = async (method, path, body, status = 200, client = api) => {
    let req = client[method](base + path)
    if (body !== undefined) req = req.send(body)
    const res = await req
    eq(res.status, status, `${method} ${path}: ${JSON.stringify(res.body)}`)
    noHashes(res.body)
    return res.body
  }
  const hit = async (path, body, credentials, status = 200, header = {}) => {
    let req = body === undefined ? publicApi.get(base + path) : publicApi.post(base + path).send(body)
    if (credentials) req = req.set("Authorization", basic(credentials.username, credentials.password))
    for (const [name, value] of Object.entries(header)) req = req.set(name, value)
    const res = await req
    eq(res.status, status, `device ${path}: ${JSON.stringify(res.body)}`)
    noHashes(res.body)
    return res.body
  }
  await request("get", "/accounts", undefined, 401, publicApi)
  await request("get", "/accounts", undefined, 403, await as(await seed.student()))
  await request("get", "/accounts", undefined, 200, await as(await seed.superAdmin()))
  const creds = { username: "Shared.Login+ZK", password: "shared-pass" }
  const first = (await request("post", "/accounts", { name: " Main hall ", ...creds }, 201)).data
  const accountId = first.account._id
  eq(first.account.name, "Main hall")
  eq(first.credentials, creds)
  eq(first.account.provider, "zkteco")
  const generated = (await request("post", "/accounts", { name: "Generated", username: "", password: "" }, 201)).data
  ok(/^zk-[a-f0-9]{8}$/.test(generated.credentials.username))
  eq(Buffer.from(generated.credentials.password, "base64url").length, 16)
  const account2 = generated.account._id
  await request("post", "/accounts", { name: "Collision", username: creds.username.toUpperCase(), password: "x" }, 409)
  await request("put", `/accounts/${account2}`, { username: creds.username.toLowerCase(), password: "x" }, 409)
  // Verify the unique collation index independently of the service preflight.
  await assert.rejects(() => scannerOwner.createAccount({ name: "Race", username: creds.username.toUpperCase(), passwordHash: "unused" }), { code: 11000 }); assertions++
  for (const invalid of [
    { name: "" }, { name: "Bad", username: "only-user" }, { name: "Bad", password: "only-password" },
    { name: "Bad", username: "bad:name", password: "x" }, { name: "Bad", username: "good", password: "é".repeat(37) },
  ]) await request("post", "/accounts", invalid, 400)
  await request("put", `/accounts/${accountId}`, { password: "only" }, 400)
  const updated = (await request("put", `/accounts/${accountId}`, { name: "Renamed", ...creds })).data
  eq(updated.name, "Renamed")
  eq(updated.credentials, undefined)
  await request("get", "/accounts/not-an-id", undefined, 400)
  await request("get", "/accounts/000000000000000000000000", undefined, 404)

  const config = (deviceName, extra = {}) => ({ name: deviceName, provider: "zkteco", accountId, deviceName, type: "hostel-gate", direction: "in", ...extra })
  await request("post", "", config("no-account", { accountId: undefined }), 400)
  await request("post", "", config("no-account", { accountId: "000000000000000000000000" }), 400)
  await request("post", "", config("no-name", { deviceName: " " }), 400)
  for (const supplied of [{ username: "x" }, { password: "x" }, { passwordHash: "x" }]) {
    await request("post", "", config("rejected", supplied), 400)
  }
  const { user: gateStudent, allocation: gateAllocation } = await allocateStudent({ rollNumber: "SCANNER-GATE" })
  const { caterer } = await catererFixture()
  const period = await periodFixture(caterer, "2026-10-01", "2026-10-31")
  const mealStudent = await studentFixture(period, caterer, "Meal student", "SCANNER-MEAL")
  await roomFixture(mealStudent)
  const a = (await request("post", "", config("m1", { hostelId: String(gateAllocation.hostelId) }), 201)).data
  eq(Object.keys(a), ["scanner"])
  eq(a.scanner.username, undefined)
  eq(a.scanner.accountId, accountId)
  const b = (await request("post", "", config("m2", { type: "dining-meal", catererId: String(caterer._id), direction: "out" }), 201)).data.scanner
  await request("post", "", config("m1"), 409)
  const c = (await request("post", "", config("m1", { accountId: account2 }), 201)).data.scanner
  const otherOnly = (await request("post", "", config("only-other-account", { accountId: account2 }), 201)).data.scanner
  await hit("/ping?deviceName=only-other-account", undefined, creds, 401)
  await hit("/ping?deviceName=only-other-account", undefined, generated.credentials)
  await request("delete", `/${otherOnly._id}`)
  const filtered = (await request("get", `?accountId=${accountId}`)).data
  eq(filtered.length, 2)
  eq(filtered[0].accountId.username, creds.username)
  eq(filtered[0].accountId.isActive, true)
  const detail = (await request("get", `/accounts/${accountId}`)).data
  eq(detail.scannerCount, 2)
  eq(detail.scanners.find((s) => s._id === b._id).catererId.name, caterer.name)
  const accounts = (await request("get", "/accounts")).data
  eq(accounts.find((a) => a._id === account2).scannerCount, 1)
  const cannotDelete = await request("delete", `/accounts/${accountId}`, undefined, 409)
  eq(cannotDelete.message, "Move or delete its scanners first")
  await request("post", `/${a.scanner._id}/regenerate-password`, undefined, 400)
  await request("put", `/${a.scanner._id}`, { username: "reject", password: "reject" }, 400)
  await request("put", `/${a.scanner._id}`, { passwordHash: "reject" }, 400)
  await request("put", `/${a.scanner._id}`, { provider: "time-watch" }, 400)
  await request("put", `/${c._id}`, { accountId }, 409)
  await request("put", `/${c._id}`, { accountId, deviceName: "m3" })
  eq((await request("get", `/accounts/${account2}`)).data.scannerCount, 0)
  await request("delete", `/accounts/${account2}`)
  await request("get", `/accounts/${account2}`, undefined, 404)
  await request("put", `/${a.scanner._id}`, { accountId: null }, 400)

  const punch = (alias, roll = "SCANNER-GATE") => ({ EMP_CODE: roll, PUNCH_DATETIME: "06-10-2026 12:00:00", TERMINAL_ALIAS: alias })
  const auth = await hit("/test-auth?deviceName=m1", undefined, { ...creds, username: creds.username.toLowerCase() })
  eq(auth.scanner.accountId, accountId)
  eq(auth.scanner.username, undefined)
  const mixed = await hit("/scan", [punch(" m1 "), punch("m2", mealStudent.profile.rollNumber)], creds)
  eq(mixed, { status: "success", code: 200, message: "Attendance data processed successfully" })
  const db = mongoose.connection.db
  // Resolve collection names from the known model registrations for fixture assertions.
  const { CheckInOut, DiningMealVerification } = await import("../src/models/index.js")
  const gateEntries = await CheckInOut.find({ userId: gateStudent._id }).lean()
  eq(gateEntries.length, 1)
  eq(gateEntries[0].status, "Checked In")
  const mealEntries = await DiningMealVerification.find({ scannerId: b._id }).lean()
  eq(mealEntries.length, 1)
  eq(mealEntries[0].status, "verified")
  eq(String(mealEntries[0].catererId), String(caterer._id))
  eq(mealEntries[0].deviceId, "m2")
  eq((await scannerQueries.findAccountById(accountId)).lastActiveAt instanceof Date, true)
  ok((await scannerQueries.findScannerById(a.scanner._id)).lastActiveAt)
  eq((await hit("/scan", [punch("m1"), punch("unknown")], creds, 401)).outputMessage, "Unknown or inactive ZKTeco device")
  eq((await CheckInOut.find({ userId: gateStudent._id })).length, 1, "whole unknown-alias batch rejected")
  eq((await hit("/scan", [{ EMP_CODE: "SCANNER-GATE" }], creds, 401)).outputMessage, "Unknown or inactive ZKTeco device")
  await hit("/scan", [], creds, 401)
  eq((await hit("/ping", undefined, creds, 401)).outputMessage, "Unknown or inactive ZKTeco device")
  eq((await hit("/scan", [punch("m1")], { ...creds, password: "wrong" }, 401)).outputMessage, "Invalid credentials")
  await request("put", `/accounts/${accountId}`, { isActive: false })
  eq((await hit("/scan", [punch("m1")], creds, 401)).outputMessage, "Invalid credentials")
  await request("put", `/accounts/${accountId}`, { isActive: true })
  await request("put", `/${b._id}`, { isActive: false })
  await hit("/scan", [punch("m1"), punch("m2")], creds, 401)
  await request("put", `/${b._id}`, { isActive: true })
  const regen = (await request("post", `/accounts/${accountId}/regenerate-password`)).data
  eq(regen.credentials.username, creds.username)
  ok(regen.credentials.password !== creds.password)
  await hit("/ping?deviceName=m1", undefined, creds, 401)
  creds.password = regen.credentials.password
  await hit("/ping?deviceName=m1", undefined, creds)
  await hit("/ping?deviceName=m2", undefined, creds)
  await hit("/scan", [punch("m1")], null, 401, { [creds.username.toLowerCase()]: creds.password })

  // Reserve a Time Watch-style username on an account, then force a generated
  // scanner username collision to verify uniqueness in the reverse direction.
  const reservedUsername = `scanner-${"00".repeat(8)}`
  await request("post", "/accounts", { name: "Reserved", username: reservedUsername.toUpperCase(), password: "x" }, 201)
  const originalRandomBytes = crypto.randomBytes
  crypto.randomBytes = (size, ...args) => size === 8 ? Buffer.alloc(8) : originalRandomBytes(size, ...args)
  try {
    await request("post", "", { name: "TW collision", provider: "time-watch", type: "hostel-gate", direction: "in" }, 409)
    await request("post", "", { name: "Legacy collision", type: "hostel-gate", direction: "in" }, 409)
  } finally {
    crypto.randomBytes = originalRandomBytes
  }

  // Time Watch and provider-less legacy: identical credentials, auth, and response formats.
  for (const provider of ["time-watch", undefined]) {
    const tw = (await request("post", "", { name: `TW-${provider}`, provider, type: "hostel-gate", direction: "in", hostelId: String(gateAllocation.hostelId) }, 201)).data
    ok(tw.credentials.username.startsWith("scanner-"))
    eq(tw.scanner.provider, provider)
    await hit("/ping", undefined, tw.credentials)
    await hit("/test-auth", undefined, null, 200, { [tw.credentials.username]: tw.credentials.password })
    const native = { deviceID: "TW1", employeeID: "SCANNER-GATE", date: "2026-10-06", time: "13:00:00", modeofPunch: "Face" }
    eq(await hit("/scan", native, null, 200, { [tw.credentials.username]: tw.credentials.password }), { isSuccess: "Y", outputMessage: "Added Successfully" })
    eq(await hit("/ping", undefined, { ...tw.credentials, password: "bad" }, 401), { isSuccess: "N", outputMessage: "Invalid credentials" })
    await hit("/scan", [punch("legacy-alias")], tw.credentials, provider ? 401 : 200)
    if (provider) await hit("/scan", [{ EMP_CODE: "SCANNER-GATE" }], tw.credentials, 400)
    await request("post", "/accounts", { name: "TW collision", username: tw.credentials.username.toUpperCase(), password: "x" }, 409)
    await request("put", `/accounts/${accountId}`, { username: tw.credentials.username.toUpperCase(), password: "x" }, 409)
    const rotated = (await request("post", `/${tw.scanner._id}/regenerate-password`)).data
    eq(rotated.credentials.username, tw.credentials.username)
    await hit("/ping", undefined, tw.credentials, 401)
    await hit("/ping", undefined, rotated.credentials)
    // A Basic account login can never fall back to a valid legacy header.
    await hit("/ping", undefined, { ...creds, password: "bad" }, 401, { [rotated.credentials.username]: rotated.credentials.password })
    // Switching to ZKTeco requires account + alias and removes device credentials.
    await request("put", `/${tw.scanner._id}`, { provider: "zkteco", deviceName: `converted-${provider}` }, 400)
    const converted = (await request("put", `/${tw.scanner._id}`, { provider: "zkteco", accountId, deviceName: `converted-${provider}` })).data
    eq(converted.username, undefined)
    await hit(`/ping?deviceName=converted-${provider}`, undefined, creds)
  }
  console.log(`HTTP and auth assertions passed: ${assertions}`)

  // Migration fixture: old provider-era indexes + old raw documents (bypass new validation).
  await db.collection("facescanners").deleteMany({})
  await db.collection("scanneraccounts").deleteMany({})
  for (const index of await scannerQueries.scannerIndexes()) if (index.name !== "_id_") await db.collection("facescanners").dropIndex(index.name)
  await db.collection("facescanners").createIndex({ deviceName: 1 }, { unique: true, partialFilterExpression: { provider: "zkteco" } })
  const { hashPassword } = await import("../src/apps/operations/modules/face-scanner/face-scanner.service.js")
  const oldHash = await hashPassword("old-password")
  const latestHash = await hashPassword("latest-password")
  const legacy = { name: "Unaffected legacy", username: "legacy-old", passwordHash: oldHash, type: "hostel-gate", direction: "in", isActive: true }
  await db.collection("facescanners").insertMany([
    { ...legacy, provider: "zkteco", username: "OldShared", deviceName: "old-m1", updatedAt: new Date("2026-01-01") },
    { ...legacy, provider: "zkteco", username: "OLDSHARED", passwordHash: latestHash, deviceName: "old-m2", updatedAt: new Date("2026-02-01") },
    { ...legacy, provider: "zkteco", username: "Separate", deviceName: "old-m3", updatedAt: new Date("2026-01-01") },
    legacy,
  ])
  const before = await db.collection("facescanners").find().toArray()
  const indexesBefore = await scannerQueries.scannerIndexes()
  const dry = await migration()
  ok(dry.includes("Dry run: 2 account group(s), 3 scanner(s)"))
  ok(dry.includes("WARN shared username"))
  eq(await db.collection("scanneraccounts").countDocuments(), 0)
  eq(await db.collection("facescanners").find().toArray(), before)
  eq(await scannerQueries.scannerIndexes(), indexesBefore)
  const applied = await migration("--apply")
  ok(applied.includes("Applied: 2 account group(s), 3 scanner(s)"))
  eq(await db.collection("scanneraccounts").countDocuments(), 2)
  const migrated = await db.collection("facescanners").find({ provider: "zkteco" }).toArray()
  eq(migrated.length, 3)
  ok(migrated.every((s) => s.accountId && !("username" in s) && !("passwordHash" in s)))
  eq(String(migrated[0].accountId), String(migrated[1].accountId))
  const shared = await scannerQueries.findAccountByUsername("oldshared")
  eq(shared.username, "OLDSHARED")
  eq(shared.passwordHash, latestHash)
  eq(shared.name, "OLDSHARED")
  eq(await db.collection("facescanners").findOne({ username: "legacy-old" }), before[3])
  const indexesAfter = await scannerQueries.scannerIndexes()
  ok(!indexesAfter.some((i) => i.unique && Object.keys(i.key).length === 1 && i.key.deviceName === 1))
  ok(indexesAfter.some((i) => i.unique && i.key.accountId === 1 && i.key.deviceName === 1))
  const allAfter = await db.collection("facescanners").find().toArray()
  const accountsAfter = await db.collection("scanneraccounts").find().toArray()
  const again = await migration("--apply")
  ok(again.includes("Applied: 0 account group(s), 0 scanner(s)"))
  eq(await db.collection("facescanners").find().toArray(), allAfter)
  eq(await db.collection("scanneraccounts").find().toArray(), accountsAfter)
  eq(await scannerQueries.scannerIndexes(), indexesAfter)
  await hit("/ping?deviceName=old-m1", undefined, { username: "oldshared", password: "latest-password" })
  await hit("/ping?deviceName=old-m2", undefined, { username: "oldshared", password: "latest-password" })
  await hit("/ping?deviceName=old-m1", undefined, { username: "oldshared", password: "old-password" }, 401)
  console.log(`PASS scanner accounts runtime smoke: ${assertions} assertions (HTTP, auth, migration).`)
} finally {
  if (mongoose.connection.readyState === 1) {
    assert.equal(mongoose.connection.db.databaseName, "hms_scanner_smoke")
    await mongoose.connection.db.dropDatabase()
  }
  await mongoose.disconnect()
  const { getSessionRedisClient, closeSessionRedisClient } = await import("../src/services/session/redisSessionClient.js")
  const redis = getSessionRedisClient()
  const keys = await redis.keys(`${process.env.REDIS_SESSION_PREFIX}*`)
  if (keys.length) await redis.del(...keys)
  await closeSessionRedisClient()
  const { closeDataCacheClient } = await import("../src/services/cache/redisDataCache.client.js")
  await closeDataCacheClient()
  const { closeSocketIO } = await import("../src/loaders/socket.loader.js")
  await closeSocketIO()
}
