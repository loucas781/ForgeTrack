/* shell.js — injects the topbar, sidebar, and mobile nav into app pages */
'use strict'

function buildTopbarHTML() {
  return `
    <header class="topbar">

      <!-- Left: hamburger (only shown inside project pages via CSS) + logo + nav -->
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <button class="topbar-menu-btn" id="sidebar-toggle" title="Menu" aria-label="Toggle menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>

        <a href="/" class="topbar-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#0052cc"/>
            <path d="M7 17L12 7l2 4-2 2 5 4H7z" fill="white" opacity="0.9"/>
            <path d="M12 7l5 10H12l-2-4 2-2V7z" fill="white" opacity="0.6"/>
          </svg>
          <span class="topbar-logo-text" id="topbar-logo-text">ForgeTrack</span>
        </a>

        <nav class="topbar-nav">
          <div class="dropdown">
            <button class="topbar-nav-btn" id="topbar-projects-btn">
              Projects
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
            </button>
            <div class="dropdown-menu" id="topbar-projects-menu" style="min-width:220px;top:calc(100% + 6px);left:0">
              <div class="dropdown-header text-2" style="font-size:12px">Loading…</div>
            </div>
          </div>
        </nav>
      </div>

      <!-- Center: search -->
      <div class="topbar-center">
        <div class="topbar-search">
          <svg class="topbar-search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="topbar-search-input" type="text" id="topbar-search" placeholder="Search issues…" autocomplete="off" />
          <div class="search-results" id="search-results"></div>
        </div>
      </div>

      <!-- Right: mobile search icon + create + settings + avatar -->
      <div class="topbar-right">

        <!-- Search icon (mobile only — opens full-screen search) -->
        <button class="topbar-icon-btn" id="mobile-search-btn" title="Search"
          style="display:none">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        </button>

        <div class="dropdown">
          <button class="btn btn-primary" id="create-btn" onclick="toggleDropdown(document.getElementById('create-menu'))">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            <span class="topbar-create-label">Create</span>
          </button>
          <div class="dropdown-menu dropdown-menu-r" id="create-menu">
            <button class="dropdown-item" id="create-issue-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              New Issue
            </button>
            <button class="dropdown-item" id="create-project-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
              New Project
            </button>
          </div>
        </div>

        <button class="topbar-icon-btn" id="topbar-settings-btn" onclick="location.href='/settings.html'" title="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>

        <!-- Theme toggle -->
        <div class="dropdown" id="theme-dropdown-wrap" style="position:relative">
          <button class="theme-toggle-btn" id="theme-toggle-btn" title="Change theme">
            <svg id="theme-icon-sun" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:none"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            <svg id="theme-icon-moon" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:none"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            <svg id="theme-icon-oled" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="display:none"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
            <svg id="theme-icon-system" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          </button>
          <div class="theme-picker" id="theme-picker">
            <button class="theme-picker-item" data-theme-choice="system">
              <span class="theme-picker-swatch" style="background:linear-gradient(135deg,#fff 50%,#1e2535 50%)"></span>
              System
              <svg class="theme-picker-check" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
            </button>
            <button class="theme-picker-item" data-theme-choice="light">
              <span class="theme-picker-swatch" style="background:#f4f5f7;border-color:#dfe1e6"></span>
              Light
              <svg class="theme-picker-check" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
            </button>
            <button class="theme-picker-item" data-theme-choice="dark">
              <span class="theme-picker-swatch" style="background:#1e2535;border-color:#2d3447"></span>
              Dark
              <svg class="theme-picker-check" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
            </button>
            <button class="theme-picker-item" data-theme-choice="oled">
              <span class="theme-picker-swatch" style="background:#000;border-color:#1a1a1a"></span>
              OLED Black
              <svg class="theme-picker-check" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
            </button>
          </div>
        </div>

        <div class="dropdown">
          <button class="topbar-avatar-btn" id="user-avatar-btn"></button>
          <div class="dropdown-menu dropdown-menu-r" id="user-menu">
            <div class="dropdown-header">
              <div style="font-weight:600;font-size:13px" id="user-menu-name"></div>
              <div class="text-2 text-sm" id="user-menu-email"></div>
            </div>
            <hr class="dropdown-divider" />
            <button class="dropdown-item" onclick="location.href='/profile.html'">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Your Profile
            </button>
            <button class="dropdown-item" onclick="location.href='/settings.html'">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
              Settings
            </button>
            <hr class="dropdown-divider" />
            <button class="dropdown-item danger" id="logout-btn">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </header>`
}

function buildProjectSidebarHTML(project, activePage) {
  const pid = project.id
  const links = [
    { href: `/project.html?id=${pid}&view=issues`,   icon: 'list',     label: 'Issues',           match: 'issues'   },
    { href: `/project.html?id=${pid}&view=backlog`,  icon: 'layers',   label: 'Backlog',          match: 'backlog'  },
    { href: `/project.html?id=${pid}&view=bugs`,     icon: 'bug',      label: 'Bug Reports',      match: 'bugs'     },
    { href: `/reports.html?id=${pid}`,               icon: 'chart',    label: 'Reports',          match: 'reports'  },
    { href: `/project.html?id=${pid}&view=settings`, icon: 'settings', label: 'Project Settings', match: 'settings' },
  ]
  const icons = {
    list:     '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>',
    layers:   '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
    bug:      '<path d="M8 6l4-4 4 4M16 11V8M8 11V8M3 12h2.5M18.5 12H21M5 18l2.5-2.5M19 18l-2.5-2.5M12 22V12M12 12a4 4 0 100-8 4 4 0 000 8z"/>',
    chart:    '<path d="M18 20V10M12 20V4M6 20v-6"/>',
    settings: '<path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  }
  const svgIcon = (name) => `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${icons[name]||''}</svg>`

  return `
    <!-- Sidebar overlay (mobile tap-outside to close) -->
    <div class="sidebar-overlay" id="sidebar-overlay"></div>

    <aside class="sidebar" id="main-sidebar">
      <!-- Close button (mobile) -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border-2)">
        <div style="display:flex;align-items:center;gap:8px">
          ${projectIcon(project, 28)}
          <div style="min-width:0">
            <div class="sidebar-project-name">${esc(project.name)}</div>
            <div class="sidebar-project-key">${esc(project.key)}</div>
          </div>
        </div>
        <button class="topbar-icon-btn" id="sidebar-close" style="color:var(--text-3)" title="Close">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <nav class="sidebar-nav">
        <div class="sidebar-section-label">Planning</div>
        ${links.slice(0,3).map(l => `<a href="${l.href}" class="sidebar-link${activePage===l.match?' active':''}">${svgIcon(l.icon)} ${l.label}</a>`).join('')}
        <div class="sidebar-section-label">Insights</div>
        <a href="${links[3].href}" class="sidebar-link${activePage==='reports'?' active':''}">${svgIcon('chart')} Reports</a>
        <div class="sidebar-section-label">Project</div>
        <a href="${links[4].href}" class="sidebar-link${activePage==='settings'?' active':''}">${svgIcon('settings')} Project Settings</a>
      </nav>
    </aside>`
}

function buildDashboardBottomNav() {
  const path = location.pathname
  return `
    <nav class="bottom-nav" id="bottom-nav">
      <a href="/" class="bottom-nav-btn${path==='/'||path==='/index.html'?' active':''}">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        Home
      </a>
      <button class="bottom-nav-btn" id="mobile-search-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        Search
      </button>
      <a href="/settings.html" class="bottom-nav-btn${path==='/settings.html'?' active':''}">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Settings
      </a>
      <a href="/profile.html" class="bottom-nav-btn${path==='/profile.html'?' active':''}">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        Profile
      </a>
    </nav>`
}

function buildProjectBottomNav(project, activePage) {
  const pid = project.id
  const tabs = [
    { href: `/project.html?id=${pid}&view=issues`,  match: 'issues',  label: 'Issues',   icon: '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>' },
    { href: `/project.html?id=${pid}&view=bugs`,    match: 'bugs',    label: 'Bugs',     icon: '<path d="M8 6l4-4 4 4M16 11V8M8 11V8M3 12h2.5M18.5 12H21M5 18l2.5-2.5M19 18l-2.5-2.5M12 22V12M12 12a4 4 0 100-8 4 4 0 000 8z"/>' },
    { href: `/reports.html?id=${pid}`,              match: 'reports', label: 'Reports',  icon: '<path d="M18 20V10M12 20V4M6 20v-6"/>' },
    { href: `javascript:void(0)`,                   match: 'menu',    label: 'More',     icon: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>', id: 'bottom-sidebar-btn' },
  ]
  return `
    <nav class="bottom-nav" id="bottom-nav">
      ${tabs.map(t => `
        <${t.id ? 'button' : 'a'} ${t.id ? `id="${t.id}"` : `href="${t.href}"`} class="bottom-nav-btn${activePage===t.match?' active':''}">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">${t.icon}</svg>
          ${t.label}
        </${t.id ? 'button' : 'a'}>`).join('')}
    </nav>`
}

function injectShell(opts = {}) {
  const root = document.getElementById('app-root')
  if (!root) return

  const topbar    = buildTopbarHTML()
  const sidebar   = opts.project ? buildProjectSidebarHTML(opts.project, opts.activePage || '') : ''
  const bottomNav = opts.project
    ? buildProjectBottomNav(opts.project, opts.activePage || '')
    : buildDashboardBottomNav()
  const contentId = opts.contentId || 'page-content'

  root.innerHTML = `
    <div class="app-shell">
      ${topbar}
      <div class="app-body">
        ${sidebar}
        <main class="page-content" id="${contentId}">
          <div id="page-inner"></div>
        </main>
      </div>
    </div>
    ${bottomNav}
    <div id="env-corner" class="env-corner"></div>
    ${globalModalsHTML()}
    <!-- Mobile full-screen search -->
    <div id="mobile-search-overlay" style="display:none;position:fixed;inset:0;background:var(--bg);z-index:300;padding:12px;flex-direction:column;gap:8px">
      <div style="display:flex;gap:8px;align-items:center">
        <div style="position:relative;flex:1">
          <svg style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:rgba(255,255,255,.4);pointer-events:none" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="topbar-search-input" type="text" id="mobile-search-input" placeholder="Search issues…" autocomplete="off" style="width:100%" autofocus />
        </div>
        <button class="btn btn-ghost" id="mobile-search-close" style="color:rgba(255,255,255,.7);flex-shrink:0">Cancel</button>
      </div>
      <div id="mobile-search-results" style="background:var(--surface);border-radius:var(--r-lg);overflow:hidden;display:none"></div>
    </div>
  `

  initMobileInteractions()
}

function initMobileInteractions() {
  // ── Sidebar toggle ──────────────────────────────────────────────
  const sidebarToggle  = document.getElementById('sidebar-toggle')
  const sidebarClose   = document.getElementById('sidebar-close')
  const sidebarEl      = document.getElementById('main-sidebar')
  const overlayEl      = document.getElementById('sidebar-overlay')
  const bottomSidebarBtn = document.getElementById('bottom-sidebar-btn')

  function openSidebar() {
    sidebarEl?.classList.add('open')
    overlayEl?.classList.add('show')
    document.body.style.overflow = 'hidden'
  }
  function closeSidebar() {
    sidebarEl?.classList.remove('open')
    overlayEl?.classList.remove('show')
    document.body.style.overflow = ''
  }

  sidebarToggle?.addEventListener('click', () => {
    if (sidebarEl) {
      sidebarEl.classList.contains('open') ? closeSidebar() : openSidebar()
    }
    // No-op if no sidebar (dashboard/settings/profile — hamburger is hidden anyway)
  })
  // Hide hamburger if there's no sidebar on this page
  if (!sidebarEl && sidebarToggle) sidebarToggle.style.display = 'none'
  sidebarClose?.addEventListener('click', closeSidebar)
  overlayEl?.addEventListener('click', closeSidebar)
  bottomSidebarBtn?.addEventListener('click', openSidebar)

  // Close sidebar when a link inside it is tapped
  sidebarEl?.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', closeSidebar)
  })

  // ── Mobile search ───────────────────────────────────────────────
  const mobileSearchBtn     = document.getElementById('mobile-search-btn')
  const mobileSearchOverlay = document.getElementById('mobile-search-overlay')
  const mobileSearchClose   = document.getElementById('mobile-search-close')
  const mobileSearchInput   = document.getElementById('mobile-search-input')
  const mobileSearchResults = document.getElementById('mobile-search-results')

  // Show search icon on mobile, hide topbar center
  function checkMobileSearch() {
    if (window.innerWidth <= 600) {
      mobileSearchBtn && (mobileSearchBtn.style.display = 'flex')
    } else {
      mobileSearchBtn && (mobileSearchBtn.style.display = 'none')
    }
  }
  checkMobileSearch()
  window.addEventListener('resize', checkMobileSearch)

  mobileSearchBtn?.addEventListener('click', () => {
    mobileSearchOverlay.style.display = 'flex'
    setTimeout(() => mobileSearchInput?.focus(), 100)
  })
  mobileSearchClose?.addEventListener('click', () => {
    mobileSearchOverlay.style.display = 'none'
    if (mobileSearchInput) mobileSearchInput.value = ''
    if (mobileSearchResults) { mobileSearchResults.innerHTML = ''; mobileSearchResults.style.display = 'none' }
  })

  let mobileDebounce
  mobileSearchInput?.addEventListener('input', () => {
    clearTimeout(mobileDebounce)
    const q = mobileSearchInput.value.trim()
    if (!q) { mobileSearchResults.style.display = 'none'; return }
    mobileDebounce = setTimeout(async () => {
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
          mobileSearchResults.innerHTML = `<div style="padding:14px 16px;font-size:13px;color:var(--text-3)">No results for "${esc(q)}"</div>`
          mobileSearchResults.style.display = 'block'
          return
        }

        let html = ''
        if (matchedProjects.length) {
          html += `<div style="padding:8px 12px 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)">Projects</div>`
          html += matchedProjects.map(p => `
            <button class="search-result-item" onclick="location.href='/project.html?id=${p.id}'">
              ${projectIcon(p, 18)}
              <span class="search-result-title" style="font-weight:500">${esc(p.name)}</span>
              <span class="search-result-project">${esc(p.key)}</span>
            </button>`).join('')
        }
        if (matchedIssues.length) {
          html += `<div style="padding:8px 12px 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-3)${matchedProjects.length ? ';border-top:1px solid var(--border-2);margin-top:4px;padding-top:8px' : ''}">Issues</div>`
          html += matchedIssues.map(i => `
            <button class="search-result-item" onclick="location.href='/issue.html?id=${i.id}'">
              ${typeIcon(i.type)}
              <span class="search-result-key">${esc(i.key)}</span>
              <span class="search-result-title">${esc(i.title)}</span>
            </button>`).join('')
        }
        mobileSearchResults.innerHTML = html
        mobileSearchResults.style.display = 'block'
      } catch { mobileSearchResults.style.display = 'none' }
    }, 250)
  })
}

function globalModalsHTML() {
  return `
    <!-- Create Issue Modal -->
    <div class="modal-backdrop hidden" id="create-issue-modal">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h2>Create Issue</h2>
          <button class="btn btn-ghost btn-sm" onclick="closeModal('create-issue-modal')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="create-issue-form">
          <div class="modal-body">
            <div class="form-grid-2">
              <div class="form-group">
                <label class="form-label req">Project</label>
                <select class="form-control" id="ci-project" required></select>
              </div>
              <div class="form-group">
                <label class="form-label">Type</label>
                <select class="form-control" id="ci-type">
                  <option value="task">Task</option><option value="bug">Bug</option>
                  <option value="story">Story</option><option value="epic">Epic</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label req">Title</label>
              <input class="form-control" type="text" id="ci-title" placeholder="Short summary of the issue…" required />
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-control" id="ci-desc" rows="3" placeholder="Describe the issue in detail…"></textarea>
            </div>
            <div class="form-grid-3">
              <div class="form-group">
                <label class="form-label">Priority</label>
                <select class="form-control" id="ci-priority">
                  <option value="critical">Critical</option><option value="high">High</option>
                  <option value="medium" selected>Medium</option><option value="low">Low</option><option value="trivial">Trivial</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Status</label>
                <select class="form-control" id="ci-status">
                  <option value="todo">To Do</option><option value="inprogress">In Progress</option>
                  <option value="review">In Review</option><option value="done">Done</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label">Points</label>
                <input class="form-control" type="number" id="ci-points" min="0" max="100" placeholder="—" />
              </div>
            </div>
            <div class="form-grid-2">
              <div class="form-group">
                <label class="form-label">Assignee</label>
                <select class="form-control" id="ci-assignee"></select>
              </div>
              <div class="form-group">
                <label class="form-label">Due Date</label>
                <input class="form-control" type="date" id="ci-due" />
              </div>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Labels <span class="text-3" style="font-weight:400;text-transform:none;letter-spacing:0">(comma separated)</span></label>
              <input class="form-control" type="text" id="ci-labels" placeholder="frontend, mobile, bug…" />
            </div>
            <div class="form-group" style="margin-top:16px;margin-bottom:0">
              <label class="form-label">Attachments <span class="text-3" style="font-weight:400;text-transform:none;letter-spacing:0">(photos or files, max 4MB each)</span></label>
              <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--text-2);padding:6px 12px;border:1px dashed var(--border-2);border-radius:var(--r-md);transition:border-color var(--t-fast)" id="ci-attach-label">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                Choose files
                <input type="file" id="ci-attachments" accept="image/*,.pdf,.txt,.csv" multiple style="display:none" />
              </label>
              <div id="ci-attach-preview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeModal('create-issue-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Issue</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Create Project Modal -->
    <div class="modal-backdrop hidden" id="create-project-modal">
      <div class="modal modal-md">
        <div class="modal-header">
          <h2>Create Project</h2>
          <button class="btn btn-ghost btn-sm" onclick="closeModal('create-project-modal')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="create-project-form">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label req">Project Name</label>
              <input class="form-control" type="text" id="cp-name" placeholder="My Awesome Project" required />
            </div>
            <div class="form-grid-2">
              <div class="form-group">
                <label class="form-label req">Project Key</label>
                <input class="form-control" type="text" id="cp-key" placeholder="MAP" maxlength="6" style="font-family:var(--mono);font-weight:600;text-transform:uppercase" required />
                <span class="form-hint">Used for issue keys e.g. MAP-1</span>
              </div>
              <div class="form-group">
                <label class="form-label">Project Lead</label>
                <select class="form-control" id="cp-lead"></select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">Description</label>
              <textarea class="form-control" id="cp-desc" rows="2" placeholder="What is this project about?"></textarea>
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label class="form-label">Colour</label>
              <div class="color-picker" id="cp-colors"></div>
              <input type="hidden" id="cp-color" value="#0052cc" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" onclick="closeModal('create-project-modal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Project</button>
          </div>
        </form>
      </div>
    </div>`
}

// ── Theme Engine ──────────────────────────────────────────────────────────────
// Runs immediately so theme is applied before first paint (no flash)
;(function() {
  const STORAGE_KEY = 'ft-theme'
  const ICONS = {
    system: 'theme-icon-system',
    light:  'theme-icon-sun',
    dark:   'theme-icon-moon',
    oled:   'theme-icon-oled',
  }

  function getStored() {
    try { return localStorage.getItem(STORAGE_KEY) || 'system' } catch { return 'system' }
  }

  function applyTheme(choice, animate) {
    const html = document.documentElement
    if (animate) {
      html.classList.add('theme-transitioning')
      setTimeout(() => html.classList.remove('theme-transitioning'), 400)
    }
    if (choice === 'system') {
      html.removeAttribute('data-theme')
    } else {
      html.setAttribute('data-theme', choice)
    }
    // Update icon
    Object.values(ICONS).forEach(id => {
      const el = document.getElementById(id)
      if (el) el.style.display = 'none'
    })
    const iconId = ICONS[choice] || ICONS.system
    const icon = document.getElementById(iconId)
    if (icon) icon.style.display = ''

    // Update picker active state
    document.querySelectorAll('.theme-picker-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.themeChoice === choice)
    })
  }

  function saveAndApply(choice, animate) {
    try { localStorage.setItem(STORAGE_KEY, choice) } catch {}
    applyTheme(choice, animate)
  }

  // Apply immediately on load (no animation)
  applyTheme(getStored(), false)

  // Wire up after DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    const btn     = document.getElementById('theme-toggle-btn')
    const picker  = document.getElementById('theme-picker')
    if (!btn || !picker) return

    // Re-apply to update icons/active state after DOM exists
    applyTheme(getStored(), false)

    // Toggle picker open/close
    btn.addEventListener('click', e => {
      e.stopPropagation()
      picker.classList.toggle('show')
    })

    // Pick a theme
    picker.addEventListener('click', e => {
      const item = e.target.closest('[data-theme-choice]')
      if (!item) return
      saveAndApply(item.dataset.themeChoice, true)
      picker.classList.remove('show')
    })

    // Close picker on outside click
    document.addEventListener('click', e => {
      if (!document.getElementById('theme-dropdown-wrap')?.contains(e.target)) {
        picker.classList.remove('show')
      }
    })

    // Follow OS preference changes when in system mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (getStored() === 'system') applyTheme('system', true)
    })
  })
})()
