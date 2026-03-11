'use strict'
/**
 * filestore.js
 *
 * Handles all file I/O for uploads (avatars + issue attachments).
 * Files are stored on disk under uploads/ and served via an authenticated
 * static route — never as base64 blobs in API responses or the DB.
 *
 * uploads/
 *   avatars/     <userId>.<ext>
 *   attachments/ <uuid>-<sanitised-filename>
 */

const fs   = require('fs')
const path = require('path')
const crypto = require('crypto')

const UPLOADS_DIR = path.join(__dirname, '../uploads')
const AVATAR_DIR  = path.join(UPLOADS_DIR, 'avatars')
const ATTACH_DIR  = path.join(UPLOADS_DIR, 'attachments')

const ICON_DIR = path.join(UPLOADS_DIR, 'icons')

// Ensure dirs exist at module load
;[UPLOADS_DIR, AVATAR_DIR, ATTACH_DIR, ICON_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
})

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'text/plain', 'text/csv',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const EXT_MAP = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/svg+xml': '.svg',
  'application/pdf': '.pdf', 'text/plain': '.txt', 'text/csv': '.csv',
  'application/zip': '.zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
}

/**
 * Save an avatar for a user. Replaces any existing avatar for that user.
 * @param {string} userId
 * @param {string} base64DataUrl  — "data:image/png;base64,..." or raw base64
 * @param {string} mimeType
 * @returns {string} relative path e.g. "avatars/abc123.png"
 */
function saveAvatar(userId, base64DataUrl, mimeType) {
  if (!ALLOWED_MIME.has(mimeType) || !mimeType.startsWith('image/'))
    throw new Error('Invalid image type')

  const buf = decodeBase64(base64DataUrl)
  if (buf.length > 2 * 1024 * 1024) throw new Error('Avatar must be under 2MB')

  const ext      = EXT_MAP[mimeType] || '.jpg'
  const filename = `${userId}${ext}`
  const filepath = path.join(AVATAR_DIR, filename)

  // Remove any existing avatar for this user (different extension)
  try {
    const files = fs.readdirSync(AVATAR_DIR)
    files.filter(f => f.startsWith(userId + '.')).forEach(f => {
      try { fs.unlinkSync(path.join(AVATAR_DIR, f)) } catch {}
    })
  } catch {}

  fs.writeFileSync(filepath, buf)
  return `avatars/${filename}`
}

/**
 * Delete a user's avatar file.
 * @param {string} relPath  — relative path stored in DB e.g. "avatars/abc.png"
 */
function deleteAvatar(relPath) {
  if (!relPath) return
  const abs = path.join(UPLOADS_DIR, relPath)
  try { fs.unlinkSync(abs) } catch {}
}

/**
 * Save an issue attachment.
 * @param {string} base64DataUrl
 * @param {string} mimeType
 * @param {string} originalFilename
 * @returns {{ filepath: string, filename: string }}
 */
function saveAttachment(base64DataUrl, mimeType, originalFilename) {
  if (!ALLOWED_MIME.has(mimeType)) throw new Error('File type not allowed')

  const buf = decodeBase64(base64DataUrl)
  if (buf.length > 5 * 1024 * 1024) throw new Error('File must be under 5MB')

  const safe     = sanitiseFilename(originalFilename)
  const uid      = crypto.randomBytes(8).toString('hex')
  const filename = `${uid}-${safe}`
  const filepath = path.join(ATTACH_DIR, filename)

  fs.writeFileSync(filepath, buf)
  return { filepath: `attachments/${filename}`, filename: safe }
}

/**
 * Delete an attachment file.
 * @param {string} relPath  — relative path stored in DB e.g. "attachments/abc-file.pdf"
 */
function deleteAttachment(relPath) {
  if (!relPath) return
  const abs = path.join(UPLOADS_DIR, relPath)
  try { fs.unlinkSync(abs) } catch {}
}

/**
 * Serve a file — returns { buf, mimeType, filename } or null if not found.
 */
function readFile(relPath) {
  if (!relPath) return null
  // Prevent path traversal
  const abs = path.resolve(path.join(UPLOADS_DIR, relPath))
  if (!abs.startsWith(path.resolve(UPLOADS_DIR))) return null
  try {
    const buf = fs.readFileSync(abs)
    return buf
  } catch { return null }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function decodeBase64(dataUrl) {
  if (typeof dataUrl !== 'string') throw new Error('Invalid data')
  const raw = dataUrl.startsWith('data:') ? dataUrl.split(',')[1] : dataUrl
  return Buffer.from(raw, 'base64')
}

function sanitiseFilename(name) {
  return (name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 100)
}

/**
 * Save a project icon. Replaces any existing icon for that project.
 * @param {string} projectId
 * @param {string} base64DataUrl  — "data:image/png;base64,..." or raw base64
 * @param {string} mimeType
 * @returns {string} relative path e.g. "icons/abc123.png"
 */
function saveProjectIcon(projectId, base64DataUrl, mimeType) {
  if (!ALLOWED_MIME.has(mimeType) || !mimeType.startsWith('image/'))
    throw new Error('Invalid image type')

  const buf = decodeBase64(base64DataUrl)
  if (buf.length > 2 * 1024 * 1024) throw new Error('Icon must be under 2MB')

  const ext      = EXT_MAP[mimeType] || '.jpg'
  const filename = `${projectId}${ext}`
  const filepath = path.join(ICON_DIR, filename)

  // Remove any existing icon for this project (different extension)
  try {
    const files = fs.readdirSync(ICON_DIR)
    files.filter(f => f.startsWith(projectId + '.')).forEach(f => {
      try { fs.unlinkSync(path.join(ICON_DIR, f)) } catch {}
    })
  } catch {}

  fs.writeFileSync(filepath, buf)
  return `icons/${filename}`
}

/**
 * Delete a project icon file.
 * @param {string} relPath  — relative path stored in DB e.g. "icons/abc.png"
 */
function deleteProjectIcon(relPath) {
  if (!relPath) return
  const abs = path.join(UPLOADS_DIR, relPath)
  try { fs.unlinkSync(abs) } catch {}
}

module.exports = { saveAvatar, deleteAvatar, saveProjectIcon, deleteProjectIcon, saveAttachment, deleteAttachment, readFile, UPLOADS_DIR }
