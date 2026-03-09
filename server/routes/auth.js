'use strict'
const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
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

module.exports = router
