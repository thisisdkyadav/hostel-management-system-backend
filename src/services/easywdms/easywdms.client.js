/**
 * EasyWDMS client (ZKTeco face-scanner software running next to HMS).
 *
 * HMS logs in with a stored EasyWDMS admin account and uses the portal's own
 * "Import Bio-Photo" action (Device › Data › Bio-Photo › Import Bio-Photo).
 * On this install imports are auto-approved, so EasyWDMS queues the photo for
 * every machine itself. Nothing here touches the EasyWDMS database.
 *
 * Login protocol (from the portal's login page):
 *   GET  /login/  → csrftoken cookie + hidden csrfmiddlewaretoken
 *   POST /login/  encrypt_data = base64(rc4(key = csrfmiddlewaretoken,
 *                 text = "csrfmiddlewaretoken=…&username=…&password=…&template10=&login_type="))
 *                 → JSON { ret: 0 } and a sessionid cookie
 * Import:
 *   POST /iclock/biophoto/action/ multipart: action_name (hex of "ImportBioPhoto"), csrfmiddlewaretoken,
 *        bio_photo (<roll>.jpg|png), overwrite, ignore_error
 *        → JSON { code: 0, msg: "" } or { code: -1, msg: "…" }
 *
 * REST API (employees, terminals): POST /api-token-auth/ {username,password}
 *   → { token }, then "Authorization: Token <token>" on /personnel/api/… and
 *   /iclock/api/…. Creating an employee needs emp_code, first_name,
 *   department, position, area.
 * Portal grids (bio photos, terminal command results) have no REST endpoint:
 *   GET /iclock/<model>/table/?page=&limit= with the session and
 *   "Accept: application/json" returns { count, data } (newest first).
 *
 * Credentials come from env (EASYWDMS_*) and are never logged or returned.
 */

import { env } from "../../config/env.config.js"

// The portal names actions by the hex of their class name ("ImportBioPhoto"),
// as listed in GET /iclock/biophoto/table/ → action_choices, and posts that.
export const IMPORT_ACTION_NAME = Buffer.from("ImportBioPhoto", "utf8").toString("hex")
const REQUEST_TIMEOUT_MS = 30_000
const LOGIN_PATH = "/login/"
const IMPORT_PATH = "/iclock/biophoto/action/"
const BIOPHOTO_PAGE = "/iclock/biophoto/"
const TOKEN_PATH = "/api-token-auth/"
const GRID_PAGE_SIZE = 1000
const GRID_HEADERS = { "X-Requested-With": "XMLHttpRequest", Accept: "application/json, text/javascript, */*; q=0.01" }
const ROLL_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export const isScannerRollNumber = (value) => ROLL_PATTERN.test(String(value || ""))

export class EasyWdmsError extends Error {
  constructor(message, { kind = "upload" } = {}) {
    super(message)
    this.name = "EasyWdmsError"
    this.kind = kind
  }
}

// ---------------------------------------------------------------------------
// Portal login encryption (RC4 keyed by the CSRF token, then base64 of the
// byte string — the same as the portal's zkEncrypt()).
// ---------------------------------------------------------------------------

export const rc4 = (key, text) => {
  const s = Array.from({ length: 256 }, (_, index) => index)
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key.charCodeAt(i % key.length)) % 256
    ;[s[i], s[j]] = [s[j], s[i]]
  }
  let i = 0
  j = 0
  let out = ""
  for (let y = 0; y < text.length; y++) {
    i = (i + 1) % 256
    j = (j + s[i]) % 256
    ;[s[i], s[j]] = [s[j], s[i]]
    out += String.fromCharCode(text.charCodeAt(y) ^ s[(s[i] + s[j]) % 256])
  }
  return out
}

/** jQuery's form.serialize(): application/x-www-form-urlencoded with %20 → "+". */
const serializeForm = (pairs) =>
  pairs.map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`.replace(/%20/g, "+")).join("&")

/** The portal's encrypt_data for an admin login. */
export const buildLoginPayload = ({ csrfToken, username, password }) => {
  const text = serializeForm([
    ["csrfmiddlewaretoken", csrfToken],
    ["username", username],
    ["password", password],
    ["template10", ""],
    ["login_type", ""],
  ])
  return Buffer.from(rc4(csrfToken, text), "latin1").toString("base64")
}

const CSRF_INPUT = /name=["']csrfmiddlewaretoken["']\s+value=["']([^"']+)["']|value=["']([^"']+)["']\s+name=["']csrfmiddlewaretoken["']/i

export const extractCsrfInput = (html) => {
  const match = String(html || "").match(CSRF_INPUT)
  return match ? match[1] || match[2] : ""
}

// ---------------------------------------------------------------------------
// Minimal cookie jar
// ---------------------------------------------------------------------------

class CookieJar {
  constructor() {
    this.cookies = new Map()
  }
  absorb(response) {
    const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []
    for (const line of lines) {
      const [pair] = line.split(";")
      const eq = pair.indexOf("=")
      if (eq <= 0) continue
      const name = pair.slice(0, eq).trim()
      const value = pair.slice(eq + 1).trim()
      if (!value || /max-age=0/i.test(line) || /expires=thu, 01 jan 1970/i.test(line)) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }
  get(name) {
    return this.cookies.get(name) || ""
  }
  header() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ")
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

const isLoginRedirect = (response) => {
  const location = response.headers.get("location") || ""
  return response.status >= 300 && response.status < 400 && location.includes(LOGIN_PATH)
}

export class EasyWdmsClient {
  constructor({ baseUrl, username, password, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl
    this.username = username
    this.password = password
    this.fetch = fetchImpl
    this.jar = new CookieJar()
    this.loggedIn = false
    this.queue = Promise.resolve()
    this.token = ""
    this.setup = null
  }

  get configured() {
    return Boolean(this.baseUrl && this.username && this.password)
  }

  async request(path, { method = "GET", headers = {}, body } = {}) {
    let response
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Cookie: this.jar.header(), ...headers },
      })
    } catch (error) {
      throw new EasyWdmsError(`Couldn't reach the face scanner software (${error?.name === "TimeoutError" ? "timed out" : error?.message || "network error"})`, { kind: "network" })
    }
    this.jar.absorb(response)
    return response
  }

  async login() {
    this.loggedIn = false
    this.jar = new CookieJar()
    const page = await this.request(LOGIN_PATH)
    const csrfToken = extractCsrfInput(await page.text())
    if (!page.ok || !csrfToken) throw new EasyWdmsError("The face scanner software's login page didn't load", { kind: "login" })

    const response = await this.request(LOGIN_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": this.jar.get("csrftoken") || csrfToken,
        Referer: `${this.baseUrl}${LOGIN_PATH}`,
      },
      body: new URLSearchParams({
        encrypt_data: buildLoginPayload({ csrfToken, username: this.username, password: this.password }),
        csrfmiddlewaretoken: csrfToken,
      }).toString(),
    })
    let result = null
    try {
      result = await response.json()
    } catch {
      result = null
    }
    if (!response.ok || result?.ret !== 0 || !this.jar.get("sessionid")) {
      throw new EasyWdmsError("Couldn't log in to the face scanner software. Check the stored EasyWDMS username and password.", { kind: "login" })
    }
    this.loggedIn = true
  }

  async postImport({ rollNumber, buffer, contentType, overwrite }) {
    const extension = contentType === "image/png" ? "png" : "jpg"
    const csrfToken = this.jar.get("csrftoken")
    const form = new FormData()
    form.append("action_name", IMPORT_ACTION_NAME)
    form.append("csrfmiddlewaretoken", csrfToken)
    form.append("overwrite", overwrite ? "1" : "0")
    form.append("ignore_error", "0")
    form.append("bio_photo", new Blob([buffer], { type: contentType }), `${rollNumber}.${extension}`)
    return this.request(IMPORT_PATH, {
      method: "POST",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
        "X-CSRFToken": csrfToken,
        Referer: `${this.baseUrl}${BIOPHOTO_PAGE}`,
      },
      body: form,
    })
  }

  /** Run one task at a time per process: EasyWDMS sessions are shared state. */
  serial(task) {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => {})
    return run
  }

  /**
   * Upload one student's bio photo. Resolves on success; throws EasyWdmsError
   * with EasyWDMS's own message otherwise. Re-logs in once on an expired session.
   */
  async importBioPhoto({ rollNumber, buffer, contentType, overwrite = true }) {
    if (!this.configured) throw new EasyWdmsError("The face scanner software isn't connected yet", { kind: "config" })
    if (!isScannerRollNumber(rollNumber)) {
      throw new EasyWdmsError("This roll number can't be used as a scanner employee ID", { kind: "input" })
    }
    return this.serial(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (!this.loggedIn) await this.login()
        const response = await this.postImport({ rollNumber, buffer, contentType, overwrite })
        if (isLoginRedirect(response) || response.status === 403) {
          this.loggedIn = false
          continue
        }
        let result = null
        try {
          result = await response.json()
        } catch {
          result = null
        }
        if (response.ok && result && Number(result.code) === 0) return { ok: true }
        const message = String(result?.msg || "").trim()
        throw new EasyWdmsError(
          message ? `Face scanner software: ${message}` : `The face scanner software returned an unexpected response (HTTP ${response.status})`
        )
      }
      throw new EasyWdmsError("Couldn't stay logged in to the face scanner software", { kind: "login" })
    })
  }

  // ------------------------------------------------------------------ REST API

  async fetchToken() {
    const response = await this.request(TOKEN_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: this.username, password: this.password }),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || !result?.token) {
      throw new EasyWdmsError("Couldn't log in to the face scanner software. Check the stored EasyWDMS username and password.", { kind: "login" })
    }
    this.token = result.token
    return this.token
  }

  /** JSON call to the REST API; renews the token once on 401. */
  async api(path, { method = "GET", body } = {}) {
    if (!this.configured) throw new EasyWdmsError("The face scanner software isn't connected yet", { kind: "config" })
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.token) await this.fetchToken()
      let response
      try {
        response = await this.fetch(`${this.baseUrl}${path}`, {
          method,
          redirect: "manual",
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { Authorization: `Token ${this.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
          body: body ? JSON.stringify(body) : undefined,
        })
      } catch (error) {
        throw new EasyWdmsError(`Couldn't reach the face scanner software (${error?.name === "TimeoutError" ? "timed out" : error?.message || "network error"})`, { kind: "network" })
      }
      if (response.status === 401) {
        this.token = ""
        continue
      }
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        const detail = result && typeof result === "object"
          ? Object.entries(result).map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(" ") : value}`).join("; ")
          : ""
        throw new EasyWdmsError(`Face scanner software: ${detail || `HTTP ${response.status}`}`)
      }
      return result
    }
    throw new EasyWdmsError("Couldn't stay logged in to the face scanner software", { kind: "login" })
  }

  /** Every page of a REST list → rows. */
  async apiAll(path, { pageSize = 500 } = {}) {
    const rows = []
    for (let page = 1; page < 1000; page++) {
      const separator = path.includes("?") ? "&" : "?"
      const result = await this.api(`${path}${separator}page=${page}&page_size=${pageSize}`)
      const data = result?.data || result?.results || []
      rows.push(...data)
      if (!result?.next || !data.length) break
    }
    return rows
  }

  /** All employees: [{ id, code, name, areaIds }]. */
  async listEmployees() {
    const rows = await this.apiAll("/personnel/api/employees/")
    return rows.map((row) => ({
      id: row.id,
      code: String(row.emp_code || "").trim(),
      name: String(row.first_name || "").trim(),
      areaIds: (row.area || []).map((area) => area.id),
    }))
  }

  /** One employee by exact emp_code, or null. */
  async findEmployee(code) {
    const result = await this.api(`/personnel/api/employees/?emp_code=${encodeURIComponent(code)}`)
    const row = (result?.data || []).find((item) => String(item.emp_code) === String(code))
    return row ? { id: row.id, code: String(row.emp_code), name: String(row.first_name || "") } : null
  }

  /**
   * Where new users go: the areas the machines are in, plus the first
   * department and position (EasyWDMS requires both). Cached per process.
   */
  async getSetup() {
    if (this.setup) return this.setup
    const [terminals, departments, positions] = await Promise.all([
      this.apiAll("/iclock/api/terminals/"),
      this.api("/personnel/api/departments/?page_size=1"),
      this.api("/personnel/api/positions/?page_size=1"),
    ])
    const areaIds = [...new Set(terminals.map((terminal) => terminal.area?.id).filter(Boolean))]
    const departmentId = departments?.data?.[0]?.id
    const positionId = positions?.data?.[0]?.id
    if (!areaIds.length || !departmentId || !positionId) {
      throw new EasyWdmsError("The face scanner software has no machine area, department or position set up", { kind: "config" })
    }
    this.setup = {
      areaIds,
      departmentId,
      positionId,
      terminals: terminals.map((terminal) => ({ sn: terminal.sn, alias: terminal.alias || terminal.sn })),
    }
    return this.setup
  }

  /** Add a student to the scanners (all machine areas). Returns the employee. */
  async createEmployee({ rollNumber, name }) {
    if (!isScannerRollNumber(rollNumber)) {
      throw new EasyWdmsError("This roll number can't be used as a scanner employee ID", { kind: "input" })
    }
    const setup = await this.getSetup()
    const created = await this.api("/personnel/api/employees/", {
      method: "POST",
      body: {
        emp_code: rollNumber,
        first_name: String(name || rollNumber).trim().slice(0, 100),
        department: setup.departmentId,
        position: setup.positionId,
        area: setup.areaIds,
      },
    })
    return { id: created?.id, code: String(created?.emp_code || rollNumber), name: String(created?.first_name || name || "") }
  }

  // ------------------------------------------------------------- portal grids

  async gridPage(path, page, limit = GRID_PAGE_SIZE) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!this.loggedIn) await this.login()
      const response = await this.request(`${path}?page=${page}&limit=${limit}`, { headers: GRID_HEADERS })
      if (isLoginRedirect(response) || response.status === 403) {
        this.loggedIn = false
        continue
      }
      const result = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(result?.data)) {
        throw new EasyWdmsError(`The face scanner software returned an unexpected list (HTTP ${response.status})`)
      }
      return result
    }
    throw new EasyWdmsError("Couldn't stay logged in to the face scanner software", { kind: "login" })
  }

  /** Every bio photo: [{ code, path, approval, registeredAt }]. */
  async listBioPhotos() {
    if (!this.configured) throw new EasyWdmsError("The face scanner software isn't connected yet", { kind: "config" })
    return this.serial(async () => {
      const rows = []
      for (let page = 1; page < 1000; page++) {
        const result = await this.gridPage("/iclock/biophoto/table/", page)
        rows.push(...result.data)
        if (result.data.length < GRID_PAGE_SIZE || rows.length >= Number(result.count || 0)) break
      }
      return rows.map(toBioPhotoRow)
    })
  }

  /** The newest bio photos (first grid page), to refresh one user right after a push. */
  async recentBioPhotos(limit = 100) {
    if (!this.configured) throw new EasyWdmsError("The face scanner software isn't connected yet", { kind: "config" })
    return this.serial(async () => (await this.gridPage("/iclock/biophoto/table/", 1, limit)).data.map(toBioPhotoRow))
  }

  /**
   * Bio-photo commands sent to the machines, newest first, down to (not
   * including) command id `afterId`: [{ id, code, sn, alias, ok, message, at }].
   * ok: true accepted, false error, null not answered yet.
   */
  async listBioPhotoCommands({ afterId = 0, maxRows = 200_000, pageSize = GRID_PAGE_SIZE } = {}) {
    if (!this.configured) throw new EasyWdmsError("The face scanner software isn't connected yet", { kind: "config" })
    return this.serial(async () => {
      const rows = []
      let seen = 0
      for (let page = 1; page < 1000 && seen < maxRows; page++) {
        const result = await this.gridPage("/iclock/terminalcommand/table/", page, pageSize)
        let reachedOld = false
        for (const row of result.data) {
          const id = Number(row.id)
          if (id <= afterId) {
            reachedOld = true
            break
          }
          const command = toBioPhotoCommand(row)
          if (command) rows.push(command)
        }
        seen += result.data.length
        if (reachedOld || result.data.length < pageSize) break
      }
      return rows
    })
  }

  /** The id of the newest command (0 when none), to find the commands a push creates. */
  async latestCommandId() {
    if (!this.configured) return 0
    return this.serial(async () => Number((await this.gridPage("/iclock/terminalcommand/table/", 1, 1)).data[0]?.id || 0))
  }

  /** The bio photo file for display (proxied by HMS). Returns { buffer, contentType } or null. */
  async fetchBioPhotoFile(path) {
    const clean = String(path || "").replace(/^\/+/, "")
    if (!/^biophoto\/[A-Za-z0-9]+\/[A-Za-z0-9_-]+\.(jpg|jpeg|png)$/i.test(clean)) return null
    const response = await this.request(`/iclock/file/${clean}`)
    if (!response.ok) return null
    return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || "image/jpeg" }
  }
}

const toBioPhotoRow = (row) => ({
  code: String(row.get_emp_code || "").trim(),
  path: String(row.bio_photo || "").trim(),
  approval: String(row.approval_state || "").trim(),
  registeredAt: String(row.register_time || "").trim(),
})

const BIOPHOTO_COMMAND = /^DATA UPDATE BIOPHOTO PIN=([^\s]+)/

const toBioPhotoCommand = (row) => {
  const match = String(row.get_content_display || "").match(BIOPHOTO_COMMAND)
  if (!match) return null
  const answer = String(row.get_return_value || "").trim()
  const answered = Boolean(String(row.return_time || "").trim()) || Boolean(answer)
  return {
    id: Number(row.id),
    code: match[1],
    sn: String(row.terminal_sn || ""),
    alias: String(row.terminal_alias || row.terminal_sn || ""),
    ok: answered ? /^successful$/i.test(answer) || answer === "0" : null,
    message: answer,
    at: String(row.commit_time || ""),
  }
}

let shared = null

/** The process-wide client built from env. Tests may swap it with setEasyWdmsClient. */
export const getEasyWdmsClient = () => {
  if (!shared) shared = new EasyWdmsClient(env.easywdms)
  return shared
}

export const setEasyWdmsClient = (client) => {
  shared = client
}
