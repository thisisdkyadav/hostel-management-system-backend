#!/usr/bin/env node
/**
 * Replay captured face-machine traffic (pcap of the EasyWDMS port) against the
 * HMS iclock receiver and compare answers.
 *
 *   node scripts/iclock-replay.mjs <capture.pcap> [--target http://127.0.0.1:5300]
 *        [--only cdata,devicecmd] [--skip-polls] [--dump] [--limit N]
 *
 * Only requests from machines (User-Agent "iClock Proxy") are replayed. NEVER
 * point --target at EasyWDMS: replayed punches would be recorded twice.
 */
import fs from "node:fs"

const args = process.argv.slice(2)
const file = args.find((a) => !a.startsWith("--"))
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const flag = (name) => args.includes(`--${name}`)
const target = opt("target", "http://127.0.0.1:5300").replace(/\/+$/, "")
const only = opt("only", "")?.split(",").filter(Boolean)
const limit = Number(opt("limit", "0")) || Infinity

if (!file) {
  console.error("usage: iclock-replay.mjs <capture.pcap> [--target URL] [--only routes] [--skip-polls] [--dump]")
  process.exit(2)
}
if (/:(8090|8080)\b/.test(target)) {
  console.error("Refusing to replay into what looks like EasyWDMS.")
  process.exit(2)
}

// ---- pcap → TCP streams ----------------------------------------------------
const buf = fs.readFileSync(file)
const streams = new Map() // key -> { first, segs: Map(seq -> payload) }
for (let i = 24; i + 16 <= buf.length; ) {
  const ts = buf.readUInt32LE(i) + buf.readUInt32LE(i + 4) / 1e6
  const len = buf.readUInt32LE(i + 8)
  const p = buf.subarray(i + 16, i + 16 + len)
  i += 16 + len
  if (p.length < 34 || p.readUInt16BE(12) !== 0x0800 || p[23] !== 6) continue
  const ihl = (p[14] & 15) * 4
  const total = p.readUInt16BE(16)
  const t = 14 + ihl
  const src = `${p[26]}.${p[27]}.${p[28]}.${p[29]}:${p.readUInt16BE(t)}`
  const dst = `${p[30]}.${p[31]}.${p[32]}.${p[33]}:${p.readUInt16BE(t + 2)}`
  const seq = p.readUInt32BE(t + 4)
  const payload = p.subarray(t + (p[t + 12] >> 4) * 4, 14 + total)
  if (!payload.length) continue
  const key = `${src}>${dst}`
  if (!streams.has(key)) streams.set(key, { first: ts, segs: new Map() })
  streams.get(key).segs.set(seq, Buffer.from(payload))
}
const streamBytes = (s) => Buffer.concat([...s.segs.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]))

// ---- HTTP messages ---------------------------------------------------------
const parseMessages = (data) => {
  const out = []
  let pos = 0
  while (pos < data.length) {
    const end = data.indexOf("\r\n\r\n", pos)
    if (end < 0) break
    const head = data.subarray(pos, end).toString("latin1").split("\r\n")
    const headers = {}
    for (const line of head.slice(1)) {
      const c = line.indexOf(":")
      if (c > 0) headers[line.slice(0, c).trim().toLowerCase()] = line.slice(c + 1).trim()
    }
    const bodyLen = Number(headers["content-length"] || 0)
    const body = data.subarray(end + 4, end + 4 + bodyLen)
    out.push({ start: head[0], headers, body })
    pos = end + 4 + bodyLen
  }
  return out
}

const exchanges = []
for (const [key, s] of streams) {
  const [src, dst] = key.split(">")
  if (!dst.endsWith(":8080")) continue
  const reqs = parseMessages(streamBytes(s))
  const back = streams.get(`${dst}>${src}`)
  const resps = back ? parseMessages(streamBytes(back)) : []
  reqs.forEach((req, i) => {
    if (!/iClock/i.test(req.headers["user-agent"] || "")) return
    exchanges.push({ at: s.first, req, resp: resps[i] })
  })
}
exchanges.sort((a, b) => a.at - b.at)

// ---- replay ----------------------------------------------------------------
const summary = {}
let sent = 0
for (const { at, req, resp } of exchanges) {
  if (sent >= limit) break
  const [method, rawPath] = req.start.split(" ")
  const url = new URL(rawPath, "http://x")
  const route = url.pathname.replace(/^\/iclock\//, "").split("/")[0]
  if (only.length && !only.includes(route)) continue
  if (flag("skip-polls") && (route === "getrequest" || route === "ping") && !url.searchParams.get("INFO")) continue

  const started = Date.now()
  const r = await fetch(`${target}${rawPath}`, {
    method,
    headers: {
      "user-agent": req.headers["user-agent"] || "",
      "x-forwarded-for": req.headers["x-forwarded-for"] || "",
      "content-type": req.headers["content-type"] || "text/plain",
    },
    body: method === "GET" || method === "HEAD" ? undefined : req.body,
  })
  const ours = await r.text()
  const ms = Date.now() - started
  sent++

  const theirs = resp?.body?.toString("utf8") ?? "(no response captured)"
  const same = theirs === ours
  const key = `${method} ${route}${url.searchParams.get("table") ? `?table=${url.searchParams.get("table")}` : ""}`
  summary[key] ||= { n: 0, same: 0, maxMs: 0 }
  summary[key].n++
  if (same) summary[key].same++
  summary[key].maxMs = Math.max(summary[key].maxMs, ms)

  if (flag("dump") || !same) {
    console.log(`\n── ${new Date(at * 1000).toISOString()} ${method} ${rawPath} (${req.body.length} B) → ${r.status} in ${ms} ms`)
    if (flag("dump") && req.body.length) console.log(`   body: ${req.body.toString("utf8").slice(0, 400).replace(/\n/g, "\n         ")}`)
    console.log(`   EasyWDMS: ${JSON.stringify(theirs.slice(0, 300))}`)
    console.log(`   HMS     : ${JSON.stringify(ours.slice(0, 300))}`)
  }
}

console.log(`\nReplayed ${sent} machine request(s) to ${target}`)
console.table(summary)
