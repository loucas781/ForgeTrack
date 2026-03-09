'use strict'
/**
 * migrate.js — Creates the PostgreSQL schema.
 * Run with: node server/db/migrate.js
 * Safe to re-run — uses IF NOT EXISTS throughout.
 */

const path = require('path')
const fs   = require('fs')

// Load env file
const env     = process.env.NODE_ENV || 'development'
const envFile = path.join(__dirname, '../../', `.env.${env}`)
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#') && v.length) process.env[k.trim()] = v.join('=').trim()
  })
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

      -- ── Migrations for existing installs ─────────────────────────────
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

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
