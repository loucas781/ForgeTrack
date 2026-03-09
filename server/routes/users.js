'use strict'
const router = require('express').Router()
const db     = require('../db/connection')
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

// ── GET /api/users ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, name, email, initials, color, role, created_at FROM users ORDER BY name'
    )
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
