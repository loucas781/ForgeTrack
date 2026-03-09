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
  const hours = parseInt(process.env.COOKIE_MAX_AGE_HOURS || '72')
  return {
    httpOnly: true,
    secure:   process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge:   hours * 60 * 60 * 1000,
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
router.post('/signup', (req, res) => {
  const { name, email, password } = req.body
  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'All fields are required.' })
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' })
  }
  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' })
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.trim())
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' })

  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c
  const hash      = bcrypt.hashSync(password, 12)
  const colorIdx  = userCount % COLORS.length
  const id        = uuidv4()

  db.prepare(`
    INSERT INTO users (id, name, email, password, initials, color, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), email.trim().toLowerCase(), hash, getInitials(name), COLORS[colorIdx], userCount === 0 ? 'admin' : 'member')

  const user = db.prepare('SELECT id, name, email, initials, color, role FROM users WHERE id = ?').get(id)
  res.cookie('token', makeToken(user), cookieOpts())
  res.json({ ok: true, user })
})

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body
  if (!email?.trim() || !password) {
    return res.status(400).json({ error: 'Email and password are required.' })
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase())
  if (!user) return res.status(401).json({ error: 'No account found with this email address.' })

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Incorrect password.' })
  }

  const { password: _, ...pub } = user
  res.cookie('token', makeToken(pub), cookieOpts())
  res.json({ ok: true, user: pub })
})

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ ok: true })
})

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, name, email, initials, color, role, created_at FROM users WHERE id = ?').get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────
router.patch('/profile', requireAuth, (req, res) => {
  const { name, email, color, currentPassword, newPassword } = req.body
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })

  const updates = {}
  if (name?.trim())  { updates.name = name.trim(); updates.initials = getInitials(name.trim()) }
  if (color)         { updates.color = color }
  if (email?.trim()) {
    const normalized = email.trim().toLowerCase()
    if (normalized !== user.email) {
      const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(normalized, user.id)
      if (clash) return res.status(409).json({ error: 'Email is already in use.' })
      updates.email = normalized
    }
  }
  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Current password is required.' })
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(401).json({ error: 'Current password is incorrect.' })
    }
    if (newPassword.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' })
    updates.password = bcrypt.hashSync(newPassword, 12)
  }

  if (Object.keys(updates).length) {
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ')
    db.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).run(...Object.values(updates), user.id)
  }

  const updated = db.prepare('SELECT id, name, email, initials, color, role FROM users WHERE id = ?').get(user.id)
  res.cookie('token', makeToken(updated), cookieOpts())
  res.json({ ok: true, user: updated })
})

module.exports = router
