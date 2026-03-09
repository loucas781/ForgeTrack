'use strict'
const router = require('express').Router()
const { v4: uuidv4 } = require('uuid')
const db     = require('../db/connection')
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

function getProject(id) {
  const p = db.prepare(`
    SELECT p.*, u.name as lead_name, u.initials as lead_initials, u.color as lead_color
    FROM projects p
    LEFT JOIN users u ON u.id = p.lead_id
    WHERE p.id = ?
  `).get(id)
  if (!p) return null
  const count = db.prepare('SELECT COUNT(*) as c FROM issues WHERE project_id = ? AND status NOT IN (?,?)').get(id, 'done','cancelled')
  return { ...p, open_issues: count.c }
}

// ── GET /api/projects ─────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const projects = db.prepare(`
    SELECT p.*, u.name as lead_name, u.initials as lead_initials, u.color as lead_color,
      (SELECT COUNT(*) FROM issues i WHERE i.project_id = p.id AND i.status NOT IN ('done','cancelled')) as open_issues,
      (SELECT COUNT(*) FROM issues i WHERE i.project_id = p.id) as total_issues
    FROM projects p
    LEFT JOIN users u ON u.id = p.lead_id
    WHERE p.archived = 0
    ORDER BY p.created_at DESC
  `).all()
  res.json(projects)
})

// ── POST /api/projects ────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { name, key, description, color, lead_id } = req.body
  if (!name?.trim() || !key?.trim()) return res.status(400).json({ error: 'Name and key are required.' })

  const keyUpper = key.trim().toUpperCase()
  const existing = db.prepare('SELECT id FROM projects WHERE key = ?').get(keyUpper)
  if (existing) return res.status(409).json({ error: `Project key "${keyUpper}" is already in use.` })

  const id = uuidv4()
  db.prepare(`
    INSERT INTO projects (id, key, name, description, color, lead_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, keyUpper, name.trim(), description?.trim() || null, color || '#0052cc', lead_id || req.user.id)

  db.prepare('INSERT INTO issue_counters (project_id, counter) VALUES (?, 0)').run(id)
  res.status(201).json(getProject(id))
})

// ── GET /api/projects/:id ─────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const p = getProject(req.params.id)
  if (!p) return res.status(404).json({ error: 'Project not found' })
  res.json(p)
})

// ── PATCH /api/projects/:id ───────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id)
  if (!p) return res.status(404).json({ error: 'Project not found' })

  const { name, key, description, color, lead_id, archived } = req.body
  const updates = {}
  if (name !== undefined)        updates.name = name.trim()
  if (key !== undefined)         updates.key  = key.trim().toUpperCase()
  if (description !== undefined) updates.description = description.trim() || null
  if (color !== undefined)       updates.color = color
  if (lead_id !== undefined)     updates.lead_id = lead_id
  if (archived !== undefined)    updates.archived = archived ? 1 : 0

  if (Object.keys(updates).length) {
    const set = Object.keys(updates).map(k => `${k} = ?`).join(', ')
    db.prepare(`UPDATE projects SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id)
  }
  res.json(getProject(req.params.id))
})

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const p = db.prepare('SELECT id FROM projects WHERE id = ?').get(req.params.id)
  if (!p) return res.status(404).json({ error: 'Project not found' })
  db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

module.exports = router
