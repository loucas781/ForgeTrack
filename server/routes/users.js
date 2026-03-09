'use strict'
const router = require('express').Router()
const db     = require('../db/connection')
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

// ── GET /api/users ────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const users = db.prepare('SELECT id, name, email, initials, color, role, created_at FROM users ORDER BY name').all()
  res.json(users)
})

module.exports = router
