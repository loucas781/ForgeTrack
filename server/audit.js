'use strict'
/**
 * audit.js — Write entries to the audit_log table.
 * Usage: await audit(actorId, 'issue.create', 'issue', issue.id, issue.title)
 * Never throws — audit failures must not break the main request.
 */
const db = require('./db/connection')
const { v4: uuidv4 } = require('uuid')

async function audit(actorId, action, entityType, entityId, entityName, meta) {
  try {
    await db.query(
      `INSERT INTO audit_log (id, actor_id, action, entity_type, entity_id, entity_name, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuidv4(),
        actorId || null,
        action,
        entityType,
        entityId  || null,
        entityName || null,
        meta ? JSON.stringify(meta) : null,
      ]
    )
  } catch (err) {
    // Never let audit errors surface to callers
    console.error('[audit] write failed:', err.message)
  }
}

module.exports = audit
