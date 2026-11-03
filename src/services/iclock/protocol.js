/**
 * ZKTeco PUSH ("iclock") protocol — pure parsing/formatting, no I/O.
 *
 * Machine → server (all plain HTTP, text bodies, tab/newline separated):
 *   GET  /iclock/cdata?SN=…&options=all&pushver=…      handshake → option lines
 *   POST /iclock/cdata?SN=…&table=ATTLOG&Stamp=…        punches → "OK: <n>"
 *   POST /iclock/cdata?SN=…&table=OPERLOG|BIODATA|…     user/face changes → "OK: <n>"
 *   GET  /iclock/getrequest?SN=…[&INFO=…]               poll → "C:<id>:<cmd>" lines or "OK"
 *   POST /iclock/devicecmd?SN=…                         "ID=<id>&Return=<code>&CMD=<verb>" lines
 *   GET  /iclock/ping?SN=…                              keep-alive → "OK"
 */

const pad2 = (value) => String(value).padStart(2, "0")

/** Split a text body into non-empty lines (machines use \n or \r\n). */
export const bodyLines = (text) =>
  String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\0+$/, ""))
    .filter((line) => line.trim() !== "")

/**
 * "YYYY-MM-DD HH:mm:ss" (machine-local) → { localTime, date, time, dateTime }.
 * Interpreted in the server's local time zone, matching the existing scan path.
 */
export const parseMachineTime = (raw) => {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/.exec(String(raw ?? "").trim())
  if (!match) return null
  const [, y, mo, d, h, mi, s = "0"] = match
  const date = `${y}-${pad2(mo)}-${pad2(d)}`
  const time = `${pad2(h)}:${pad2(mi)}:${pad2(s)}`
  const dateTime = new Date(`${date}T${time}`)
  if (Number.isNaN(dateTime.getTime())) return null
  return { localTime: `${date} ${time}`, date, time, dateTime }
}

/**
 * ATTLOG body → punches. Each line:
 *   PIN \t YYYY-MM-DD HH:mm:ss \t status \t verify \t workcode \t reserved…
 * Lines that don't parse are returned in `rejected` (never thrown).
 */
export const parseAttlog = (text) => {
  const punches = []
  const rejected = []
  for (const line of bodyLines(text)) {
    const fields = line.split("\t")
    const pin = String(fields[0] ?? "").trim()
    const when = parseMachineTime(fields[1])
    if (!pin || !when) {
      rejected.push(line)
      continue
    }
    punches.push({
      pin,
      ...when,
      status: String(fields[2] ?? "").trim(),
      verify: String(fields[3] ?? "").trim(),
      workCode: String(fields[4] ?? "").trim(),
      raw: line,
    })
  }
  return { punches, rejected }
}

/**
 * "KEY=value\tKEY2=value2" (OPERLOG USER/BIOPHOTO/BIODATA rows) → object.
 * A leading record type ("USER PIN=1\tName=…") is returned as `_type`.
 */
export const parseKeyValueRecord = (line) => {
  const record = {}
  let rest = String(line ?? "")
  const typeMatch = /^([A-Z][A-Z_]*)\s+(?=[A-Za-z_]+=)/.exec(rest)
  if (typeMatch) {
    record._type = typeMatch[1]
    rest = rest.slice(typeMatch[0].length)
  }
  for (const part of rest.split("\t")) {
    const eq = part.indexOf("=")
    if (eq <= 0) continue
    record[part.slice(0, eq).trim()] = part.slice(eq + 1)
  }
  return record
}

/** OPERLOG / BIODATA / USERINFO style body → records (OPLOG lines kept as raw). */
export const parseRecords = (text) =>
  bodyLines(text).map((line) => {
    if (/^OPLOG\s/.test(line)) return { _type: "OPLOG", raw: line }
    return parseKeyValueRecord(line)
  })

/**
 * devicecmd body → command results. Each line is a query string:
 *   ID=12&Return=0&CMD=DATA
 * Some firmwares put several on one line separated by \n only, some add extra keys.
 */
export const parseDeviceCmdResults = (text) =>
  bodyLines(text)
    .map((line) => {
      const params = new URLSearchParams(line.trim())
      const id = Number.parseInt(params.get("ID") ?? "", 10)
      if (!Number.isFinite(id)) return null
      const returnCode = Number.parseInt(params.get("Return") ?? "", 10)
      const extra = {}
      for (const [key, value] of params) if (!["ID", "Return", "CMD"].includes(key)) extra[key] = value
      return {
        id,
        returnCode: Number.isFinite(returnCode) ? returnCode : null,
        cmd: params.get("CMD") ?? "",
        extra,
      }
    })
    .filter(Boolean)

/**
 * INFO= on getrequest (comma list, positional):
 *   firmware, users, fingerprints, punches, ip, fpAlgo, faceAlgo, faceTemplateCount, faces, …
 * Only the positions we're fairly sure of are named; the raw string is kept too.
 */
export const parseInfoParam = (raw) => {
  if (!raw) return null
  const parts = String(raw).split(",")
  const num = (value) => {
    const n = Number.parseInt(value, 10)
    return Number.isFinite(n) ? n : null
  }
  return {
    raw: String(raw),
    firmware: parts[0] ?? "",
    users: num(parts[1]),
    fingerprints: num(parts[2]),
    punches: num(parts[3]),
    ip: parts[4] ?? "",
  }
}

/** "~DeviceName=X,FWVersion=Y" / "Key=Value" lines from an options/INFO upload → object. */
export const parseOptions = (text) => {
  const options = {}
  for (const line of bodyLines(text)) {
    for (const part of line.split(/[,\t]/)) {
      const eq = part.indexOf("=")
      if (eq <= 0) continue
      options[part.slice(0, eq).replace(/^~/, "").trim()] = part.slice(eq + 1).trim()
    }
  }
  return options
}

/**
 * Handshake answer — byte-for-byte what EasyWDMS answers these machines (captured
 * 2026-11-03 from SpeedFace-V5L, request pushver=2.4.1&PushOptionsFlag=1).
 * Stamp=9999 means "don't re-upload stored punches" — the machine keeps sending only
 * new ones. TimeZone is in MINUTES (330 = IST).
 */
export const handshakeResponse = ({ sn, timeZoneMinutes = 330, delaySeconds = 10 }) =>
  [
    `GET OPTION FROM: ${sn}`,
    "Stamp=9999",
    "OpStamp=9999",
    "PhotoStamp=0",
    "ErrorDelay=60",
    `Delay=${delaySeconds}`,
    "ServerVer=2.4.1",
    "PushProtVer=2.4.1",
    "EncryptFlag=1000000000",
    "PushOptionsFlag=1",
    "SupportPing=1",
    "MultiBioDataSupport=0:1:1:0:0:0:0:0:1:1:1",
    "MultiBioPhotoSupport=0:0:0:0:0:0:0:0:0:1:1",
    "PushOptions=UserCount,TransactionCount,FingerFunOn,FPVersion,FPCount,FaceFunOn,FaceVersion,FaceCount,FvFunOn,FvVersion,FvCount,PvFunOn,PvVersion,PvCount,BioPhotoFun,BioDataFun,PhotoFunOn,~LockFunOn,CardProtFormat,~Platform,MultiBioPhotoSupport,MultiBioDataSupport,MultiBioVersion,MultiBioDataCount",
    "TransTimes=00:00;14:05",
    "TransInterval=1",
    "TransFlag=TransData AttLog\tOpLog\tAttPhoto\tEnrollFP\tEnrollUser\tFPImag\tChgUser\tChgFP\tFACE\tUserPic\tFVEIN\tBioPhoto",
    `TimeZone=${timeZoneMinutes}`,
    "Realtime=1",
    "Encrypt=0",
    "PushOptionsFlag=1",
  ].join("\n") + "\n"

/** getrequest answer for queued commands. */
// Same framing as EasyWDMS (captured from SpeedFace-V5L, push 3.1.6S): "\n" lines, trailing "\n".
export const formatCommands = (commands) =>
  commands.length ? commands.map((c) => `C:${c.commandId}:${c.command}`).join("\n") + "\n" : "OK"

/** Punch state → IN/OUT (same rules as the EasyWDMS JSON path). */
export const mapPunchState = (state) => {
  const value = String(state ?? "").trim().toLowerCase()
  if (["0", "in", "i"].includes(value)) return "IN"
  if (["1", "out", "o"].includes(value)) return "OUT"
  return undefined
}

/** Verify type → punch mode label (same rules as the EasyWDMS JSON path). */
const VERIFY_TYPE_LABELS = { 0: "Password", 1: "Fingerprint", 3: "Password", 4: "Card", 15: "Face" }
export const mapVerifyType = (verify) => VERIFY_TYPE_LABELS[String(verify ?? "").trim()] || "Face"

// ---- Commands HMS can queue (user + face management) -----------------------

const clean = (value) => String(value ?? "").replace(/[\t\r\n]/g, " ").trim()

// Formats copied byte-for-byte from what EasyWDMS sends these machines (capture 2026-11-03):
//   DATA USER PIN=…\tName=…\tPri=0\tPasswd=\tCard=\t\tGrp=1\tVerify=-1\tExpires=0
//   DATA UPDATE BIOPHOTO PIN=…\tType=9\tFormat=1\tUrl=iclock/file/biophoto/<folder>/<pin>.jpg
// The photo Url is RELATIVE: the machine fetches it from the same server it polls.

/** Add/update a person on the machine. */
export const userInfoCommand = ({ pin, name, privilege = 0 }) =>
  `DATA USER PIN=${clean(pin)}\tName=${clean(name)}\tPri=${privilege}\tPasswd=\tCard=\t\tGrp=1\tVerify=-1\tExpires=0`

/** Push a face photo; the machine downloads `url` (relative) and builds its own template. */
export const bioPhotoCommand = ({ pin, url }) =>
  `DATA UPDATE BIOPHOTO PIN=${clean(pin)}\tType=9\tFormat=1\tUrl=${clean(url)}`

/** Remove a person (and their face data) from the machine. */
export const deleteUserCommand = ({ pin }) => `DATA DELETE USERINFO PIN=${clean(pin)}`
