'use strict'
const jwt = require('jsonwebtoken')

function requireAuth(req, res, next) {
  const token = req.cookies?.token
  if (!token) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated' })
    return res.redirect('/login.html')
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    res.clearCookie('token')
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Session expired' })
    return res.redirect('/login.html')
  }
}

function optionalAuth(req, res, next) {
  const token = req.cookies?.token
  if (token) {
    try { req.user = jwt.verify(token, process.env.JWT_SECRET) } catch { res.clearCookie('token') }
  }
  next()
}

module.exports = { requireAuth, optionalAuth }
