'use strict'
/**
 * backup.js — Export and restore ForgeTrack data.
 *
 * Export  GET  /api/backup/export
 *   - Dumps all DB tables to a JSON manifest
 *   - Embeds file assets (avatars, icons, attachments) as base64
 *   - Returns a .ftbackup file (JSON wrapped in a versioned envelope)
 *   - Admin only
 *
 * Restore  POST  /api/backup/restore   (multipart, field: backup)
 *   - Accepts a .ftbackup file
 *   - Upserts all rows in dependency order — never wipes existing data
 *   - Restores files to disk
 *   - Admin only
 *
 * Restore strategy: INSERT ... ON CONFLICT (id) DO UPDATE
 *   This means existing rows are overwritten with backup values, and rows
 *   that don't exist in the backup are left untouched. Safe to run against
 *   a live instance.
 */

const router  = require('express').Router()
const db      = require('../db/connection')
const { requireAuth } = require('../middleware/auth')
const audit   = require('../audit')
const fs      = require('fs')
const path    = require('path')
const crypto  = require('crypto')

const UPLOADS_DIR = path.join(__dirname, '../../uploads')
const BACKUP_FORMAT_VERSION = 1

router.use(requireAuth)

// ── Admin guard ───────────────────────────────────────────────────────────────
router.use((req, res, next) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
  next()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

function readFileAsBase64(relPath) {
  if (!relPath) return null
  try {
    const abs = path.resolve(path.join(UPLOADS_DIR, relPath))
    if (!abs.startsWith(path.resolve(UPLOADS_DIR))) return null
    const buf = fs.readFileSync(abs)
    return buf.toString('base64')
  } catch { return null }
}

function writeFileFromBase64(relPath, b64) {
  if (!relPath || !b64) return
  try {
    const abs = path.resolve(path.join(UPLOADS_DIR, relPath))
    if (!abs.startsWith(path.resolve(UPLOADS_DIR))) return
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, Buffer.from(b64, 'base64'))
  } catch (e) {
    console.error('backup restore write:', relPath, e.message)
  }
}

// ── GET /api/backup/export ────────────────────────────────────────────────────
router.get('/export', async (req, res) => {
  try {
    // Fetch all tables
    const [
      { rows: users },
      { rows: projects },
      { rows: issues },
      { rows: issue_labels },
      { rows: comments },
      { rows: attachments },
      { rows: audit_log },
      { rows: preferences },
      { rows: counters },
    ] = await Promise.all([
      db.query('SELECT * FROM users ORDER BY created_at'),
      db.query('SELECT * FROM projects ORDER BY created_at'),
      db.query('SELECT * FROM issues ORDER BY created_at'),
      db.query('SELECT * FROM issue_labels'),
      db.query('SELECT * FROM comments ORDER BY created_at'),
      db.query('SELECT * FROM issue_attachments ORDER BY created_at'),
      db.query('SELECT * FROM audit_log ORDER BY created_at LIMIT 10000'),
      db.query('SELECT * FROM app_preferences'),
      db.query('SELECT * FROM issue_counters'),
    ])

    // Embed file assets as base64 so the backup is fully self-contained
    const files = {}

    users.forEach(u => {
      if (u.avatar) {
        const b64 = readFileAsBase64(u.avatar)
        if (b64) files[u.avatar] = b64
      }
    })

    projects.forEach(p => {
      if (p.icon && !p.icon.startsWith('data:')) {
        const b64 = readFileAsBase64(p.icon)
        if (b64) files[p.icon] = b64
      }
    })

    attachments.forEach(a => {
      if (a.filepath) {
        const b64 = readFileAsBase64(a.filepath)
        if (b64) files[a.filepath] = b64
      }
    })

    const manifest = {
      format:    'forgetrack-backup',
      version:   BACKUP_FORMAT_VERSION,
      exported_at: new Date().toISOString(),
      exported_by: req.user.id,
      instance:  process.env.APP_URL || 'unknown',
      tables: {
        users,
        projects,
        issue_counters: counters,
        issues,
        issue_labels,
        comments,
        issue_attachments: attachments,
        audit_log,
        app_preferences: preferences,
      },
      files, // { "avatars/abc.png": "<base64>", ... }
    }

    const json = JSON.stringify(manifest)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const filename  = `forgetrack-backup-${timestamp}.ftbackup`

    audit(req.user.id, 'backup.export', 'system', null, filename)

    res.setHeader('Content-Type', 'application/octet-stream')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', Buffer.byteLength(json))
    res.send(json)
  } catch (err) {
    console.error('backup export:', err.message)
    res.status(500).json({ error: 'Export failed: ' + err.message })
  }
})

// ── POST /api/backup/restore ──────────────────────────────────────────────────
// Accepts raw JSON body (the .ftbackup file contents)
router.post('/restore', async (req, res) => {
  let manifest
  try {
    // Body is parsed as raw text — we set up the raw body parser below
    const raw = req.body
    if (!raw || typeof raw !== 'string') return res.status(400).json({ error: 'No backup data received.' })
    manifest = JSON.parse(raw)
  } catch {
    return res.status(400).json({ error: 'Invalid backup file — could not parse JSON.' })
  }

  if (manifest.format !== 'forgetrack-backup') {
    return res.status(400).json({ error: 'Not a valid ForgeTrack backup file.' })
  }
  if (manifest.version > BACKUP_FORMAT_VERSION) {
    return res.status(400).json({ error: `Backup was created with a newer version of ForgeTrack (format v${manifest.version}). Please upgrade first.` })
  }

  const { tables = {}, files = {} } = manifest
  const stats = { users: 0, projects: 0, issues: 0, comments: 0, labels: 0, attachments: 0, preferences: 0, files: 0 }

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    // ── Helper: run a query inside a savepoint so a failure never aborts the ──
    // outer transaction. Uses unique savepoint names to avoid conflicts.        
    // Returns { result, err } — caller decides whether to retry or throw.       
    let _spSeq = 0
    async function sp(fn) {
      const name = `sp_${++_spSeq}`
      await client.query(`SAVEPOINT ${name}`)
      try {
        const result = await fn()
        await client.query(`RELEASE SAVEPOINT ${name}`)
        return { result, err: null }
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${name}`)
        return { result: null, err }
      }
    }

    // ── 1. Users ─────────────────────────────────────────────────────────────
    // Try upsert by id first (same-instance restore).
    // If email constraint fires (cross-instance / re-install), update by email.
    for (const u of (tables.users || [])) {
      const params = [
        u.id, u.name, u.email, u.password, u.initials, u.color,
        u.avatar || null, u.role, u.is_active ?? true,
        u.totp_secret || null, u.totp_enabled ?? false,
        u.created_at,
      ]
      const { err } = await sp(() => client.query(`
        INSERT INTO users (id, name, email, password, initials, color, avatar, role, is_active, totp_secret, totp_enabled, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO UPDATE SET
          name=$2, email=$3, initials=$5, color=$6, avatar=$7,
          role=$8, is_active=$9, totp_secret=$10, totp_enabled=$11
      `, params))
      if (err) {
        if (err.constraint === 'users_email_key') {
          // Email belongs to a different id — update by email instead
          const { err: fbErr } = await sp(() => client.query(`
            UPDATE users SET
              name=$1, password=$2, initials=$3, color=$4, avatar=$5,
              role=$6, is_active=$7, totp_secret=$8, totp_enabled=$9
            WHERE email=$10
          `, [u.name, u.password, u.initials, u.color,
              u.avatar || null, u.role, u.is_active ?? true,
              u.totp_secret || null, u.totp_enabled ?? false, u.email]))
          if (fbErr) throw fbErr
        } else { throw err }
      }
      stats.users++
    }

    // ── 2. Projects ───────────────────────────────────────────────────────────
    // Try upsert by id first; fall back to update by key on cross-instance restore.
    for (const p of (tables.projects || [])) {
      const params = [
        p.id, p.key, p.name, p.description || null,
        p.lead_id || null, p.created_by || null,
        p.color || '#0052cc', p.archived ?? false, p.is_closed ?? false,
        p.icon || null, p.created_at,
      ]
      const { err } = await sp(() => client.query(`
        INSERT INTO projects (id, key, name, description, lead_id, created_by, color, archived, is_closed, icon, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO UPDATE SET
          key=$2, name=$3, description=$4, lead_id=$5, created_by=$6,
          color=$7, archived=$8, is_closed=$9, icon=$10
      `, params))
      if (err) {
        if (err.constraint === 'projects_key_key') {
          const { err: fbErr } = await sp(() => client.query(`
            UPDATE projects SET
              name=$1, description=$2, lead_id=$3, created_by=$4,
              color=$5, archived=$6, is_closed=$7, icon=$8
            WHERE key=$9
          `, [p.name, p.description || null,
              p.lead_id || null, p.created_by || null,
              p.color || '#0052cc', p.archived ?? false, p.is_closed ?? false,
              p.icon || null, p.key]))
          if (fbErr) throw fbErr
        } else { throw err }
      }
      stats.projects++
    }

    // ── 3. Issue counters ─────────────────────────────────────────────────────
    for (const c of (tables.issue_counters || [])) {
      await sp(() => client.query(`
        INSERT INTO issue_counters (project_id, counter)
        VALUES ($1, $2)
        ON CONFLICT (project_id) DO UPDATE SET counter = GREATEST(issue_counters.counter, EXCLUDED.counter)
      `, [c.project_id, c.counter ?? c.last_number ?? 0]))
    }

    // ── 4. Issues ─────────────────────────────────────────────────────────────
    for (const i of (tables.issues || [])) {
      await sp(() => client.query(`
        INSERT INTO issues (id, key, project_id, title, description, type, status, priority,
                            assignee_id, reporter_id, story_points, due_date, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO UPDATE SET
          key=$2, project_id=$3, title=$4, description=$5, type=$6, status=$7,
          priority=$8, assignee_id=$9, reporter_id=$10, story_points=$11,
          due_date=$12, updated_at=$14
      `, [
        i.id, i.key, i.project_id, i.title, i.description || null,
        i.type || 'task', i.status || 'todo', i.priority || 'medium',
        i.assignee_id || null, i.reporter_id || null,
        i.story_points || null, i.due_date || null,
        i.created_at, i.updated_at || i.created_at,
      ]))
      stats.issues++
    }

    // ── 5. Labels ─────────────────────────────────────────────────────────────
    for (const l of (tables.issue_labels || [])) {
      await sp(() => client.query(`
        INSERT INTO issue_labels (issue_id, label) VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `, [l.issue_id, l.label]))
      stats.labels++
    }

    // ── 6. Comments ───────────────────────────────────────────────────────────
    for (const c of (tables.comments || [])) {
      await sp(() => client.query(`
        INSERT INTO comments (id, issue_id, author_id, body, created_at)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET body=$4
      `, [c.id, c.issue_id, c.author_id || null, c.body, c.created_at]))
      stats.comments++
    }

    // ── 7. Attachments (metadata) ─────────────────────────────────────────────
    for (const a of (tables.issue_attachments || [])) {
      await sp(() => client.query(`
        INSERT INTO issue_attachments (id, issue_id, uploader_id, filename, mime_type, filepath, data, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET filename=$4, mime_type=$5, filepath=$6
      `, [
        a.id, a.issue_id, a.uploader_id || null,
        a.filename, a.mime_type, a.filepath || null,
        a.data || null, a.created_at,
      ]))
      stats.attachments++
    }

    // ── 8. App preferences ────────────────────────────────────────────────────
    for (const p of (tables.app_preferences || [])) {
      await sp(() => client.query(`
        INSERT INTO app_preferences (key, value, updated_at) VALUES ($1,$2,NOW())
        ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()
      `, [p.key, p.value]))
      stats.preferences++
    }

    await client.query('COMMIT')

    // ── 9. Restore files to disk (after successful DB commit) ─────────────────
    for (const [relPath, b64] of Object.entries(files)) {
      writeFileFromBase64(relPath, b64)
      stats.files++
    }

    audit(req.user.id, 'backup.restore', 'system', null, manifest.exported_at, { stats })

    res.json({
      ok: true,
      exported_at: manifest.exported_at,
      instance: manifest.instance,
      stats,
    })
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('backup restore error:', err.message, '| code:', err.code, '| constraint:', err.constraint, '| detail:', err.detail)
    res.status(500).json({ error: 'Restore failed: ' + err.message })
  } finally {
    client.release()
  }
})

module.exports = router
