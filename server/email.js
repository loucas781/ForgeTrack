'use strict'
// ── ForgeTrack email module ───────────────────────────────────────────────────
// SMTP config is stored in .runtime-overrides.json and never committed to git.
// All functions return { ok, error } — never throw, so callers can degrade
// gracefully if email isn't configured.

const fs   = require('fs')
const path = require('path')

const overridesFile = path.join(__dirname, '../.runtime-overrides.json')
function loadOverrides() {
  try { return JSON.parse(fs.readFileSync(overridesFile, 'utf8')) } catch { return {} }
}

function getSmtpConfig() {
  const o = loadOverrides()
  return {
    host:     o.SMTP_HOST     || '',
    port:     parseInt(o.SMTP_PORT || '587', 10),
    secure:   o.SMTP_SECURE   === 'true',   // true = TLS on port 465
    user:     o.SMTP_USER     || '',
    pass:     o.SMTP_PASS     || '',
    fromName: o.SMTP_FROM_NAME || o.APP_NAME || 'ForgeTrack',
    fromAddr: o.SMTP_FROM_ADDR || o.SMTP_USER || '',
    enabled:  !!(o.SMTP_HOST && o.SMTP_USER),
  }
}

async function createTransport() {
  const nodemailer = require('nodemailer')
  const cfg = getSmtpConfig()
  if (!cfg.enabled) return null
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    tls: { rejectUnauthorized: false },  // allow self-signed certs on LAN
  })
}

async function sendMail({ to, subject, html, text }) {
  try {
    const transport = await createTransport()
    if (!transport) return { ok: false, error: 'SMTP not configured' }
    const cfg = getSmtpConfig()
    await transport.sendMail({
      from: `"${cfg.fromName}" <${cfg.fromAddr}>`,
      to, subject, html, text,
    })
    return { ok: true }
  } catch (err) {
    console.error('Email send error:', err.message)
    return { ok: false, error: err.message }
  }
}

async function testConnection() {
  try {
    const transport = await createTransport()
    if (!transport) return { ok: false, error: 'SMTP not configured' }
    await transport.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ── Email templates ───────────────────────────────────────────────────────────
function baseTemplate(title, bodyHtml, appName = 'ForgeTrack') {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 0">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
        <!-- Header -->
        <tr><td style="background:#0052cc;border-radius:8px 8px 0 0;padding:24px 32px">
          <span style="color:#fff;font-size:18px;font-weight:700;letter-spacing:-.02em">${appName}</span>
        </td></tr>
        <!-- Body -->
        <tr><td style="background:#fff;padding:32px;border-left:1px solid #e2e4e8;border-right:1px solid #e2e4e8">
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="background:#f4f5f7;border:1px solid #e2e4e8;border-top:none;border-radius:0 0 8px 8px;padding:16px 32px;text-align:center">
          <span style="font-size:11px;color:#6b778c">This email was sent by ${appName}. If you didn't request this, you can safely ignore it.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

async function sendPasswordReset({ to, name, resetUrl }) {
  const cfg     = getSmtpConfig()
  const appName = cfg.fromName
  const html    = baseTemplate('Reset your password', `
    <h2 style="margin:0 0 8px;font-size:22px;color:#172b4d">Reset your password</h2>
    <p style="color:#5e6c84;font-size:14px;margin:0 0 24px">Hi ${name}, someone requested a password reset for your ${appName} account.</p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="background:#0052cc;border-radius:6px;padding:12px 28px">
        <a href="${resetUrl}" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none">Reset Password</a>
      </td></tr>
    </table>
    <p style="color:#5e6c84;font-size:13px;margin:0 0 8px">Or copy this link into your browser:</p>
    <p style="color:#0052cc;font-size:12px;word-break:break-all;margin:0 0 24px">${resetUrl}</p>
    <p style="color:#5e6c84;font-size:12px;margin:0;border-top:1px solid #e2e4e8;padding-top:16px">This link expires in <strong>1 hour</strong>.</p>
  `, appName)

  return sendMail({
    to,
    subject: `Reset your ${appName} password`,
    html,
    text: `Hi ${name},\n\nReset your password here:\n${resetUrl}\n\nThis link expires in 1 hour.\n\n— ${appName}`,
  })
}

async function sendWelcome({ to, name, loginUrl }) {
  const cfg     = getSmtpConfig()
  const appName = cfg.fromName
  const html    = baseTemplate('Welcome to ' + appName, `
    <h2 style="margin:0 0 8px;font-size:22px;color:#172b4d">Welcome to ${appName}, ${name}!</h2>
    <p style="color:#5e6c84;font-size:14px;margin:0 0 24px">Your account has been created. Click below to sign in.</p>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:24px">
      <tr><td style="background:#0052cc;border-radius:6px;padding:12px 28px">
        <a href="${loginUrl}" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none">Sign In</a>
      </td></tr>
    </table>
  `, appName)

  return sendMail({
    to,
    subject: `Welcome to ${appName}`,
    html,
    text: `Welcome to ${appName}, ${name}!\n\nSign in here:\n${loginUrl}\n\n— ${appName}`,
  })
}

async function sendAdminInvite({ to, name, tempPassword, loginUrl }) {
  const cfg     = getSmtpConfig()
  const appName = cfg.fromName
  const html    = baseTemplate(`You've been invited to ${appName}`, `
    <h2 style="margin:0 0 8px;font-size:22px;color:#172b4d">You've been invited</h2>
    <p style="color:#5e6c84;font-size:14px;margin:0 0 24px">An admin has created a ${appName} account for you, ${name}.</p>
    <table style="width:100%;margin-bottom:24px;border-collapse:collapse">
      <tr><td style="padding:8px 12px;background:#f4f5f7;color:#5e6c84;font-size:13px;width:120px;border:1px solid #e2e4e8">Email</td>
          <td style="padding:8px 12px;background:#fff;font-size:13px;border:1px solid #e2e4e8">${to}</td></tr>
      <tr><td style="padding:8px 12px;background:#f4f5f7;color:#5e6c84;font-size:13px;border:1px solid #e2e4e8">Password</td>
          <td style="padding:8px 12px;background:#fff;font-size:13px;font-family:monospace;border:1px solid #e2e4e8">${tempPassword}</td></tr>
    </table>
    <table cellpadding="0" cellspacing="0" style="margin-bottom:16px">
      <tr><td style="background:#0052cc;border-radius:6px;padding:12px 28px">
        <a href="${loginUrl}" style="color:#fff;font-size:14px;font-weight:600;text-decoration:none">Sign In Now</a>
      </td></tr>
    </table>
    <p style="color:#de350b;font-size:12px;margin:0">Please change your password after signing in.</p>
  `, appName)

  return sendMail({
    to,
    subject: `You've been invited to ${appName}`,
    html,
    text: `You've been invited to ${appName}.\n\nEmail: ${to}\nPassword: ${tempPassword}\n\nSign in: ${loginUrl}\n\nPlease change your password after signing in.\n\n— ${appName}`,
  })
}

module.exports = { getSmtpConfig, testConnection, sendPasswordReset, sendWelcome, sendAdminInvite }
