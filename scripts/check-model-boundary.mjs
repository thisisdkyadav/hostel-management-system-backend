#!/usr/bin/env node
/**
 * Model-boundary guardrail
 * ========================
 * Fails (exit 1) if any file touches a Mongoose model outside the places that are
 * allowed to own model access. This makes the domain-ownership invariant
 * self-enforcing: after the whole model layer was routed through per-domain
 * owner/queries services, nothing should ever reach for a model directly again.
 *
 * The rule is FINER than "no model access outside src/services" — that coarse
 * version could never catch a business-logic file that leaks *inside* src/services
 * (which is exactly how dining-rebate.service.js slipped past the manual audit).
 *
 * Model access is allowed ONLY in:
 *   - src/models/**                        (the model definitions themselves)
 *   - *Owner.service.js / *Queries.service.js   (the domain read/write surfaces)
 *   - a short explicit allowlist of legacy-named single-file owners
 *
 * Detection is two-layer:
 *   A. import-gate — a non-allowed file importing a MODEL NAME from a models/ path.
 *      (Precise: the authoritative name set comes from mongoose.modelNames(), so
 *      CONSTANT exports from model files — PAYMENT_STATUS, ACCOMMODATION_STATUS,
 *      etc. — are never mistaken for model access.)
 *   B. member-access — `Model.method(` or `new Model(` for a known model name,
 *      after stripping comments. Belt-and-suspenders for re-export chains.
 *
 * Usage:  node scripts/check-model-boundary.mjs   (from backend/)
 *         npm run check:boundary
 */

import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import { fileURLToPath } from "node:url"
import mongoose from "mongoose"

const BACKEND_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const SRC_ROOT = join(BACKEND_ROOT, "src")

// Register every model so mongoose.modelNames() is authoritative.
await import(new URL("../src/models/index.js", import.meta.url))
const MODEL_NAMES = new Set(mongoose.modelNames())

// ---- allowlist: the only places allowed to touch a model ------------------
const ALLOW_BASENAME_RE = /(Owner|Queries)\.service\.js$/
const ALLOW_EXPLICIT = new Set([
  // Legacy single-file domain owners that predate the Owner/Queries naming.
  // Each is the canonical (and only) service for its model(s).
  "src/services/action-links/action-link-token.service.js", // ActionLinkToken owner
  "src/services/audit/audit.service.js", // AuditLog owner
])

const isAllowed = (relPath) => {
  const norm = relPath.split(sep).join("/")
  if (norm.startsWith("src/models/")) return true
  if (ALLOW_BASENAME_RE.test(norm)) return true
  if (ALLOW_EXPLICIT.has(norm)) return true
  return false
}

// ---- file walk ------------------------------------------------------------
const collectJsFiles = (dir, acc = []) => {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) collectJsFiles(full, acc)
    else if (entry.endsWith(".js")) acc.push(full)
  }
  return acc
}

// ---- detectors ------------------------------------------------------------
const lineOf = (content, index) => content.slice(0, index).split("\n").length

// Blank out comments AND string/template literals (preserving newlines so line
// numbers stay accurate). Single left-to-right alternation so a `//` inside a
// string is consumed as part of the string, not treated as a comment. This is
// what stops model paths in import strings (".../Room.model.js") from being
// mistaken for member access (`Room.model`).
const NON_CODE_RE = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g
const stripNonCode = (src) => src.replace(NON_CODE_RE, (m) => m.replace(/[^\n]/g, " "))

const MODELS_PATH_RE = /(^|\/)models\//
const IMPORT_RE =
  /import\s+(?:([A-Za-z0-9_$]+)\s*,\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g
const NS_IMPORT_RE = /import\s+\*\s+as\s+([A-Za-z0-9_$]+)\s+from\s*['"]([^'"]+)['"]/g

const importGateViolations = (content) => {
  const hits = []
  for (const m of content.matchAll(IMPORT_RE)) {
    const [, def, named, src] = m
    if (!MODELS_PATH_RE.test(src)) continue
    const bindings = []
    if (def) bindings.push(def)
    if (named) {
      for (const part of named.split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0].trim()
        if (name) bindings.push(name)
      }
    }
    for (const name of bindings) {
      if (MODEL_NAMES.has(name)) {
        hits.push({ kind: "import", name, line: lineOf(content, m.index) })
      }
    }
  }
  for (const m of content.matchAll(NS_IMPORT_RE)) {
    if (MODELS_PATH_RE.test(m[2])) {
      hits.push({ kind: "import*", name: m[2], line: lineOf(content, m.index) })
    }
  }
  return hits
}

const memberAccessViolations = (content) => {
  const code = stripNonCode(content)
  const hits = []
  for (const name of MODEL_NAMES) {
    const re = new RegExp(`\\b${name}\\.[A-Za-z_$]|\\bnew\\s+${name}\\s*\\(`, "g")
    for (const m of code.matchAll(re)) {
      hits.push({ kind: "access", name, line: lineOf(code, m.index) })
    }
  }
  return hits
}

// ---- run ------------------------------------------------------------------
const files = collectJsFiles(SRC_ROOT)
const violations = []

for (const file of files) {
  const relPath = relative(BACKEND_ROOT, file)
  if (isAllowed(relPath)) continue
  const content = readFileSync(file, "utf8")

  const found = [...importGateViolations(content), ...memberAccessViolations(content)]
  if (found.length === 0) continue

  // De-dupe (name+line) and keep stable ordering by line.
  const seen = new Set()
  const unique = found
    .filter((h) => {
      const k = `${h.name}:${h.line}:${h.kind}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .sort((a, b) => a.line - b.line)

  violations.push({ relPath: relPath.split(sep).join("/"), hits: unique })
}

if (violations.length === 0) {
  console.log(
    `✅ model-boundary clean — ${MODEL_NAMES.size} models, ${files.length} files scanned.\n` +
      `   Every model access lives in a *Owner/*Queries service (or an allowlisted owner).`,
  )
  process.exit(0)
}

console.error(`❌ model-boundary VIOLATIONS in ${violations.length} file(s):\n`)
for (const v of violations) {
  console.error(`  ${v.relPath}`)
  for (const h of v.hits) {
    const label = h.kind === "access" ? "direct access" : h.kind === "import*" ? "namespace import" : "import"
    console.error(`    L${h.line}  ${h.name}  (${label})`)
  }
  console.error("")
}
console.error(
  "Model access is only allowed in *Owner.service.js / *Queries.service.js (or an\n" +
    "allowlisted owner). Route this through the domain's owner/queries service, or —\n" +
    "if this file IS a new domain owner — add it to ALLOW_EXPLICIT in this script.",
)
process.exit(1)
