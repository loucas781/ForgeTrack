'use strict'

// ─── Load environment ─────────────────────────────────────────────────────────
const fs   = require('fs')
const path = require('path')

const env     = process.env.NODE_ENV || 'development'
const envFile = path.join(__dirname, '../', `.env.${env}`)
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx < 0) return
    const k = trimmed.slice(0, eqIdx).trim()
    const v = trimmed.slice(eqIdx + 1).trim()
    if (k && !process.env[k]) process.env[k] = v
  })
}

// ─── Version — read from .version file (updated by GitHub Actions) ───────────
const versionFile = path.join(__dirname, '../.version')
const APP_VERSION = fs.existsSync(versionFile)
  ? fs.readFileSync(versionFile, 'utf8').trim()
  : require('../package.json').version

// ─── Run migration on startup ─────────────────────────────────────────────────
require('./db/migrate')

// ─── App ──────────────────────────────────────────────────────────────────────
const express      = require('express')
const cookieParser = require('cookie-parser')
const rateLimit    = require('express-rate-limit')
const { requireAuth, optionalAuth } = require('./middleware/auth')

const app = express()

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

// Trust the first proxy (Nginx Proxy Manager) so real client IPs are used
// for rate limiting rather than NPM's internal IP
app.set('trust proxy', 1)

// Rate limiting on auth endpoints
// Keyed by real client IP — each user gets their own bucket
app.use('/api/auth', rateLimit({
  windowMs:        15 * 60 * 1000,  // 15 minutes
  max:             20,               // 20 attempts per IP per window
  standardHeaders: true,
  legacyHeaders:   false,
  skip: () => process.env.APP_ENV === 'development',  // disabled in dev LXC
  message: { error: 'Too many attempts — please wait 15 minutes and try again.' },
}))

// Serve static assets only (CSS, JS, images, fonts) — NOT html files
// HTML pages are served explicitly below so auth guards can run first
app.use(express.static(path.join(__dirname, '../public'), { index: false, extensions: [] }))

// Inject APP_ENV into page responses via a small config endpoint
app.get('/api/config', optionalAuth, (req, res) => {
  res.json({
    appName: process.env.APP_NAME || 'ForgeTrack',
    appEnv:  process.env.APP_ENV  || env,
    version: APP_VERSION,
    user:    req.user || null,
  })
})

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'))
app.use('/api/projects', require('./routes/projects'))
app.use('/api/issues',   require('./routes/issues'))
app.use('/api/users',    require('./routes/users'))

// ── Page routing — serve HTML files, guard protected pages ────────────────────
// Public pages — served as-is, client JS handles redirect if already logged in
app.get('/login.html',  (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')))
app.get('/signup.html', (req, res) => res.sendFile(path.join(__dirname, '../public/signup.html')))

// Protected pages — redirect to login if no valid token
app.get(['/', '/index.html'],  requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../public/index.html')))
app.get('/project.html',       requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../public/project.html')))
app.get('/issue.html',         requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../public/issue.html')))
app.get('/profile.html',       requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../public/profile.html')))
app.get('/settings.html',      requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../public/settings.html')))
app.get('/reports.html',       requireAuth, (req, res) => res.sendFile(path.join(__dirname, '../public/reports.html')))

// ── 404 handler ────────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' })
  res.redirect('/')
})

// ── Error handler ──────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err)
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'Internal server error' })
  res.status(500).send('Server error')
})

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000')
app.listen(PORT, () => {
  console.log(`\n  ForgeTrack [${env}] running at http://localhost:${PORT}\n`)
})
