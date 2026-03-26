'use strict'
/**
 * Passkeys / WebAuthn routes
 * Requires @simplewebauthn/server@^8
 *
 * Registration:  GET  /api/auth/passkey/register/challenge
 *                POST /api/auth/passkey/register/verify
 * Management:    GET  /api/auth/passkey/list
 *                DELETE /api/auth/passkey/:id
 * Login:         POST /api/auth/passkey/login/challenge
 *                POST /api/auth/passkey/login/verify
 */

const router   = require('express').Router()
const { v4: uuidv4 } = require('uuid')
const jwt      = require('jsonwebtoken')
const { requireAuth } = require('../middleware/auth')
const db       = require('../db/connection')

// Lazy-load @simplewebauthn/server so the app still boots if not yet installed,
// returning a clear error instead of a crash.
let webauthn
try {
  webauthn = require('@simplewebauthn/server')
} catch {
  webauthn = null
}

function assertWebAuthn(res) {
  if (!webauthn) {
    res.status(503).json({ error: 'Passkeys unavailable — run npm install on the server.' })
    return false
  }
  return true
}

// ── In-memory challenge store ────────────────────────────────────────────────
// Acceptable for single-server deployments. Keyed by 'reg:<userId>' or 'auth:<sessionKey>'.
const challenges = new Map()
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of challenges.entries()) {
    if (v.expiresAt < now) challenges.delete(k)
  }
}, 5 * 60 * 1000)

// ── Helpers ──────────────────────────────────────────────────────────────────
function getOrigin(req) {
  // req.protocol respects Express's trust proxy setting (TRUST_PROXY=true reads x-forwarded-proto).
  // Fall back to COOKIE_SECURE so staging environments with a reverse proxy but no TRUST_PROXY set
  // still resolve the correct origin.
  const proto = req.protocol === 'https' || process.env.COOKIE_SECURE === 'true' ? 'https' : 'http'
  return `${proto}://${req.get('host')}`
}

function getRpId(req) {
  return req.get('host').split(':')[0]
}

function cookieOpts() {
  const hours  = parseInt(process.env.COOKIE_MAX_AGE_HOURS || '72')
  const secure = process.env.COOKIE_SECURE === 'true'
  return {
    httpOnly: true, secure,
    sameSite: secure ? 'strict' : 'lax',
    maxAge: hours * 60 * 60 * 1000,
    path: '/',
  }
}

// ── GET /register/challenge ───────────────────────────────────────────────────
router.get('/register/challenge', requireAuth, async (req, res) => {
  if (!assertWebAuthn(res)) return
  try {
    const { rows: [user] } = await db.query(
      'SELECT id, name, email FROM users WHERE id = $1', [req.user.id]
    )
    if (!user) return res.status(404).json({ error: 'User not found' })

    const { rows: existing } = await db.query(
      'SELECT credential_id FROM passkeys WHERE user_id = $1', [user.id]
    )

    const opts = await webauthn.generateRegistrationOptions({
      rpName:          process.env.APP_NAME || 'ForgeTrack',
      rpID:            getRpId(req),
      userID:          user.id,
      userName:        user.email,
      userDisplayName: user.name,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({ id: c.credential_id, type: 'public-key' })),
      authenticatorSelection: {
        residentKey:       'preferred',
        userVerification:  'preferred',
      },
    })

    challenges.set(`reg:${user.id}`, { challenge: opts.challenge, expiresAt: Date.now() + 5 * 60 * 1000 })
    res.json(opts)
  } catch (err) {
    console.error('passkey register challenge:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /register/verify ─────────────────────────────────────────────────────
router.post('/register/verify', requireAuth, async (req, res) => {
  if (!assertWebAuthn(res)) return
  try {
    const stored = challenges.get(`reg:${req.user.id}`)
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Challenge expired — please try again.' })
    }
    challenges.delete(`reg:${req.user.id}`)

    const verification = await webauthn.verifyRegistrationResponse({
      response:          req.body.attestationResponse,
      expectedChallenge: stored.challenge,
      expectedOrigin:    getOrigin(req),
      expectedRPID:      getRpId(req),
    })

    if (!verification.verified) {
      return res.status(400).json({ error: 'Passkey verification failed' })
    }

    const { registrationInfo } = verification
    const credentialId = Buffer.from(registrationInfo.credentialID).toString('base64url')
    const publicKey    = Buffer.from(registrationInfo.credentialPublicKey).toString('base64url')
    const name         = (req.body.name || '').trim() || 'Passkey'

    await db.query(
      `INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        uuidv4(), req.user.id, credentialId, publicKey,
        registrationInfo.counter || 0,
        registrationInfo.credentialDeviceType || null,
        registrationInfo.credentialBackedUp   || false,
        JSON.stringify(req.body.attestationResponse?.response?.transports || []),
        name,
      ]
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('passkey register verify:', err)
    res.status(500).json({ error: err.message || 'Server error' })
  }
})

// ── GET /list ─────────────────────────────────────────────────────────────────
router.get('/list', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, name, device_type, backed_up, created_at
       FROM passkeys WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await db.query(
      'DELETE FROM passkeys WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    )
    if (!rowCount) return res.status(404).json({ error: 'Passkey not found' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /login/challenge ─────────────────────────────────────────────────────
router.post('/login/challenge', async (req, res) => {
  if (!assertWebAuthn(res)) return
  try {
    const opts = await webauthn.generateAuthenticationOptions({
      rpID:             getRpId(req),
      userVerification: 'preferred',
    })

    const sessionKey = uuidv4()
    challenges.set(`auth:${sessionKey}`, { challenge: opts.challenge, expiresAt: Date.now() + 5 * 60 * 1000 })
    res.json({ ...opts, sessionKey })
  } catch (err) {
    console.error('passkey login challenge:', err)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /login/verify ────────────────────────────────────────────────────────
router.post('/login/verify', async (req, res) => {
  if (!assertWebAuthn(res)) return
  try {
    const { sessionKey, assertionResponse } = req.body
    if (!sessionKey) return res.status(400).json({ error: 'Missing session key' })

    const stored = challenges.get(`auth:${sessionKey}`)
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Challenge expired — please try again.' })
    }
    challenges.delete(`auth:${sessionKey}`)

    const { rows: [passkey] } = await db.query(
      `SELECT p.*, u.id as uid, u.name as uname, u.email, u.role, u.is_active
       FROM passkeys p JOIN users u ON u.id = p.user_id
       WHERE p.credential_id = $1`,
      [assertionResponse.id]
    )
    if (!passkey) return res.status(400).json({ error: 'Passkey not recognised' })
    if (!passkey.is_active) return res.status(403).json({ error: 'Account is deactivated' })

    const verification = await webauthn.verifyAuthenticationResponse({
      response:          assertionResponse,
      expectedChallenge: stored.challenge,
      expectedOrigin:    getOrigin(req),
      expectedRPID:      getRpId(req),
      authenticator: {
        credentialID:       Buffer.from(passkey.credential_id, 'base64url'),
        credentialPublicKey: Buffer.from(passkey.public_key, 'base64url'),
        counter:            Number(passkey.counter),
        transports:         JSON.parse(passkey.transports || '[]'),
      },
    })

    if (!verification.verified) {
      return res.status(400).json({ error: 'Passkey verification failed' })
    }

    await db.query(
      'UPDATE passkeys SET counter = $1 WHERE id = $2',
      [verification.authenticationInfo.newCounter, passkey.id]
    )

    const token = jwt.sign(
      { id: passkey.uid, email: passkey.email, name: passkey.uname, role: passkey.role },
      process.env.JWT_SECRET,
      { expiresIn: `${process.env.COOKIE_MAX_AGE_HOURS || 72}h` }
    )
    res.cookie('token', token, cookieOpts())
    res.json({ ok: true })
  } catch (err) {
    console.error('passkey login verify:', err)
    res.status(500).json({ error: err.message || 'Server error' })
  }
})

module.exports = router
