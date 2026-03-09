'use strict'
const router = require('express').Router()
const { v4: uuidv4 } = require('uuid')
const db     = require('../db/connection')
const { requireAuth } = require('../middleware/auth')

router.use(requireAuth)

function getIssue(id) {
  const issue = db.prepare(`
    SELECT i.*,
      a.name as assignee_name, a.initials as assignee_initials, a.color as assignee_color,
      r.name as reporter_name, r.initials as reporter_initials, r.color as reporter_color
    FROM issues i
    LEFT JOIN users a ON a.id = i.assignee_id
    LEFT JOIN users r ON r.id = i.reporter_id
    WHERE i.id = ?
  `).get(id)
  if (!issue) return null

  issue.labels   = db.prepare('SELECT label FROM issue_labels WHERE issue_id = ? ORDER BY label').all(id).map(r => r.label)
  issue.comments = db.prepare(`
    SELECT c.*, u.name as author_name, u.initials as author_initials, u.color as author_color
    FROM comments c
    LEFT JOIN users u ON u.id = c.author_id
    WHERE c.issue_id = ?
    ORDER BY c.created_at ASC
  `).all(id)
  return issue
}

// ── GET /api/issues?project_id=&status=&type=&priority=&assignee_id=&q= ───────
router.get('/', (req, res) => {
  const { project_id, status, type, priority, assignee_id, q } = req.query

  let sql = `
    SELECT i.*,
      a.name as assignee_name, a.initials as assignee_initials, a.color as assignee_color,
      r.name as reporter_name, r.initials as reporter_initials,
      (SELECT COUNT(*) FROM comments c WHERE c.issue_id = i.id) as comment_count
    FROM issues i
    LEFT JOIN users a ON a.id = i.assignee_id
    LEFT JOIN users r ON r.id = i.reporter_id
    WHERE 1=1
  `
  const params = []

  if (project_id)  { sql += ' AND i.project_id = ?';  params.push(project_id) }
  if (status)      { sql += ' AND i.status = ?';       params.push(status) }
  if (type)        { sql += ' AND i.type = ?';         params.push(type) }
  if (priority)    { sql += ' AND i.priority = ?';     params.push(priority) }
  if (assignee_id === 'unassigned') {
    sql += ' AND i.assignee_id IS NULL'
  } else if (assignee_id) {
    sql += ' AND i.assignee_id = ?'; params.push(assignee_id)
  }
  if (q) {
    sql += ' AND (i.title LIKE ? OR i.key LIKE ?)';
    params.push(`%${q}%`, `%${q}%`)
  }

  sql += ' ORDER BY i.updated_at DESC'
  const issues = db.prepare(sql).all(...params)

  // Attach labels to each
  issues.forEach(issue => {
    issue.labels = db.prepare('SELECT label FROM issue_labels WHERE issue_id = ?').all(issue.id).map(r => r.label)
  })
  res.json(issues)
})

// ── POST /api/issues ──────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { project_id, title, description, type, status, priority, assignee_id, labels, story_points, due_date } = req.body
  if (!project_id || !title?.trim()) return res.status(400).json({ error: 'project_id and title are required.' })

  const project = db.prepare('SELECT id, key FROM projects WHERE id = ?').get(project_id)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  // Increment counter atomically
  db.prepare('UPDATE issue_counters SET counter = counter + 1 WHERE project_id = ?').run(project_id)
  const { counter } = db.prepare('SELECT counter FROM issue_counters WHERE project_id = ?').get(project_id)
  const issueKey = `${project.key}-${counter}`
  const id = uuidv4()

  db.prepare(`
    INSERT INTO issues (id, key, project_id, title, description, type, status, priority, assignee_id, reporter_id, story_points, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, issueKey, project_id, title.trim(), description?.trim() || null,
    type || 'task', status || 'todo', priority || 'medium',
    assignee_id || null, req.user.id, story_points || null, due_date || null)

  // Labels
  if (Array.isArray(labels)) {
    const insert = db.prepare('INSERT OR IGNORE INTO issue_labels (issue_id, label) VALUES (?, ?)')
    labels.filter(Boolean).forEach(l => insert.run(id, l.trim()))
  }

  res.status(201).json(getIssue(id))
})

// ── GET /api/issues/:id ───────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  const issue = getIssue(req.params.id)
  if (!issue) return res.status(404).json({ error: 'Issue not found' })
  res.json(issue)
})

// ── PATCH /api/issues/:id ─────────────────────────────────────────────────────
router.patch('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM issues WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Issue not found' })

  const allowed = ['title','description','type','status','priority','assignee_id','story_points','due_date']
  const updates = {}
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k] === '' ? null : req.body[k] })

  if (Object.keys(updates).length) {
    updates.updated_at = new Date().toISOString()
    const set = Object.keys(updates).map(k => `${k} = ?`).join(', ')
    db.prepare(`UPDATE issues SET ${set} WHERE id = ?`).run(...Object.values(updates), req.params.id)
  }

  // Labels
  if (Array.isArray(req.body.labels)) {
    db.prepare('DELETE FROM issue_labels WHERE issue_id = ?').run(req.params.id)
    const insert = db.prepare('INSERT OR IGNORE INTO issue_labels (issue_id, label) VALUES (?, ?)')
    req.body.labels.filter(Boolean).forEach(l => insert.run(req.params.id, l.trim()))
  }

  res.json(getIssue(req.params.id))
})

// ── DELETE /api/issues/:id ────────────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT id FROM issues WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Issue not found' })
  db.prepare('DELETE FROM issues WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

// ── POST /api/issues/:id/comments ─────────────────────────────────────────────
router.post('/:id/comments', (req, res) => {
  const { body } = req.body
  if (!body?.trim()) return res.status(400).json({ error: 'Comment body is required.' })

  const issue = db.prepare('SELECT id FROM issues WHERE id = ?').get(req.params.id)
  if (!issue) return res.status(404).json({ error: 'Issue not found' })

  const id = uuidv4()
  db.prepare('INSERT INTO comments (id, issue_id, author_id, body) VALUES (?, ?, ?, ?)').run(id, req.params.id, req.user.id, body.trim())
  db.prepare("UPDATE issues SET updated_at = datetime('now') WHERE id = ?").run(req.params.id)

  const comment = db.prepare(`
    SELECT c.*, u.name as author_name, u.initials as author_initials, u.color as author_color
    FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ?
  `).get(id)
  res.status(201).json(comment)
})

// ── DELETE /api/issues/:id/comments/:cid ──────────────────────────────────────
router.delete('/:id/comments/:cid', (req, res) => {
  const comment = db.prepare('SELECT * FROM comments WHERE id = ? AND issue_id = ?').get(req.params.cid, req.params.id)
  if (!comment) return res.status(404).json({ error: 'Comment not found' })
  if (comment.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Cannot delete another user\'s comment.' })
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.cid)
  res.json({ ok: true })
})

module.exports = router
