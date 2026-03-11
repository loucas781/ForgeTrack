/* app.js — shared utilities loaded on every page */
'use strict'

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_LABELS   = { todo:'To Do', inprogress:'In Progress', review:'In Review', done:'Done', cancelled:'Cancelled' }
const PRIORITY_LABELS = { critical:'Critical', high:'High', medium:'Medium', low:'Low', trivial:'Trivial' }
const TYPE_LABELS     = { bug:'Bug', task:'Task', story:'Story', epic:'Epic' }
const PROJECT_COLORS  = ['#0052cc','#00875a','#6554c0','#ff5630','#ff991f','#36b37e','#00b8d9','#e01e5a','#904ee2','#0065ff']
const AVATAR_COLORS   = ['#0052cc','#00875a','#6554c0','#ff5630','#ff991f','#36b37e','#00b8d9','#e01e5a','#904ee2','#0065ff','#172b4d','#42526e']

// ─── API helper ───────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch('/api' + path, opts)
  if (res.status === 401) { window.location.href = '/login.html'; throw new Error('Not authenticated') }
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}
const GET    = (p)    => api('GET', p)
const POST   = (p, b) => api('POST', p, b)
const PATCH  = (p, b) => api('PATCH', p, b)
const DELETE = (p)    => api('DELETE', p)

// ─── App config / current user ────────────────────────────────────────────────
let APP_CONFIG = {}
async function loadConfig() {
  APP_CONFIG = await GET('/config')
  return APP_CONFIG
}

// ── Password policy helpers ────────────────────────────────────────────────────

/**
 * Returns the active password policy from the last loaded config.
 * Falls back to sensible defaults if config hasn't loaded yet.
 */
function getPolicy() {
  return APP_CONFIG?.passwordPolicy || {
    minLength: 12, requireUpper: true, requireLower: true,
    requireNumber: true, requireSpecial: true, noSequential: true,
  }
}

/**
 * Validate a password against the active policy.
 * Returns { ok, errors: string[] }
 */
function validatePassword(password) {
  const p = getPolicy()
  const errors = []
  if (!password) return { ok: false, errors: ['Password is required.'] }
  if (p.minLength      && password.length < p.minLength)    errors.push(`At least ${p.minLength} characters.`)
  if (p.requireUpper   && !/[A-Z]/.test(password))          errors.push('At least one uppercase letter (A–Z).')
  if (p.requireLower   && !/[a-z]/.test(password))          errors.push('At least one lowercase letter (a–z).')
  if (p.requireNumber  && !/[0-9]/.test(password))          errors.push('At least one number (0–9).')
  if (p.requireSpecial && !/[^A-Za-z0-9]/.test(password))   errors.push('At least one special character (!@#$%…).')
  if (p.noSequential) {
    if (/(.){2,}/.test(password))                         errors.push('No 3+ identical characters in a row (aaa, 111).')
    let run = 1
    for (let i = 1; i < password.length; i++) {
      if (password.charCodeAt(i) - password.charCodeAt(i-1) === 1) { run++; if (run >= 3) break }
      else run = 1
    }
    if (run >= 3)                                           errors.push('No sequential characters in a row (abc, 123).')
  }
  return { ok: errors.length === 0, errors }
}

/**
 * Render a live password strength indicator beneath a password input.
 *
 * Usage:
 *   const pw = document.getElementById('password')
 *   const indicator = createPasswordIndicator()
 *   pw.after(indicator)
 *   pw.addEventListener('input', () => updatePasswordIndicator(indicator, pw.value))
 *
 * The indicator shows rule chips that turn green as each rule is satisfied.
 */
function createPasswordIndicator() {
  const wrap = document.createElement('div')
  wrap.className = 'pw-policy-indicator'
  wrap.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:5px;'
  return wrap
}

function updatePasswordIndicator(wrap, value) {
  const p = getPolicy()
  const rules = []
  if (p.minLength)      rules.push({ key: 'len',     label: `${p.minLength}+ chars`,    ok: value.length >= p.minLength })
  if (p.requireUpper)   rules.push({ key: 'upper',   label: 'A–Z',                      ok: /[A-Z]/.test(value) })
  if (p.requireLower)   rules.push({ key: 'lower',   label: 'a–z',                      ok: /[a-z]/.test(value) })
  if (p.requireNumber)  rules.push({ key: 'num',     label: '0–9',                      ok: /[0-9]/.test(value) })
  if (p.requireSpecial) rules.push({ key: 'special', label: '!@#…',                     ok: /[^A-Za-z0-9]/.test(value) })
  if (p.noSequential) {
    const noRepeat = !(/(.){2,}/.test(value))
    let run = 1; let noSeq = true
    for (let i = 1; i < value.length; i++) {
      if (value.charCodeAt(i) - value.charCodeAt(i-1) === 1) { run++; if (run >= 3) { noSeq = false; break } }
      else run = 1
    }
    rules.push({ key: 'seq', label: 'no aaa/123', ok: value.length === 0 || (noRepeat && noSeq) })
  }

  wrap.innerHTML = rules.map(r => `
    <span style="display:inline-flex;align-items:center;gap:3px;font-size:11px;font-weight:500;
      padding:2px 8px;border-radius:10px;transition:all .2s;
      background:${r.ok ? 'rgba(0,135,90,.12)' : 'var(--gray-100)'};
      color:${r.ok ? 'var(--green,#00875a)' : 'var(--text-3)'}">
      ${r.ok ? '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
      ${r.label}
    </span>`).join('')
}

// Role rank helper — mirrors server/permissions.js
const ROLE_RANK = { member: 0, lead: 1, admin: 2 }
function userRank(role) { return ROLE_RANK[role] ?? 0 }

/**
 * Check if the current logged-in user has at least the given role.
 * userCan('lead') → true for leads and admins
 * userCan('admin') → true only for admins
 */
function userCan(minRole) {
  return userRank(APP_CONFIG?.user?.role) >= userRank(minRole)
}

/**
 * True if the current user can manage a given project object (has lead_id).
 * Mirrors server canManageProject().
 */
function userCanManageProject(proj) {
  if (!APP_CONFIG?.user) return false
  if (APP_CONFIG.user.role === 'admin') return true
  if (APP_CONFIG.user.role === 'lead' && proj?.lead_id === APP_CONFIG.user.id) return true
  return false
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  document.body.appendChild(el)
  setTimeout(() => el.remove(), 3000)
}

// ─── Avatar HTML ──────────────────────────────────────────────────────────────
function avatarHtml(user, size = 24) {
  if (!user) return ''
  const fs = Math.max(9, Math.round(size * 0.38))
  if (user.avatar) {
    // avatar column now stores a relative path like "avatars/userId.png"
    // Legacy values starting with "data:" are still supported during transition
    const src = user.avatar.startsWith('data:') ? user.avatar : `/uploads/${user.avatar}`
    return `<img src="${esc(src)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;flex-shrink:0" title="${esc(user.name)}" />`
  }
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:${user.color||'#0052cc'};font-size:${fs}px" title="${esc(user.name)}">${esc(user.initials||'?')}</span>`
}

// ─── Escape HTML ──────────────────────────────────────────────────────────────
function esc(str) {
  if (str == null) return ''
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─── Date formatting ──────────────────────────────────────────────────────────
function fmtDate(str) {
  if (!str) return '—'
  const d = new Date(str)
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
}
function fmtRelative(str) {
  if (!str) return '—'
  const diff = Date.now() - new Date(str).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30)  return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo/12)}y ago`
}

// ─── Priority icon SVG ────────────────────────────────────────────────────────
function priorityIcon(priority) {
  const colors = { critical:'var(--p-critical)', high:'var(--p-high)', medium:'var(--p-medium)', low:'var(--p-low)', trivial:'var(--p-trivial)' }
  const c = colors[priority] || colors.medium
  const paths = {
    critical: '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5M4.5 9.75l7.5-7.5 7.5 7.5"/>',
    high:     '<path stroke-linecap="round" stroke-linejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/>',
    medium:   '<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14"/>',
    low:      '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>',
    trivial:  '<path stroke-linecap="round" stroke-linejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5M19.5 14.25l-7.5 7.5-7.5-7.5"/>',
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="${c}" stroke-width="2" viewBox="0 0 24 24" title="${priority}">${paths[priority]||paths.medium}</svg>`
}

// ─── Type icon ────────────────────────────────────────────────────────────────
function typeIcon(type) {
  return `<span class="type-icon ti-${type}" title="${TYPE_LABELS[type]||type}">${(type||'?')[0].toUpperCase()}</span>`
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function statusBadge(status) {
  return `<span class="status-badge s-${status}">${esc(STATUS_LABELS[status]||status)}</span>`
}

// ─── Project key → initial letter icon ───────────────────────────────────────
function projectIcon(project, size = 30) {
  if (project.icon) {
    return `<img src="${esc(project.icon)}" style="width:${size}px;height:${size}px;border-radius:4px;object-fit:cover;display:inline-block;flex-shrink:0" title="${esc(project.name)}" />`
  }
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:4px;background:${project.color};color:#fff;font-weight:700;font-size:${Math.round(size*0.43)}px;flex-shrink:0">${esc((project.key||'?')[0])}</span>`
}

// ─── Generate project key from name ──────────────────────────────────────────
function genProjectKey(name) {
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 4)
}

// ─── URL params helper ────────────────────────────────────────────────────────
function getParam(key) { return new URLSearchParams(location.search).get(key) }

// ─── Dropdown toggle ─────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  // Close all dropdowns unless click is inside one
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'))
  }
})
function toggleDropdown(menuEl) {
  const isOpen = menuEl.classList.contains('show')
  document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'))
  if (!isOpen) menuEl.classList.add('show')
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden') }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden') }
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) {
    e.target.classList.add('hidden')
  }
})

// ─── Topbar init ──────────────────────────────────────────────────────────────
async function initTopbar() {
  const config = await loadConfig()
  const user   = config.user

  // Version + env chip next to logo
  const logoEl = document.getElementById('topbar-logo-text')
  if (logoEl && config.version) {
    const v      = config.version
    const base   = v.split('-')[0]
    let label
    if (v.includes('-dev.')) {
      const devNum = v.split('-dev.')[1]
      label = `v${base} <span style="opacity:.6;font-weight:400;font-size:11px">dev.${devNum}</span>`
    } else if (v.includes('-rc')) {
      const rcSuffix = v.split('-rc')[1] // e.g. '' or '.2'
      label = `v${base} <span style="opacity:.75;font-weight:500;font-size:11px">rc${rcSuffix}</span>`
    } else {
      label = `v${base}`
    }
    logoEl.insertAdjacentHTML('afterend',
      `<span class="topbar-version" title="${esc(v)}">${label}</span>`)
  }
  if (logoEl && config.appEnv && config.appEnv !== 'production') {
    logoEl.insertAdjacentHTML('afterend', `<span class="env-chip ${config.appEnv}">${config.appEnv}</span>`)
  }
  // Corner badge — only show on desktop (bottom nav overlaps on mobile)
  const corner = document.getElementById('env-corner')
  if (corner && config.appEnv && config.appEnv !== 'production') {
    corner.innerHTML = `<span class="env-chip ${config.appEnv}">${config.appEnv}</span>`
    corner.style.display = window.innerWidth <= 600 ? 'none' : ''
    window.addEventListener('resize', () => {
      corner.style.display = window.innerWidth <= 600 ? 'none' : ''
    })
  }

  // Projects dropdown in topbar
  const projNavBtn = document.getElementById('topbar-projects-btn')
  const projMenu   = document.getElementById('topbar-projects-menu')
  if (projNavBtn && projMenu) {
    try {
      const projects = await GET('/projects')
      projMenu.innerHTML = projects.length
        ? projects.map(p => `
            <a class="dropdown-item" href="/project.html?id=${p.id}&view=issues" style="text-decoration:none">
              ${projectIcon(p, 18)}
              <span>${esc(p.name)}</span>
              <span class="mono text-3" style="font-size:11px;margin-left:auto">${esc(p.key)}</span>
            </a>`).join('')
          + `<hr class="dropdown-divider"/>
             <button class="dropdown-item" id="proj-menu-new">
               <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
               New Project
             </button>`
        : `<div class="dropdown-header text-2" style="font-size:12px">No projects yet</div>
           <button class="dropdown-item" id="proj-menu-new">
             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
             New Project
           </button>`
      projNavBtn.addEventListener('click', () => toggleDropdown(projMenu))
      projMenu.querySelector('#proj-menu-new')?.addEventListener('click', () => {
        projMenu.classList.remove('show')
        openModal('create-project-modal')
      })
    } catch {}
  }

  // User menu
  const avatarBtn = document.getElementById('user-avatar-btn')
  const userMenu  = document.getElementById('user-menu')
  if (avatarBtn && user) {
    avatarBtn.innerHTML = avatarHtml(user, 30)
    avatarBtn.onclick = () => toggleDropdown(userMenu)
  }
  const userName = document.getElementById('user-menu-name')
  const userEmail = document.getElementById('user-menu-email')
  if (userName)  userName.textContent  = user?.name  || ''
  if (userEmail) userEmail.textContent = user?.email || ''

  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await POST('/auth/logout', {})
    window.location.href = '/login.html'
  })

  // Search
  const searchInput   = document.getElementById('topbar-search')
  const searchResults = document.getElementById('search-results')
  if (searchInput && searchResults) {
    let debounce
    searchInput.addEventListener('input', () => {
      clearTimeout(debounce)
      const q = searchInput.value.trim()
      if (!q) { searchResults.classList.remove('show'); return }
      debounce = setTimeout(async () => {
        try {
          const [issues, projects] = await Promise.all([
            GET(`/issues?q=${encodeURIComponent(q)}`),
            GET('/projects'),
          ])
          const matchedProjects = projects.filter(p =>
            p.name.toLowerCase().includes(q.toLowerCase()) ||
            p.key.toLowerCase().includes(q.toLowerCase())
          ).slice(0, 3)
          const matchedIssues = issues.slice(0, 6)

          if (!matchedProjects.length && !matchedIssues.length) {
            searchResults.innerHTML = `<div style="padding:12px 16px;font-size:13px;color:var(--text-3)">No results for "${esc(q)}"</div>`
            searchResults.classList.add('show')
            return
          }

          let html = ''
          if (matchedProjects.length) {
            html += `<div style="padding:6px 12px 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">Projects</div>`
            html += matchedProjects.map(p => `
              <button class="search-result-item" onclick="location.href='/project.html?id=${p.id}'">
                ${projectIcon(p, 18)}
                <span class="search-result-title" style="font-weight:500">${esc(p.name)}</span>
                <span class="search-result-project">${esc(p.key)}</span>
              </button>`).join('')
          }
          if (matchedIssues.length) {
            html += `<div style="padding:6px 12px 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)${matchedProjects.length ? ';border-top:1px solid var(--border-2);margin-top:4px;padding-top:8px' : ''}">Issues</div>`
            html += matchedIssues.map(i => `
              <button class="search-result-item" onclick="location.href='/issue.html?id=${i.id}'">
                ${typeIcon(i.type)}
                <span class="search-result-key">${esc(i.key)}</span>
                <span class="search-result-title">${esc(i.title)}</span>
                <span class="search-result-project">${esc(i.project_name||'')}</span>
              </button>`).join('')
          }
          searchResults.innerHTML = html
          searchResults.classList.add('show')
        } catch { searchResults.classList.remove('show') }
      }, 250)
    })
    searchInput.addEventListener('blur', () => setTimeout(() => searchResults.classList.remove('show'), 200))
    // Keyboard: Escape closes results
    searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') { searchResults.classList.remove('show'); searchInput.blur() } })
  }
  initAttachmentPicker()
}

// ─── Issue row HTML ───────────────────────────────────────────────────────────
function issueRowHtml(issue) {
  const assignee = issue.assignee_id ? { name: issue.assignee_name, initials: issue.assignee_initials, color: issue.assignee_color } : null
  return `
    <a class="issue-row" href="/issue.html?id=${issue.id}">
      ${typeIcon(issue.type)}
      ${priorityIcon(issue.priority)}
      <span class="ir-key mono">${esc(issue.key)}</span>
      <span class="ir-title">${esc(issue.title)}${issue.labels?.length ? `<span style="margin-left:6px">${issue.labels.map(l=>`<span class="label-chip">${esc(l)}</span>`).join(' ')}</span>` : ''}</span>
      <span class="ir-meta">
        ${statusBadge(issue.status)}
        ${issue.comment_count > 0 ? `<span class="ir-meta-item">💬 ${issue.comment_count}</span>` : ''}
        <span class="ir-meta-item">${fmtRelative(issue.updated_at)}</span>
        ${assignee ? avatarHtml(assignee, 22) : ''}
      </span>
    </a>`
}

// ─── Render grouped issues ────────────────────────────────────────────────────
function renderGroupedIssues(issues, container) {
  const order   = ['todo','inprogress','review','done','cancelled']
  const grouped = {}
  order.forEach(s => { grouped[s] = [] })
  issues.forEach(i => { if (grouped[i.status]) grouped[i.status].push(i) })

  let html = ''
  order.forEach(status => {
    const grp = grouped[status]
    if (!grp.length) return
    html += `
      <div class="issue-group card" data-group="${status}">
        <div class="issue-group-header" onclick="toggleGroup(this)">
          <svg class="collapse-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
          ${statusBadge(status)}
          <span class="group-count">${grp.length}</span>
        </div>
        <div class="issue-group-body">${grp.map(issueRowHtml).join('')}</div>
      </div>`
  })

  container.innerHTML = html || `<div class="card"><div class="empty-state"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg><h3>No issues</h3><p class="text-2">Create one to get started</p></div></div>`
}

function toggleGroup(headerEl) {
  const body = headerEl.nextElementSibling
  const icon = headerEl.querySelector('.collapse-icon')
  const isCollapsed = body.style.display === 'none'
  body.style.display = isCollapsed ? '' : 'none'
  icon.classList.toggle('collapsed', !isCollapsed)
}

// ─── Color swatch picker ──────────────────────────────────────────────────────
function renderColorPicker(containerEl, colors, selectedColor, onChange) {
  containerEl.innerHTML = colors.map(c => `
    <button type="button" class="color-swatch${c===selectedColor?' sel':''}" style="background:${c}" data-color="${c}" title="${c}"></button>
  `).join('')
  containerEl.querySelectorAll('.color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      containerEl.querySelectorAll('.color-swatch').forEach(b => b.classList.remove('sel'))
      btn.classList.add('sel')
      onChange(btn.dataset.color)
    })
  })
}

// ─── Populate select from array ───────────────────────────────────────────────
function populateSelect(selectEl, options, valueKey, labelKey, placeholder = '— Select —') {
  selectEl.innerHTML = `<option value="">${placeholder}</option>` +
    options.map(o => `<option value="${esc(o[valueKey])}">${esc(o[labelKey])}</option>`).join('')
}

// ─── Sidebar active link ──────────────────────────────────────────────────────
function setSidebarActive(href) {
  document.querySelectorAll('.sidebar-link').forEach(l => {
    l.classList.toggle('active', l.getAttribute('href') === href || l.getAttribute('data-match') === href)
  })
}

// ─── Create-issue modal: attachment preview & upload ─────────────────────────
// Call once after modal HTML is in the DOM (initTopbar already does this).
// Stored pending files live on the input element itself.
function initAttachmentPicker() {
  const input   = document.getElementById('ci-attachments')
  const preview = document.getElementById('ci-attach-preview')
  if (!input || !preview) return

  // Keep a live array of validated File objects
  if (!input._files) input._files = []

  input.addEventListener('change', () => {
    const MAX = 4 * 1024 * 1024
    Array.from(input.files).forEach(file => {
      if (file.size > MAX) { toast(`"${file.name}" exceeds 4 MB limit`, 'error'); return }
      if (input._files.find(f => f.name === file.name && f.size === file.size)) return // dedupe
      input._files.push(file)
    })
    input.value = '' // reset so same file can be re-added after removal
    renderAttachPreviews()
  })

  function renderAttachPreviews() {
    preview.innerHTML = input._files.map((f, idx) => {
      const isImg = f.type.startsWith('image/')
      const url   = isImg ? URL.createObjectURL(f) : null
      return `<div style="position:relative;border:1px solid var(--border-2);border-radius:var(--r-md);overflow:hidden;width:80px;background:var(--gray-50)" data-idx="${idx}">
        ${isImg
          ? `<img src="${url}" style="width:80px;height:60px;object-fit:cover;display:block" />`
          : `<div style="width:80px;height:60px;display:flex;align-items:center;justify-content:center">
               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="var(--text-3)" stroke-width="1.5" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
             </div>`}
        <div style="padding:2px 4px;font-size:10px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</div>
        <button type="button" onclick="removeAttachPreview(${idx})"
          style="position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.55);border:none;color:#fff;cursor:pointer;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0;line-height:1">×</button>
      </div>`
    }).join('')
  }

  // Expose so inline onclick can reach it
  window.removeAttachPreview = function(idx) {
    input._files.splice(idx, 1)
    renderAttachPreviews()
  }
}

// Upload all pending attachments for a newly-created issue (fire-and-forget errors)
async function uploadPendingAttachments(issueId) {
  const input = document.getElementById('ci-attachments')
  if (!input?._files?.length) return
  for (const file of input._files) {
    try {
      const data = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload  = () => res(r.result)
        r.onerror = () => rej(new Error('Read failed'))
        r.readAsDataURL(file)
      })
      await POST(`/issues/${issueId}/attachments`, { filename: file.name, mime_type: file.type, data })
    } catch (err) {
      toast(`Failed to upload "${file.name}": ${err.message}`, 'error')
    }
  }
  // Reset for next use
  input._files = []
  const preview = document.getElementById('ci-attach-preview')
  if (preview) preview.innerHTML = ''
}
