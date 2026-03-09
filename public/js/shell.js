/* shell.js — injects the topbar and optional sidebar into app pages */
'use strict'

function buildTopbarHTML() {
  return `
    <header class="topbar">
      <div style="display:flex;align-items:center;gap:16px;flex-shrink:0">
        <a href="/" class="topbar-logo">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="5" fill="#0052cc"/>
            <path d="M7 17L12 7l2 4-2 2 5 4H7z" fill="white" opacity="0.9"/>
            <path d="M12 7l5 10H12l-2-4 2-2V7z" fill="white" opacity="0.6"/>
          </svg>
          <span class="topbar-logo-text" id="topbar-logo-text">IssueTracker</span>
        </a>
        <nav class="topbar-nav">
          <button class="topbar-nav-btn" onclick="location.href='/'">
            Projects
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
          </button>
        </nav>
      </div>

      <div class="topbar-center">
        <div class="topbar-search">
          <svg class="topbar-search-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input class="topbar-search-input" type="text" id="topbar-search" placeholder="Search issues…" autocomplete="off" />
          <div class="search-results" id="search-results"></div>
        </div>
      </div>

      <div class="topbar-right">
        <div class="dropdown">
          <button class="btn btn-primary" id="create-btn" onclick="toggleDropdown(document.getElementById('create-menu'))">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            Create
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

        <button class="topbar-icon-btn" onclick="location.href='/settings.html'" title="Settings">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        </button>

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
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/></svg>
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
    { href: `/project.html?id=${pid}&view=issues`,  icon: 'list',    label: 'Issues',          match: 'issues' },
    { href: `/project.html?id=${pid}&view=backlog`, icon: 'layers',  label: 'Backlog',         match: 'backlog' },
    { href: `/project.html?id=${pid}&view=bugs`,    icon: 'bug',     label: 'Bug Reports',     match: 'bugs' },
    { href: `/reports.html?id=${pid}`,              icon: 'chart',   label: 'Reports',         match: 'reports' },
    { href: `/project.html?id=${pid}&view=settings`,icon: 'settings',label: 'Project Settings',match: 'settings' },
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
    <aside class="sidebar">
      <div class="sidebar-project-header">
        ${projectIcon(project, 30)}
        <div style="min-width:0">
          <div class="sidebar-project-name">${esc(project.name)}</div>
          <div class="sidebar-project-key">${esc(project.key)}</div>
        </div>
      </div>
      <nav class="sidebar-nav">
        <div class="sidebar-section-label">Planning</div>
        ${links.slice(0,3).map(l => `<a href="${l.href}" class="sidebar-link${activePage===l.match?' active':''}">${svgIcon(l.icon)} ${l.label}</a>`).join('')}
        <div class="sidebar-section-label">Reports</div>
        ${svgIcon('chart') /* reports link */}
        <a href="${links[3].href}" class="sidebar-link${activePage==='reports'?' active':''}">${svgIcon('chart')} Reports</a>
        <div class="sidebar-section-label">Project</div>
        <a href="${links[4].href}" class="sidebar-link${activePage==='settings'?' active':''}">${svgIcon('settings')} Project Settings</a>
      </nav>
    </aside>`
}

function injectShell(opts = {}) {
  const root = document.getElementById('app-root')
  if (!root) return

  const topbar  = buildTopbarHTML()
  const sidebar = opts.project ? buildProjectSidebarHTML(opts.project, opts.activePage || '') : ''
  const contentId = opts.contentId || 'page-content'

  root.innerHTML = `
    <div class="app-shell">
      ${topbar}
      <div class="app-body">
        ${sidebar}
        <main class="page-content" id="${contentId}"></main>
      </div>
    </div>
    <div id="env-corner" class="env-corner"></div>
    ${globalModalsHTML()}
  `
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
              <textarea class="form-control" id="ci-desc" rows="4" placeholder="Describe the issue in detail…"></textarea>
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
                <label class="form-label">Story Points</label>
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
