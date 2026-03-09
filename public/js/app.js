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
  if (res.status === 401) { window.location.href = '/login.html'; return }
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
    return `<img src="${esc(user.avatar)}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:inline-block;vertical-align:middle;flex-shrink:0" title="${esc(user.name)}" />`
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
    const v       = config.version
    const base    = v.split('-')[0]
    const isDev   = v.includes('-dev.')
    const devNum  = isDev ? v.split('-dev.')[1] : null
    const label   = isDev ? `v${base} <span style="opacity:.6;font-weight:400;font-size:11px">dev.${devNum}</span>` : `v${base}`
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
          const issues = await GET(`/issues?q=${encodeURIComponent(q)}`)
          if (!issues.length) { searchResults.classList.remove('show'); return }
          searchResults.innerHTML = issues.slice(0,8).map(i => `
            <button class="search-result-item" onclick="location.href='/issue.html?id=${i.id}'">
              ${typeIcon(i.type)}
              <span class="search-result-key">${esc(i.key)}</span>
              <span class="search-result-title">${esc(i.title)}</span>
              <span class="search-result-project">${esc(i.project_name||'')}</span>
            </button>`).join('')
          searchResults.classList.add('show')
        } catch {}
      }, 250)
    })
    searchInput.addEventListener('blur', () => setTimeout(() => searchResults.classList.remove('show'), 200))
  }
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
