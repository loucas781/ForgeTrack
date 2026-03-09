'use strict'
/**
 * migrate.js — Creates the SQLite schema.
 * Run with: node server/db/migrate.js
 * Safe to re-run — uses IF NOT EXISTS throughout.
 */

const path  = require('path')
const fs    = require('fs')

// Load env from the right file
const env = process.env.NODE_ENV || 'development'
const envFile = path.join(__dirname, '../../', `.env.${env}`)
if (fs.existsSync(envFile)) {
  require('fs').readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=')
    if (k && !k.startsWith('#') && v.length) process.env[k.trim()] = v.join('=').trim()
  })
}

const DB_PATH = process.env.DB_PATH || './data/forgetrack.db'
const dbDir   = path.dirname(path.resolve(DB_PATH))
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

const Database = require('better-sqlite3')
const db = new Database(path.resolve(DB_PATH))

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  -- ─── Users ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password    TEXT NOT NULL,
    initials    TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT '#0052cc',
    role        TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ─── Projects ─────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    key         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    description TEXT,
    lead_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
    color       TEXT NOT NULL DEFAULT '#0052cc',
    archived    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ─── Issues ───────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS issues (
    id           TEXT PRIMARY KEY,
    key          TEXT NOT NULL UNIQUE,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    type         TEXT NOT NULL DEFAULT 'task' CHECK(type IN ('bug','task','story','epic')),
    status       TEXT NOT NULL DEFAULT 'todo'
                   CHECK(status IN ('todo','inprogress','review','done','cancelled')),
    priority     TEXT NOT NULL DEFAULT 'medium'
                   CHECK(priority IN ('critical','high','medium','low','trivial')),
    assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    reporter_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
    story_points INTEGER,
    due_date     TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ─── Issue counters per project ────────────────────────────────────
  CREATE TABLE IF NOT EXISTS issue_counters (
    project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    counter     INTEGER NOT NULL DEFAULT 0
  );

  -- ─── Labels ────────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS issue_labels (
    issue_id    TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    PRIMARY KEY (issue_id, label)
  );

  -- ─── Comments ─────────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    issue_id    TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ─── Indexes ──────────────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_issues_project  ON issues(project_id);
  CREATE INDEX IF NOT EXISTS idx_issues_assignee ON issues(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_issues_status   ON issues(status);
  CREATE INDEX IF NOT EXISTS idx_comments_issue  ON comments(issue_id);
  CREATE INDEX IF NOT EXISTS idx_labels_issue    ON issue_labels(issue_id);
`)

console.log(`✓ Database schema ready at: ${path.resolve(DB_PATH)}`)
db.close()
