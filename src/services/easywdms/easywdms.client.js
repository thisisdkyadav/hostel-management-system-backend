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
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(String(rollNumber || ""))) {
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
