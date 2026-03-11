'use strict'
/**
 * auth-utils.js — Centralised password hashing with pepper.
 *
 * WHY A PEPPER?
 * bcrypt hashes are stored in the database. If an attacker steals the DB
 * dump, they can run an offline dictionary attack against every hash.
 * A pepper is a secret string stored ONLY on the server (in the env, never
 * in the DB). The password is HMAC-SHA256'd with the pepper before bcrypt,
 * so the resulting hashes are useless without the server secret — even if
 * the entire database is leaked.
 *
 * SETUP:
 * Add PASSWORD_PEPPER to your .env.<environment> file:
 *   PASSWORD_PEPPER=<64 hex chars>  (generate with: openssl rand -hex 32)
 *
 * The install script will generate this automatically for new installs.
 * Existing installs: add the variable, then all passwords will be re-peppered
 * on next login (the migrate-pepper script handles bulk re-hashing if needed).
 *
 * ROTATION:
 * If you need to rotate the pepper, add PASSWORD_PEPPER_OLD=<old value>.
 * hashPassword() will use the new pepper. comparePassword() will try the new
 * pepper first, then fall back to the old one and transparently re-hash on
 * success so the DB migrates forward automatically.
 */

const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const BCRYPT_ROUNDS = 12

function getPepper() {
  return process.env.PASSWORD_PEPPER || ''
}

function getOldPepper() {
  return process.env.PASSWORD_PEPPER_OLD || null
}

/**
 * Apply pepper to a password via HMAC-SHA256.
 * Returns a hex string safe to pass to bcrypt.
 */
function applyPepper(password, pepper) {
  if (!pepper) return password
  return crypto.createHmac('sha256', pepper).update(password).digest('hex')
}

/**
 * Hash a password with pepper + bcrypt.
 * @param {string} password  Plain text password
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(password) {
  const peppered = applyPepper(password, getPepper())
  return bcrypt.hash(peppered, BCRYPT_ROUNDS)
}

/**
 * Compare a plain text password against a stored bcrypt hash.
 * Tries current pepper first, then old pepper (for transparent rotation).
 *
 * @param {string} password    Plain text password
 * @param {string} storedHash  bcrypt hash from DB
 * @returns {Promise<{ ok: boolean, needsRehash: boolean }>}
 *   ok          — whether the password matched
 *   needsRehash — true if the old pepper was used (caller should re-hash and save)
 */
async function comparePassword(password, storedHash) {
  // Try current pepper
  const peppered = applyPepper(password, getPepper())
  if (await bcrypt.compare(peppered, storedHash)) {
    return { ok: true, needsRehash: false }
  }

  // Try old pepper (rotation fallback)
  const oldPepper = getOldPepper()
  if (oldPepper) {
    const oldPeppered = applyPepper(password, oldPepper)
    if (await bcrypt.compare(oldPeppered, storedHash)) {
      return { ok: true, needsRehash: true }  // Caller re-hashes with new pepper
    }
  }

  return { ok: false, needsRehash: false }
}

// ── Password policy ───────────────────────────────────────────────────────────

const DEFAULT_POLICY = {
  minLength:       12,
  requireUpper:    true,   // at least one A-Z
  requireLower:    true,   // at least one a-z
  requireNumber:   true,   // at least one 0-9
  requireSpecial:  true,   // at least one special character
  noSequential:    true,   // no 3+ identical or incrementing chars in a row (aaa, 123, abc)
}

/**
 * Read the active password policy from runtime overrides, falling back to defaults.
 * @param {object} overrides  — the parsed .runtime-overrides.json object
 * @returns {object} merged policy
 */
function getPasswordPolicy(overrides = {}) {
  const stored = overrides.PASSWORD_POLICY || {}
  return { ...DEFAULT_POLICY, ...stored }
}

/**
 * Validate a password against a policy.
 * @param {string} password
 * @param {object} policy  — from getPasswordPolicy()
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validatePassword(password, policy) {
  const errors = []
  if (!password) { return { ok: false, errors: ['Password is required.'] } }

  if (policy.minLength && password.length < policy.minLength)
    errors.push(`At least ${policy.minLength} characters.`)

  if (policy.requireUpper && !/[A-Z]/.test(password))
    errors.push('At least one uppercase letter (A–Z).')

  if (policy.requireLower && !/[a-z]/.test(password))
    errors.push('At least one lowercase letter (a–z).')

  if (policy.requireNumber && !/[0-9]/.test(password))
    errors.push('At least one number (0–9).')

  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password))
    errors.push('At least one special character (e.g. !@#$%^&*).')

  if (policy.noSequential) {
    // 3+ identical chars: aaa, 111
    if (/(.)\1{2,}/.test(password))
      errors.push('No more than 2 identical characters in a row (e.g. aaa, 111).')

    // 3+ incrementing chars by char code: abc, bcd, 123, 234
    let seqRun = 1
    for (let i = 1; i < password.length; i++) {
      const diff = password.charCodeAt(i) - password.charCodeAt(i - 1)
      if (diff === 1) { seqRun++; if (seqRun >= 3) break }
      else seqRun = 1
    }
    if (seqRun >= 3)
      errors.push('No sequential characters in a row (e.g. abc, 123).')
  }

  return { ok: errors.length === 0, errors }
}

module.exports = { hashPassword, comparePassword, getPasswordPolicy, validatePassword, DEFAULT_POLICY }
