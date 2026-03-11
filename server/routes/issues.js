'use strict'
const router = require('express').Router()
const { v4: uuidv4 } = require('uuid')
const db     = require('../db/connection')
const { requireAuth } = require('../middleware/auth')
const audit  = require('../audit')
const { canEditIssue, canDeleteComment } = require('../permissions')

router.use(requireAuth)

async function getIssue(id) {
  const { rows } = await db.query(`
    SELECT i.*,
      a.name as assignee_name, a.initials as assignee_initials, a.color as assignee_color,
      r.name as reporter_name, r.initials as reporter_initials, r.color as reporter_color
    FROM issues i
    LEFT JOIN users a ON a.id = i.assignee_id
    LEFT JOIN users r ON r.id = i.reporter_id
    WHERE i.id = $1
  `, [id])
  if (!rows.length) return null
  const issue = rows[0]

  const { rows: labels } = await db.query(
    'SELECT label FROM issue_labels WHERE issue_id = $1 ORDER BY label', [id]
  )
  const { rows: comments } = await db.query(`
    SELECT c.*, u.name as author_name, u.initials as author_initials, u.color as author_color
    FROM comments c
    LEFT JOIN users u ON u.id = c.author_id
    WHERE c.issue_id = $1
    ORDER BY c.created_at ASC
  `, [id])

  issue.labels   = labels.map(r => r.label)
  issue.comments = comments
  return issue
}

// ── GET /api/issues ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { project_id, status, type, priority, assignee_id, q } = req.query

    let sql = `
      SELECT i.*,
        a.name as assignee_name, a.initials as assignee_initials, a.color as assignee_color,
        r.name as reporter_name, r.initials as reporter_initials,
        p.name as project_name,
        (SELECT COUNT(*)::int FROM comments c WHERE c.issue_id = i.id) as comment_count
      FROM issues i
      LEFT JOIN users a ON a.id = i.assignee_id
      LEFT JOIN users r ON r.id = i.reporter_id
      LEFT JOIN projects p ON p.id = i.project_id
      WHERE TRUE
    `
    const params = []
    let p = 1

    if (project_id)  { sql += ` AND i.project_id = $${p++}`;  params.push(project_id) }
    if (status)      { sql += ` AND i.status = $${p++}`;       params.push(status) }
    if (type)        { sql += ` AND i.type = $${p++}`;         params.push(type) }
    if (priority)    { sql += ` AND i.priority = $${p++}`;     params.push(priority) }
    if (assignee_id === 'unassigned') {
      sql += ' AND i.assignee_id IS NULL'
    } else if (assignee_id) {
      sql += ` AND i.assignee_id = $${p++}`; params.push(assignee_id)
    }
    if (q) {
      sql += ` AND (i.title ILIKE $${p} OR i.key ILIKE $${p})`
      params.push(`%${q}%`); p++
    }

    sql += ' ORDER BY i.updated_at DESC'
    const { rows: issues } = await db.query(sql, params)

    // Attach labels
    await Promise.all(issues.map(async issue => {
      const { rows: labels } = await db.query(
        'SELECT label FROM issue_labels WHERE issue_id = $1', [issue.id]
      )
      issue.labels = labels.map(r => r.label)
    }))

    res.json(issues)
  } catch (err) {
    console.error('issues list:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/issues ──────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { project_id, title, description, type, status, priority, assignee_id, labels, story_points, due_date } = req.body
    if (!project_id || !title?.trim())
      return res.status(400).json({ error: 'project_id and title are required.' })

    const { rows: projects } = await db.query('SELECT id, key FROM projects WHERE id = $1', [project_id])
    if (!projects.length) return res.status(404).json({ error: 'Project not found' })
    const project = projects[0]

    // Atomic counter increment
    const { rows: [{ counter }] } = await db.query(
      'UPDATE issue_counters SET counter = counter + 1 WHERE project_id = $1 RETURNING counter',
      [project_id]
    )
    const issueKey = `${project.key}-${counter}`
    const id = uuidv4()

    await db.query(
      `INSERT INTO issues (id, key, project_id, title, description, type, status, priority,
                           assignee_id, reporter_id, story_points, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [id, issueKey, project_id, title.trim(), description?.trim() || null,
       type || 'task', status || 'todo', priority || 'medium',
       assignee_id || null, req.user.id, story_points || null, due_date || null]
    )

    if (Array.isArray(labels)) {
      await Promise.all(
        labels.filter(Boolean).map(l =>
          db.query(
            'INSERT INTO issue_labels (issue_id, label) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [id, l.trim()]
          )
        )
      )
    }

    const created = await getIssue(id)
    audit(req.user.id, 'issue.create', 'issue', id, `${issueKey}: ${title.trim()}`)
    res.status(201).json(created)
  } catch (err) {
    console.error('issue create:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── GET /api/issues/:id ───────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const issue = await getIssue(req.params.id)
    if (!issue) return res.status(404).json({ error: 'Issue not found' })
    res.json(issue)
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── PATCH /api/issues/:id ─────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT i.*, p.lead_id FROM issues i JOIN projects p ON p.id = i.project_id WHERE i.id = $1',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Issue not found' })
    const issue = rows[0]
    const proj  = { id: issue.project_id, lead_id: issue.lead_id }
    if (!canEditIssue(req.user, proj))
      return res.status(403).json({ error: 'Only admins or the project lead can edit issues.' })

    const allowed = ['title','description','type','status','priority','assignee_id','story_points','due_date']
    const updates = {}
    allowed.forEach(k => {
      if (req.body[k] !== undefined) updates[k] = req.body[k] === '' ? null : req.body[k]
    })

    if (Object.keys(updates).length) {
      updates.updated_at = new Date()
      const keys = Object.keys(updates)
      const set  = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
      await db.query(
        `UPDATE issues SET ${set} WHERE id = $${keys.length + 1}`,
        [...Object.values(updates), req.params.id]
      )
    }

    if (Array.isArray(req.body.labels)) {
      await db.query('DELETE FROM issue_labels WHERE issue_id = $1', [req.params.id])
      await Promise.all(
        req.body.labels.filter(Boolean).map(l =>
          db.query(
            'INSERT INTO issue_labels (issue_id, label) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [req.params.id, l.trim()]
          )
        )
      )
    }

    const updated = await getIssue(req.params.id)
    const changedFields = Object.keys(updates).filter(k => k !== 'updated_at')
    if (changedFields.length || Array.isArray(req.body.labels)) {
      audit(req.user.id, 'issue.update', 'issue', req.params.id,
        `${updated.key}: ${updated.title}`,
        changedFields.length ? { changed: changedFields } : { changed: ['labels'] })
    }
    res.json(updated)
  } catch (err) {
    console.error('issue update:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/issues/:id ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT i.id, i.key, i.title, i.project_id, p.lead_id FROM issues i JOIN projects p ON p.id = i.project_id WHERE i.id = $1',
      [req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Issue not found' })
    const issue = rows[0]
    const proj  = { id: issue.project_id, lead_id: issue.lead_id }
    if (!canEditIssue(req.user, proj))
      return res.status(403).json({ error: 'Only admins or the project lead can delete issues.' })
    await db.query('DELETE FROM issues WHERE id = $1', [req.params.id])
    audit(req.user.id, 'issue.delete', 'issue', issue.id, `${issue.key}: ${issue.title}`)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── POST /api/issues/:id/comments ─────────────────────────────────────────────
router.post('/:id/comments', async (req, res) => {
  try {
    const { body } = req.body
    if (!body?.trim()) return res.status(400).json({ error: 'Comment body is required.' })

    const { rows } = await db.query('SELECT id FROM issues WHERE id = $1', [req.params.id])
    if (!rows.length) return res.status(404).json({ error: 'Issue not found' })

    const id = uuidv4()
    await db.query(
      'INSERT INTO comments (id, issue_id, author_id, body) VALUES ($1,$2,$3,$4)',
      [id, req.params.id, req.user.id, body.trim()]
    )
    await db.query('UPDATE issues SET updated_at = NOW() WHERE id = $1', [req.params.id])

    const { rows: [comment] } = await db.query(`
      SELECT c.*, u.name as author_name, u.initials as author_initials, u.color as author_color
      FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.id = $1
    `, [id])
    audit(req.user.id, 'comment.create', 'issue', req.params.id, null, { preview: body.trim().slice(0, 80) })
    res.status(201).json(comment)
  } catch (err) {
    console.error('comment create:', err.message)
    res.status(500).json({ error: 'Server error' })
  }
})

// ── DELETE /api/issues/:id/comments/:cid ──────────────────────────────────────
router.delete('/:id/comments/:cid', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.*, p.lead_id as proj_lead_id, i.project_id
       FROM comments c
       JOIN issues i ON i.id = c.issue_id
       JOIN projects p ON p.id = i.project_id
       WHERE c.id = $1 AND c.issue_id = $2`,
      [req.params.cid, req.params.id]
    )
    if (!rows.length) return res.status(404).json({ error: 'Comment not found' })
    const comment = rows[0]
    const proj    = { id: comment.project_id, lead_id: comment.proj_lead_id }
    if (!canDeleteComment(req.user, comment, proj))
      return res.status(403).json({ error: "You don't have permission to delete this comment." })
    await db.query('DELETE FROM comments WHERE id = $1', [req.params.cid])
    audit(req.user.id, 'comment.delete', 'issue', req.params.id, null, { preview: comment.body.slice(0, 80) })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ── Attachments ───────────────────────────────────────────────────────────────
// ── Attachments ───────────────────────────────────────────────────────────────
const filestore = require('../filestore')

// GET /api/issues/:id/attachments
router.get('/:id/attachments', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT a.id, a.filename, a.mime_type, a.filepath, a.created_at,
              u.name AS uploader_name, u.initials AS uploader_initials, u.color AS uploader_color,
              a.uploader_id
       FROM issue_attachments a
       LEFT JOIN users u ON u.id = a.uploader_id
       WHERE a.issue_id = $1 ORDER BY a.created_at ASC`,
      [req.params.id]
    )
    res.json(rows)
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// GET /api/issues/:id/attachments/:aid/data  — serve file from disk
router.get('/:id/attachments/:aid/data', requireAuth, async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      'SELECT filename, mime_type, filepath, data FROM issue_attachments WHERE id = $1 AND issue_id = $2',
      [req.params.aid, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Not found' })

    // New: serve from disk
    if (row.filepath) {
      const buf = filestore.readFile(row.filepath)
      if (!buf) return res.status(404).json({ error: 'File not found on disk' })
      res.set('Content-Type', row.mime_type)
      res.set('Content-Disposition', `inline; filename="${row.filename}"`)
      res.set('Cache-Control', 'private, max-age=3600')
      return res.send(buf)
    }
    // Legacy fallback: base64 in DB
    if (row.data) {
      const buf = Buffer.from(row.data.split(',')[1] || row.data, 'base64')
      res.set('Content-Type', row.mime_type)
      res.set('Content-Disposition', `inline; filename="${row.filename}"`)
      return res.send(buf)
    }
    res.status(404).json({ error: 'No data' })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

// POST /api/issues/:id/attachments
// Any authenticated user can upload to issues (members, leads, admins)
router.post('/:id/attachments', requireAuth, async (req, res) => {
  const { filename, mime_type, data } = req.body
  if (!filename || !mime_type || !data) return res.status(400).json({ error: 'filename, mime_type and data required' })
  try {
    const { rows: [issue] } = await db.query('SELECT id FROM issues WHERE id = $1', [req.params.id])
    if (!issue) return res.status(404).json({ error: 'Issue not found' })

    // Save to disk
    const { filepath } = filestore.saveAttachment(data, mime_type, filename)
    const id = uuidv4()
    await db.query(
      'INSERT INTO issue_attachments (id, issue_id, uploader_id, filename, mime_type, filepath) VALUES ($1,$2,$3,$4,$5,$6)',
      [id, req.params.id, req.user.id, filename, mime_type, filepath]
    )
    res.status(201).json({ id, filename, mime_type, filepath })
  } catch (err) {
    console.error('attachment upload:', err.message)
    if (err.message.includes('relation "issue_attachments" does not exist')) {
      return res.status(503).json({ error: 'Attachments table not yet created — run: node server/db/migrate.js' })
    }
    res.status(400).json({ error: err.message || 'Server error' })
  }
})

// DELETE /api/issues/:id/attachments/:aid
// Users can delete their own uploads; leads/admins can delete any in their project
router.delete('/:id/attachments/:aid', requireAuth, async (req, res) => {
  try {
    const { rows: [row] } = await db.query(
      `SELECT a.uploader_id, a.filepath,
              p.lead_id as proj_lead_id, i.project_id
       FROM issue_attachments a
       JOIN issues i ON i.id = a.issue_id
       JOIN projects p ON p.id = i.project_id
       WHERE a.id = $1 AND a.issue_id = $2`,
      [req.params.aid, req.params.id]
    )
    if (!row) return res.status(404).json({ error: 'Not found' })
    const isOwn    = row.uploader_id === req.user.id
    const isAdmin  = req.user.role === 'admin'
    const isLead   = req.user.role === 'lead' && row.proj_lead_id === req.user.id
    if (!isOwn && !isAdmin && !isLead)
      return res.status(403).json({ error: "You can only delete your own attachments." })

    filestore.deleteAttachment(row.filepath)
    await db.query('DELETE FROM issue_attachments WHERE id = $1', [req.params.aid])
    res.json({ ok: true })
  } catch { res.status(500).json({ error: 'Server error' }) }
})

module.exports = router
