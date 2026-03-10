'use strict'
const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { authenticator } = require('otplib')
const db      = require('../db/connection')
const { requireAuth } = require('../middleware/auth')

const COLORS = ['#0052cc','#00875a','#6554c0','#ff5630','#ff991f','#36b37e','#00b8d9','#e01e5a','#904ee2','#0065ff']

function getInitials(name) {
  return name.trim().split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function cookieOpts() {
  const hours  = parseInt(process.env.COOKIE_MAX_AGE_HOURS || '72')
  const secure = process.env.COOKIE_SECURE === 'true'
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'strict' : 'lax',
    maxAge:   hours * 60 * 60 * 1000,
    path:     '/',
  }
}

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: `${process.env.COOKIE_MAX_AGE_HOURS || 72}h` }
  )
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name?.trim() || !email?.trim() || !password)
      return res.status(400).json({ error: 'All fields are required.' })
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    if (!/\S+@\S+\.\S+/.test(email))
      return res.status(400).json({ error: 'Please enter a valid email address.' })

    const norm = email.trim().toLowerCase()
    const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [norm])
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' })

    const { rows: [{ count }] } = await db.query('SELECT COUNT(*)::int as count FROM users')
    const hash     = await bcrypt.hash(password, 12)
    const colorIdx = count % COLORS.length
    const id       = uuidv4()

    await db.query(
      `INSERT INTO users (id, name, email, password, initials, color, role)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, name.trim(), norm, hash, getInitials(name), COLORS[colorIdx], count === 0 ? 'admin' : 'member']
    )
    const { rows: [user] } = await db.query(
      'SELECT id, name, email, initials, color, avatar, role FROM users WHERE id = $1', [id]
    )
    res.cookie('token', makeToken(user), cookieOpts())
    res.json({ ok: true, user })
  } catch (err) {
    console.error('signup:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email?.trim() || !password)
      return res.status(400).json({ error: 'Email and password are required.' })

    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()])
    if (!rows.length) return res.status(401).json({ error: 'No account found with this email address.' })

    const user = rows[0]
    if (!await bcrypt.compare(password, user.password))
      return res.status(401).json({ error: 'Incorrect password.' })

    const { password: _, ...pub } = user
    res.cookie('token', makeToken(pub), cookieOpts())
    res.json({ ok: true, user: pub })
  } catch (err) {
    console.error('login:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ ok: true })
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, initials, color, avatar, role, created_at FROM users WHERE id = $1', [req.user.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    res.json(rows[0])
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const { name, email, color, currentPassword, newPassword } = req.body
    const { rows } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id])
    if (!rows.length) return res.status(404).json({ error: 'User not found' })
    const user = rows[0]

    const updates = {}
    if (name?.trim())  { updates.name = name.trim(); updates.initials = getInitials(name.trim()) }
    if (color)         { updates.color = color }
    if (req.body.avatar !== undefined) { updates.avatar = req.body.avatar || null }
    if (email?.trim()) {
      const normalized = email.trim().toLowerCase()
      if (normalized !== user.email) {
        const { rows: clash } = await db.query(
          'SELECT id FROM users WHERE email = $1 AND id != $2', [normalized, user.id]
        )
        if (clash.length) return res.status(409).json({ error: 'Email is already in use.' })
        updates.email = normalized
      }
    }
    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: 'Current password is required.' })
      if (!await bcrypt.compare(currentPassword, user.password))
        return res.status(401).json({ error: 'Current password is incorrect.' })
      if (newPassword.length < 6)
        return res.status(400).json({ error: 'New password must be at least 6 characters.' })
      updates.password = await bcrypt.hash(newPassword, 12)
    }

    if (Object.keys(updates).length) {
      const keys = Object.keys(updates)
      const vals = Object.values(updates)
      const set  = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
      await db.query(`UPDATE users SET ${set} WHERE id = $${keys.length + 1}`, [...vals, user.id])
    }

    const { rows: [updated] } = await db.query(
      'SELECT id, name, email, initials, color, avatar, role FROM users WHERE id = $1', [user.id]
    )
    res.cookie('token', makeToken(updated), cookieOpts())
    res.json({ ok: true, user: updated })
  } catch (err) {
    console.error('profile:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── 2FA status ────────────────────────────────────────────────────────────────
router.get('/2fa/status', requireAuth, async (req, res) => {
  try {
    const { rows: [user] } = await db.query('SELECT totp_enabled FROM users WHERE id = $1', [req.user.id])
    res.json({ enabled: !!user?.totp_enabled })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// ── 2FA setup — generate secret ───────────────────────────────────────────────
router.post('/2fa/setup', requireAuth, async (req, res) => {
  try {
    const secret  = authenticator.generateSecret()
    const appName = process.env.APP_NAME || 'ForgeTrack'
    const { rows: [user] } = await db.query('SELECT email FROM users WHERE id = $1', [req.user.id])
    const otpauth = authenticator.keyuri(user.email, appName, secret)
    // Store pending secret (not yet confirmed)
    await db.query('UPDATE users SET totp_secret = $1 WHERE id = $2', [secret, req.user.id])
    res.json({ secret, otpauth })
  } catch (err) {
    console.error('2fa setup:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── 2FA verify + enable ───────────────────────────────────────────────────────
router.post('/2fa/verify', requireAuth, async (req, res) => {
  const { secret, code } = req.body
  if (!secret || !code) return res.status(400).json({ error: 'Secret and code required' })
  try {
    const valid = authenticator.verify({ token: String(code).replace(/\s/g, ''), secret })
    if (!valid) return res.status(400).json({ error: 'Invalid code — try again' })
    await db.query('UPDATE users SET totp_secret = $1, totp_enabled = TRUE WHERE id = $2', [secret, req.user.id])
    res.json({ ok: true })
  } catch (err) {
    console.error('2fa verify:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── 2FA disable ───────────────────────────────────────────────────────────────
router.post('/2fa/disable', requireAuth, async (req, res) => {
  const { code } = req.body
  if (!code) return res.status(400).json({ error: 'Code required' })
  try {
    const { rows: [user] } = await db.query('SELECT totp_secret FROM users WHERE id = $1', [req.user.id])
    if (!user?.totp_secret) return res.status(400).json({ error: '2FA is not set up' })
    const valid = authenticator.verify({ token: String(code).replace(/\s/g, ''), secret: user.totp_secret })
    if (!valid) return res.status(400).json({ error: 'Invalid code' })
    await db.query('UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1', [req.user.id])
    res.json({ ok: true })
  } catch (err) {
    console.error('2fa disable:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
// Generates a reset token. No email — returns token directly (admin shares it).
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'Email required' })
  try {
    const { rows: [user] } = await db.query('SELECT id, name FROM users WHERE email = $1', [email.toLowerCase().trim()])
    // Always return success to avoid email enumeration
    if (!user) return res.json({ ok: true, message: 'If that email exists, a reset token has been generated.' })

    // Expire old tokens for this user
    await db.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id])

    const token    = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '') // 64 char token
    const expires  = new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    await db.query(
      'INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES ($1,$2,$3,$4)',
      [uuidv4(), user.id, token, expires]
    )
    res.json({ ok: true, token, message: `Reset token generated for ${user.name}. Share this link with the user.` })
  } catch (err) {
    console.error('forgot password:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/auth/reset-password ─────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body
  if (!token || !password) return res.status(400).json({ error: 'Token and password required' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })
  try {
    const { rows: [row] } = await db.query(
      `SELECT r.id, r.user_id, r.expires_at, r.used
       FROM password_reset_tokens r
       WHERE r.token = $1`, [token]
    )
    if (!row)        return res.status(400).json({ error: 'Invalid or expired reset link' })
    if (row.used)    return res.status(400).json({ error: 'This reset link has already been used' })
    if (new Date(row.expires_at) < new Date()) return res.status(400).json({ error: 'Reset link has expired' })

    const hash = await bcrypt.hash(password, 12)
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [hash, row.user_id])
    await db.query('UPDATE password_reset_tokens SET used = TRUE WHERE id = $1', [row.id])
    res.json({ ok: true })
  } catch (err) {
    console.error('reset password:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/auth/reset-password/validate ────────────────────────────────────
router.get('/reset-password/validate', async (req, res) => {
  const { token } = req.query
  if (!token) return res.status(400).json({ error: 'Token required' })
  try {
    const { rows: [row] } = await db.query(
      `SELECT r.used, r.expires_at, u.name, u.email
       FROM password_reset_tokens r
       JOIN users u ON u.id = r.user_id
       WHERE r.token = $1`, [token]
    )
    if (!row || row.used || new Date(row.expires_at) < new Date())
      return res.status(400).json({ error: 'Invalid or expired reset link' })
    res.json({ ok: true, name: row.name, email: row.email })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})
