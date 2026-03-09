'use strict'
const jwt = require('jsonwebtoken')

function requireAuth(req, res, next) {
  const token = req.cookies?.token

  if (!token) {
    console.log(`[auth] No token — ${req.method} ${req.originalUrl}`)
    // Use originalUrl not path — path is relative to the router mount point
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' })
    return res.redirect('/login.html')
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch (err) {
    console.log(`[auth] Invalid token (${err.message}) — ${req.method} ${req.originalUrl}`)
    res.clearCookie('token', { httpOnly: true, sameSite: 'lax', path: '/' })
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'Session expired' })
    return res.redirect('/login.html')
  }
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.token
  if (token) {
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET)
    } catch {
      res.clearCookie('token', { httpOnly: true, sameSite: 'lax', path: '/' })
    }
  }
  next()
}

module.exports = { requireAuth, optionalAuth }
