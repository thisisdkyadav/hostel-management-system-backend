import crypto from "crypto"
import { scannerOwner } from "../../../../services/scanner/scannerOwner.service.js"
import { scannerQueries } from "../../../../services/scanner/scannerQueries.service.js"
import { success, created, notFound, conflict } from "../../../../services/base/index.js"
import { AppError } from "../../../../core/errors/AppError.js"
import { hashPassword, validateCredentials } from "./face-scanner.service.js"

const validateName = (name) => {
  if (typeof name !== "string" || !name.trim()) throw new AppError("Account name is required", 400)
  return name.trim()
}

const withScanners = (account, scanners) => ({ ...account, scannerCount: scanners.length, scanners })

export const getAccounts = async () => {
  const accounts = await scannerQueries.listAccounts()
  const scanners = await scannerQueries.listScanners({ provider: "zkteco" }, { hidePasswordHash: true })
  return success(accounts.map((account) => withScanners(account,
    scanners.filter((scanner) => String(scanner.accountId?._id || scanner.accountId) === String(account._id)))))
}

export const getAccount = async (id) => {
  const account = await scannerQueries.findAccountById(id)
  if (!account) return notFound("Scanner account")
  return success(withScanners(account, await scannerQueries.listScanners({ accountId: id }, { hidePasswordHash: true })))
}

export const createAccount = async (data) => {
  const name = validateName(data.name)
  let { username, password } = data
  if ((username === undefined || (typeof username === "string" && !username.trim())) &&
      (password === undefined || password === "")) {
    username = `zk-${crypto.randomBytes(4).toString("hex")}`
    password = crypto.randomBytes(16).toString("base64url")
  }
  await validateCredentials(username, password)
  const account = await scannerOwner.createAccount({ name, username: username.trim(), passwordHash: await hashPassword(password) })
  return created({ account, credentials: { username: account.username, password } })
}

export const updateAccount = async (id, data) => {
  if (!(await scannerQueries.findAccountById(id))) return notFound("Scanner account")
  const updates = {}
  if (data.name !== undefined) updates.name = validateName(data.name)
  if (data.isActive !== undefined) {
    if (typeof data.isActive !== "boolean") throw new AppError("isActive must be a boolean", 400)
    updates.isActive = data.isActive
  }
  if (data.username !== undefined || data.password !== undefined) {
    await validateCredentials(data.username, data.password, id)
    updates.username = data.username.trim()
    updates.passwordHash = await hashPassword(data.password)
  }
  return success(await scannerOwner.updateAccountById(id, updates))
}

export const regenerateAccountPassword = async (id) => {
  if (!(await scannerQueries.findAccountById(id))) return notFound("Scanner account")
  const password = crypto.randomBytes(16).toString("base64url")
  const account = await scannerOwner.updateAccountById(id, { passwordHash: await hashPassword(password) })
  return success({ account, credentials: { username: account.username, password } })
}

export const deleteAccount = async (id) => {
  if (!(await scannerQueries.findAccountById(id))) return notFound("Scanner account")
  if (await scannerQueries.countScanners({ accountId: id })) return conflict("Move or delete its scanners first")
  await scannerOwner.deleteAccountById(id)
  return success(null, 200, "Scanner account deleted successfully")
}
