'use strict'
const router = require('express').Router()
const { v4: uuidv4 } = require('uuid')
const db     = require('../db/connection')
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

async function getProject(id) {
  const { rows } = await db.query(`
    SELECT p.*, u.name as lead_name, u.initials as lead_initials, u.color as lead_color,
      (SELECT COUNT(*)::int FROM issues i WHERE i.project_id = p.id
         AND i.status NOT IN ('done','cancelled')) as open_issues,
      (SELECT COUNT(*)::int FROM issues i WHERE i.project_id = p.id) as total_issues
    FROM projects p
    LEFT JOIN users u ON u.id = p.lead_id
    WHERE p.id = $1
  `, [id])
  return rows[0] || null
}

// ── GET /api/projects ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*, u.name as lead_name, u.initials as lead_initials, u.color as lead_color,
        (SELECT COUNT(*)::int FROM issues i WHERE i.project_id = p.id
           AND i.status NOT IN ('done','cancelled')) as open_issues,
        (SELECT COUNT(*)::int FROM issues i WHERE i.project_id = p.id) as total_issues
      FROM projects p
      LEFT JOIN users u ON u.id = p.lead_id
      WHERE p.archived = FALSE
      ORDER BY p.created_at DESC
    `)
    res.json(rows)
  } catch (err) {
    console.error('projects list:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/projects ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, key, description, color, lead_id } = req.body
    if (!name?.trim() || !key?.trim())
      return res.status(400).json({ error: 'Name and key are required.' })

    const keyUpper = key.trim().toUpperCase()
    const { rows: existing } = await db.query('SELECT id FROM projects WHERE key = $1', [keyUpper])
    if (existing.length) return res.status(409).json({ error: `Project key "${keyUpper}" is already in use.` })

    const id = uuidv4()
    await db.query(
      `INSERT INTO projects (id, key, name, description, color, lead_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, keyUpper, name.trim(), description?.trim() || null, color || '#0052cc', lead_id || req.user.id]
    )
    await db.query('INSERT INTO issue_counters (project_id, counter) VALUES ($1, 0)', [id])
    res.status(201).json(await getProject(id))
  } catch (err) {
    console.error('project create:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/projects/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const p = await getProject(req.params.id)
    if (!p) return res.status(404).json({ error: 'Project not found' })
    res.json(p)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PATCH /api/projects/:id ───────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id FROM projects WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Project not found' })

    const { name, key, description, color, lead_id, archived } = req.body
    const updates = {}
    if (name !== undefined)        updates.name        = name.trim()
    if (key !== undefined)         updates.key         = key.trim().toUpperCase()
    if (description !== undefined) updates.description = description.trim() || null
    if (color !== undefined)       updates.color       = color
    if (lead_id !== undefined)     updates.lead_id     = lead_id
    if (archived !== undefined)    updates.archived    = Boolean(archived)

    if (Object.keys(updates).length) {
      const keys = Object.keys(updates)
      const set  = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
      await db.query(
        `UPDATE projects SET ${set} WHERE id = $${keys.length + 1}`,
        [...Object.values(updates), req.params.id]
      )
    }
    res.json(await getProject(req.params.id))
  } catch (err) {
    console.error('project update:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id FROM projects WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Project not found' })
    await db.query('DELETE FROM projects WHERE id = $1', [req.params.id])
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

module.exports = router
