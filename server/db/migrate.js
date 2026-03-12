'use strict'
/**
 * migrate.js — Creates the PostgreSQL schema.
 * Run with: node server/db/migrate.js
 * Safe to re-run — uses IF NOT EXISTS throughout.
 */

const path = require('path')
const fs   = require('fs')

// ── Load env file ─────────────────────────────────────────────────────────────
// Try NODE_ENV first, then fall back through all known env files so the
// migration always finds credentials regardless of how it was invoked.
const root = path.join(__dirname, '../../')

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return false
  fs.readFileSync(filePath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#') && v.length) {
      const key = k.trim()
      // Don't overwrite vars already set on the process (e.g. passed explicitly)
      if (!process.env[key]) process.env[key] = v.join('=').trim()
    }
  })
  return true
}

// 1. Prefer whatever the caller explicitly set as NODE_ENV
const explicitEnv = process.env.NODE_ENV
if (explicitEnv) {
  loadEnvFile(path.join(root, `.env.${explicitEnv}`))
}

// 2. If DATABASE_URL still isn't set, try each env file in priority order
if (!process.env.DATABASE_URL) {
  for (const e of ['production', 'staging', 'development']) {
    if (loadEnvFile(path.join(root, `.env.${e}`)) && process.env.DATABASE_URL) break
  }
}

// 3. Hard-fail with a clear message rather than letting pg throw a cryptic SASL error
if (!process.env.DATABASE_URL || typeof process.env.DATABASE_URL !== 'string') {
  console.error('Migration failed: DATABASE_URL is not set.')
  console.error('Looked for .env.production / .env.staging / .env.development in', root)
  process.exit(1)
}

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
})

async function migrate() {
  const client = await pool.connect()
  try {
    await client.query(`

      -- ── Users ────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS users (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        email       TEXT NOT NULL UNIQUE,
        password    TEXT NOT NULL,
        initials    TEXT NOT NULL,
        color       TEXT NOT NULL DEFAULT '#0052cc',
        avatar      TEXT,
        role        TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Projects ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS projects (
        id          TEXT PRIMARY KEY,
        key         TEXT NOT NULL UNIQUE,
        name        TEXT NOT NULL,
        description TEXT,
        lead_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
        color       TEXT NOT NULL DEFAULT '#0052cc',
        archived    BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Issues ───────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS issues (
        id           TEXT PRIMARY KEY,
        key          TEXT NOT NULL UNIQUE,
        project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title        TEXT NOT NULL,
        description  TEXT,
        type         TEXT NOT NULL DEFAULT 'task'
                       CHECK (type IN ('bug','task','story','epic')),
        status       TEXT NOT NULL DEFAULT 'todo'
                       CHECK (status IN ('todo','inprogress','review','done','cancelled')),
        priority     TEXT NOT NULL DEFAULT 'medium'
                       CHECK (priority IN ('critical','high','medium','low','trivial')),
        assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
        reporter_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
        story_points INTEGER,
        due_date     DATE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Issue counters per project ────────────────────────────────────
      CREATE TABLE IF NOT EXISTS issue_counters (
        project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        counter     INTEGER NOT NULL DEFAULT 0
      );

      -- ── Labels ───────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS issue_labels (
        issue_id    TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        label       TEXT NOT NULL,
        PRIMARY KEY (issue_id, label)
      );

      -- ── Comments ─────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS comments (
        id          TEXT PRIMARY KEY,
        issue_id    TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
        body        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Indexes ──────────────────────────────────────────────────────
      CREATE INDEX IF NOT EXISTS idx_issues_project  ON issues(project_id);
      CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id);
      CREATE INDEX IF NOT EXISTS idx_issues_status   ON issues(status);
      CREATE INDEX IF NOT EXISTS idx_comments_issue  ON comments(issue_id);
      CREATE INDEX IF NOT EXISTS idx_labels_issue    ON issue_labels(issue_id);

      -- ── Issue attachments ─────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS issue_attachments (
        id          TEXT PRIMARY KEY,
        issue_id    TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
        uploader_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        filename    TEXT NOT NULL,
        mime_type   TEXT NOT NULL,
        data        TEXT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_attachments_issue ON issue_attachments(issue_id);

      -- ── Migrations for existing installs ─────────────────────────────
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon TEXT;

      -- ── Update role CHECK to include lead ─────────────────────────────
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','lead','member'));

      -- ── Update role CHECK to include engineer ─────────────────────────
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
      ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin','lead','member','engineer'));

      -- ── Password reset tokens ─────────────────────────────────────
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token       TEXT NOT NULL UNIQUE,
        expires_at  TIMESTAMPTZ NOT NULL,
        used        BOOLEAN NOT NULL DEFAULT FALSE,
        request_ip  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);
      -- Add request_ip to existing installs
      ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS request_ip TEXT;

      -- ── File storage: filepath columns (replace base64) ──────────────
      ALTER TABLE issue_attachments ADD COLUMN IF NOT EXISTS filepath TEXT;

      -- ── Password reset sessions (short-lived, post-token-exchange) ────────
      -- Stores an opaque session ID after the URL token is validated and consumed.
      -- The frontend holds the session ID in memory only — never in the URL.
      CREATE TABLE IF NOT EXISTS password_reset_sessions (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at  TIMESTAMPTZ NOT NULL,
        used        BOOLEAN NOT NULL DEFAULT FALSE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Project enhancements ─────────────────────────────────────────────
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_closed BOOLEAN NOT NULL DEFAULT FALSE;

      -- ── App preferences (key-value store) ────────────────────────────────
      CREATE TABLE IF NOT EXISTS app_preferences (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      -- ── Audit log ──────────────────────────────────────────────────────────
      CREATE TABLE IF NOT EXISTS audit_log (
        id          TEXT PRIMARY KEY,
        actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
        action      TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id   TEXT,
        entity_name TEXT,
        meta        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_actor    ON audit_log(actor_id);
      CREATE INDEX IF NOT EXISTS idx_audit_created  ON audit_log(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_entity   ON audit_log(entity_type, entity_id);

    `)
    console.log('✓ PostgreSQL schema ready')
  } finally {
    client.release()
    await pool.end()
  }
}

migrate().catch(err => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
