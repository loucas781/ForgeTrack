'use strict'
const router  = require('express').Router()
const db      = require('../db/connection')
const bcrypt  = require('bcryptjs')
const { requireAuth } = require('../middleware/auth')
const audit   = require('../audit')

router.use(requireAuth)

// ── GET /api/users ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, initials, color, avatar, role, is_active, created_at FROM users ORDER BY name'
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PATCH /api/users/:id — admin: toggle active, change role ─────────────────
router.patch('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const { id } = req.params
  const { is_active, role } = req.body
  try {
    const { rows: [target] } = await db.query('SELECT id, name, role, is_active FROM users WHERE id = $1', [id])
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot modify your own account status here.' })

    // Prevent deactivating/demoting the last admin
    if (target.role === 'admin' && (is_active === false || (role && role !== 'admin'))) {
      const { rows: admins } = await db.query("SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE AND id != $1", [id])
      if (!admins.length) return res.status(400).json({ error: 'Cannot deactivate or demote the last active admin.' })
    }

    const updates = []
    const vals    = []
    if (is_active !== undefined) { updates.push(`is_active = $${vals.length + 1}`); vals.push(is_active) }
    if (role      !== undefined) {
      if (!['member','lead','admin'].includes(role)) return res.status(400).json({ error: 'Invalid role.' })
      updates.push(`role = $${vals.length + 1}`)
      vals.push(role)
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' })
    vals.push(id)

    const { rows: [user] } = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${vals.length} RETURNING id, name, email, role, is_active`,
      vals
    )
    if (is_active !== undefined)
      audit(req.user.id, is_active ? 'user.activate' : 'user.deactivate', 'user', id, target.name)
    if (role !== undefined)
      audit(req.user.id, 'user.role_change', 'user', id, target.name, { from: target.role, to: role })
    res.json({ ok: true, user })
  } catch (err) {
    console.error('user patch:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/users/:id/set-password — admin sets a user's password ──────────
router.post('/:id/set-password', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const { password } = req.body
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })
  try {
    const { rows: [target] } = await db.query('SELECT id, name FROM users WHERE id = $1', [req.params.id])
    if (!target) return res.status(404).json({ error: 'User not found' })
    const hash = await bcrypt.hash(password, 12)
    await db.query('UPDATE users SET password = $1 WHERE id = $2', [hash, req.params.id])
    audit(req.user.id, 'user.set_password', 'user', req.params.id, target.name)
    res.json({ ok: true })
  } catch (err) {
    console.error('set password:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/users/:id — admin deletes a user ─────────────────────────────
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  const { id } = req.params
  if (id === req.user.id) return res.status(400).json({ error: 'Use Account settings to delete your own account.' })
  try {
    const { rows: [target] } = await db.query('SELECT id, name, role FROM users WHERE id = $1', [id])
    if (!target) return res.status(404).json({ error: 'User not found' })
    if (target.role === 'admin') {
      const { rows: admins } = await db.query("SELECT id FROM users WHERE role = 'admin' AND id != $1 AND is_active = TRUE", [id])
      if (!admins.length) return res.status(400).json({ error: 'Cannot delete the last admin.' })
    }
    await db.query('UPDATE issues SET assignee_id = NULL WHERE assignee_id = $1', [id])
    await db.query('DELETE FROM users WHERE id = $1', [id])
    audit(req.user.id, 'user.delete', 'user', id, target.name)
    res.json({ ok: true })
  } catch (err) {
    console.error('delete user:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
