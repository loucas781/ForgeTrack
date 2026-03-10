'use strict'
const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { authenticator } = require('otplib')
const db      = require('../db/connection')
const { requireAuth } = require('../middleware/auth')
const emailSvc = require('../email')
const fs       = require('fs')
const path     = require('path')
const audit    = require('../audit')

function loadOverrides() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '../../.runtime-overrides.json'), 'utf8')) } catch { return {} }
}

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
    // Check if open signup is allowed
    const overrides = loadOverrides()
    const { rows: [{ count: userCount }] } = await db.query('SELECT COUNT(*)::int as count FROM users')
    const allowSignup = (overrides.ALLOW_SIGNUP ?? 'true') !== 'false'
    // Always allow the very first user (creates the initial admin)
    if (!allowSignup && userCount > 0)
      return res.status(403).json({ error: 'Open registration is disabled. Contact an admin to create an account.' })

    const { name, email: emailAddr, password } = req.body
    if (!name?.trim() || !emailAddr?.trim() || !password)
      return res.status(400).json({ error: 'All fields are required.' })
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' })
    if (!/\S+@\S+\.\S+/.test(emailAddr))
      return res.status(400).json({ error: 'Please enter a valid email address.' })

    const norm = emailAddr.trim().toLowerCase()
    const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [norm])
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' })

    const hash     = await bcrypt.hash(password, 12)
    const colorIdx = userCount % COLORS.length
    const id       = uuidv4()

    await db.query(
      `INSERT INTO users (id, name, email, password, initials, color, role) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, name.trim(), norm, hash, getInitials(name), COLORS[colorIdx], userCount === 0 ? 'admin' : 'member']
    )
    const { rows: [user] } = await db.query(
      'SELECT id, name, email, initials, color, avatar, role FROM users WHERE id = $1', [id]
    )

    // Send welcome email if SMTP is configured (non-blocking)
    const origin = process.env.APP_URL || ''
    emailSvc.sendWelcome({ to: norm, name: name.trim(), loginUrl: origin + '/login.html' }).catch(() => {})

    res.cookie('token', makeToken(user), cookieOpts())
    audit(user.id, 'user.signup', 'user', user.id, user.name)
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
    if (user.is_active === false)
      return res.status(403).json({ error: 'This account has been deactivated. Contact an admin.' })
    if (!await bcrypt.compare(password, user.password))
      return res.status(401).json({ error: 'Incorrect password.' })

    const { password: _, ...pub } = user
    res.cookie('token', makeToken(pub), cookieOpts())
    audit(pub.id, 'user.login', 'user', pub.id, pub.name)
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
    audit(user.id, 'user.profile_update', 'user', user.id, updated.name,
      { changed: Object.keys(updates).filter(k => k !== 'password') })
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

// ── DELETE /api/auth/account ──────────────────────────────────────────────────
router.delete('/account', requireAuth, async (req, res) => {
  try {
    const { rows: [user] } = await db.query('SELECT id, role FROM users WHERE id = $1', [req.user.id])
    if (!user) return res.status(404).json({ error: 'User not found' })

    // If the user is the last admin, block deletion
    if (user.role === 'admin') {
      const { rows: admins } = await db.query("SELECT id FROM users WHERE role = 'admin' AND id != $1", [user.id])
      if (!admins.length)
        return res.status(400).json({ error: 'You are the only admin. Promote another user to admin before deleting your account.' })
    }

    // Unassign issues, then delete account (cascade will handle the rest)
    await db.query('UPDATE issues SET assignee_id = NULL WHERE assignee_id = $1', [user.id])
    await db.query('DELETE FROM users WHERE id = $1', [user.id])

    // Clear session cookie
    res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: process.env.COOKIE_SECURE === 'true' })
    res.json({ ok: true })
  } catch (err) {
    console.error('delete account:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/auth/invite — admin creates account and optionally emails creds ──
router.post('/invite', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const { name, email: emailAddr, role = 'member', sendEmail = true } = req.body
  if (!name?.trim() || !emailAddr?.trim()) return res.status(400).json({ error: 'Name and email required' })
  if (!/\S+@\S+\.\S+/.test(emailAddr)) return res.status(400).json({ error: 'Invalid email address' })

  try {
    const norm = emailAddr.trim().toLowerCase()
    const { rows: existing } = await db.query('SELECT id FROM users WHERE email = $1', [norm])
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' })

    const { rows: [{ count }] } = await db.query('SELECT COUNT(*)::int as count FROM users')
    // Generate a random temp password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + '!'
    const hash     = await bcrypt.hash(tempPassword, 12)
    const colorIdx = count % COLORS.length
    const id       = uuidv4()

    await db.query(
      `INSERT INTO users (id, name, email, password, initials, color, role) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, name.trim(), norm, hash, getInitials(name), COLORS[colorIdx], role === 'admin' ? 'admin' : 'member']
    )

    const origin = process.env.APP_URL || ''
    let emailSent = false
    if (sendEmail && emailSvc.getSmtpConfig().enabled) {
      const result = await emailSvc.sendAdminInvite({ to: norm, name: name.trim(), tempPassword, loginUrl: origin + '/login.html' })
      emailSent = result.ok
    }

    res.json({ ok: true, emailSent, tempPassword: emailSent ? null : tempPassword })
  } catch (err) {
    console.error('invite:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router

// ── POST /api/auth/forgot-password ────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email: emailAddr } = req.body
  if (!emailAddr) return res.status(400).json({ error: 'Email required' })
  try {
    const { rows: [user] } = await db.query('SELECT id, name FROM users WHERE email = $1', [emailAddr.toLowerCase().trim()])
    if (!user) return res.json({ ok: true, emailSent: false, message: 'If that email exists, a reset token has been generated.' })

    // Expire old tokens
    await db.query('UPDATE password_reset_tokens SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id])

    const token   = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
    const expires = new Date(Date.now() + 60 * 60 * 1000)
    await db.query(
      'INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES ($1,$2,$3,$4)',
      [uuidv4(), user.id, token, expires]
    )

    const origin   = process.env.APP_URL || ''
    const resetUrl = `${origin}/reset-password.html?token=${token}`
    const smtp     = emailSvc.getSmtpConfig()

    if (smtp.enabled) {
      const result = await emailSvc.sendPasswordReset({ to: emailAddr.toLowerCase().trim(), name: user.name, resetUrl })
      if (result.ok) return res.json({ ok: true, emailSent: true })
      // Email failed — fall through to return token directly
    }

    // No SMTP or send failed: return token so admin/user can share it manually
    res.json({ ok: true, emailSent: false, token, resetUrl, message: `Reset link generated for ${user.name}.` })
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
