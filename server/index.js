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

// ─── Runtime overrides (toggled via Settings UI) ──────────────────────────────
const overridesFile = path.join(__dirname, '../.runtime-overrides.json')
function loadOverrides() {
  try { return JSON.parse(fs.readFileSync(overridesFile, 'utf8')) } catch { return {} }
}
function saveOverrides(data) {
  fs.writeFileSync(overridesFile, JSON.stringify(data, null, 2))
}
// Apply overrides to process.env at startup
const _overrides = loadOverrides()
Object.entries(_overrides).forEach(([k, v]) => { process.env[k] = String(v) })

// ─── Version — read from .version file (updated by GitHub Actions) ───────────
const versionFile = path.join(__dirname, '../.version')
const rawVersion  = fs.existsSync(versionFile)
  ? fs.readFileSync(versionFile, 'utf8').trim()
  : require('../package.json').version

// Strip any pre-release suffix to get the clean base (e.g. "0.0.1")
const baseVersion = rawVersion.replace(/-dev\.\d+/, '').replace(/-rc.*/, '')

// If the .version file contains a dev tag but we're running on staging or
// production (e.g. the workflow hasn't run yet after first deploy), fix the
// suffix so the displayed version always matches the actual environment.
const APP_ENV_NORM = (process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase()
let APP_VERSION
if (APP_ENV_NORM === 'production') {
  // On production, show the clean base version only
  APP_VERSION = baseVersion
} else if (APP_ENV_NORM === 'staging') {
  // On staging, show x.y.z-rc — strip any stale dev suffix
  APP_VERSION = rawVersion.includes('-rc') ? rawVersion : `${baseVersion}-rc`
} else {
  // On develop/local, use the raw version as-is (includes -dev.N)
  APP_VERSION = rawVersion
}

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

// Request logger — helps diagnose routing/auth issues
app.use((req, res, next) => {
  const hasCookie = !!req.cookies?.token
  console.log(`[req] ${req.method} ${req.path} cookie=${hasCookie}`)
  next()
})

// Trust proxy only when explicitly configured (i.e. behind Nginx Proxy Manager)
// Accessing via direct IP without a proxy should not have this set
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1)

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

// Serve static assets (CSS, JS, images etc.) but not directory indexes
// HTML files are handled explicitly below so auth guards run first
app.use(express.static(path.join(__dirname, '../public'), { index: false }))

// Inject APP_ENV into page responses via a small config endpoint
app.get('/api/config', optionalAuth, (req, res) => {
  const overrides = loadOverrides()
  res.json({
    appName:      process.env.APP_NAME      || 'ForgeTrack',
    appEnv:       process.env.APP_ENV       || env,
    version:      APP_VERSION,
    user:         req.user || null,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    trustProxy:   (overrides.TRUST_PROXY ?? process.env.TRUST_PROXY) === 'true',
  })
})

// ── Admin: toggle runtime settings ────────────────────────────────────────────
app.patch('/api/config', requireAuth, (req, res) => {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Admin only' })
  const overrides = loadOverrides()
  let restartRequired = false
  if (typeof req.body.cookieSecure === 'boolean') {
    process.env.COOKIE_SECURE = req.body.cookieSecure ? 'true' : 'false'
    overrides.COOKIE_SECURE   = req.body.cookieSecure ? 'true' : 'false'
  }
  if (typeof req.body.trustProxy === 'boolean') {
    overrides.TRUST_PROXY = req.body.trustProxy ? 'true' : 'false'
    restartRequired = true  // trust proxy requires server restart to take effect
  }
  saveOverrides(overrides)
  res.json({
    ok: true,
    cookieSecure:    process.env.COOKIE_SECURE === 'true',
    trustProxy:      overrides.TRUST_PROXY === 'true',
    restartRequired,
  })
})

// ── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'))
app.use('/api/projects', require('./routes/projects'))
app.use('/api/issues',   require('./routes/issues'))
app.use('/api/users',    require('./routes/users'))

// ── Page routing — serve HTML files, guard protected pages ────────────────────
// Public pages — served as-is, client JS handles redirect if already logged in
app.get('/login.html',           (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')))
app.get('/signup.html',          (req, res) => res.sendFile(path.join(__dirname, '../public/signup.html')))
app.get('/forgot-password.html', (req, res) => res.sendFile(path.join(__dirname, '../public/forgot-password.html')))
app.get('/reset-password.html',  (req, res) => res.sendFile(path.join(__dirname, '../public/reset-password.html')))

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
  // Don't redirect unknown pages to / — that causes redirect loops for
  // unauthenticated users. Just 404 non-API requests that don't match a route.
  res.status(404).send('Not found')
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
