'use strict'
const Database = require('better-sqlite3')
const path     = require('path')
const fs       = require('fs')

const DB_PATH = process.env.DB_PATH || './data/issuetracker.db'
const resolved = path.resolve(DB_PATH)

// Ensure directory exists
const dir = path.dirname(resolved)
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

const db = new Database(resolved)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

module.exports = db
