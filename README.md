# ForgeTrack

A self-hosted issue tracking application — **vanilla HTML, CSS, and JavaScript** frontend with a **Node.js / Express** backend and **SQLite** database. No build step required.

---

## Features

- Multi-project support with unique issue keys (e.g. `WEB-42`)
- Issue types: Bug, Task, Story, Epic
- Full workflow: To Do → In Progress → In Review → Done → Cancelled
- Priority levels: Critical, High, Medium, Low, Trivial
- Dedicated Bug Reports view per project
- Comments with per-user delete
- Inline editing of issue titles and descriptions
- Filter + search issues by status, type, priority, assignee, keyword
- Reports page with bar charts per project
- User accounts with signup, login, logout, and profile editing
- Avatar colour picker
- Change password (requires current password)
- Environment badges (development/staging/production)
- GitHub Actions CI/CD with per-branch environments

---

## Tech Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | Vanilla HTML, CSS, JavaScript (no framework) |
| Backend   | Node.js + Express |
| Database  | SQLite via `better-sqlite3` |
| Auth      | JWT in HTTP-only cookies + bcrypt passwords |
| CI/CD     | GitHub Actions |

---

## Quick Start

### Prerequisites
- Node.js 18+

### 1. Install dependencies
```bash
npm install
```

### 2. Run the database migration (first time only)
```bash
npm run setup
```

### 3. Start the server
```bash
# Development (loads .env.development, port 3000)
npm run dev

# Or with node directly
node server/index.js
```

Open http://localhost:3000 — you'll be redirected to sign up for the first account.

---

## Configuration

`.env.*` files are **never committed to git** — they contain secrets. The install script generates the correct file automatically on each server.

For local development, copy the example and fill in your values:

```bash
cp .env.example .env.development
# then edit .env.development with your local DB credentials
```

The app loads the env file matching `NODE_ENV`:

| Environment | File loaded | Set by |
|-------------|-------------|--------|
| `development` | `.env.development` | Install script / manual |
| `staging`     | `.env.staging`     | Install script (pass `staging` arg) |
| `production`  | `.env.production`  | Install script (pass `production` arg) |

See `.env.example` in the repo for all available variables and their descriptions.

### Generate a secure JWT secret
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## Git Branch Strategy

| Branch    | Environment | Deployment |
|-----------|-------------|------------|
| `main`    | Production  | Auto-deploy to production server |
| `staging` | Staging     | Auto-deploy to staging server |
| `develop` | Staging     | Auto-deploy to staging server (preview) |
| `feature/*` | —         | CI tests only, no deployment |

### Typical workflow
```bash
# Work on a feature
git checkout -b feature/my-feature

# Test it, then merge to develop for staging preview
git checkout develop
git merge feature/my-feature
git push origin develop   # → deploys to staging

# When ready for production
git checkout main
git merge develop
git push origin main      # → deploys to production
```

---

## Self-Hosting

The app serves its own static files — just run `node server/index.js` and optionally put it behind a reverse proxy.

### With PM2 (recommended for production)
```bash
npm install -g pm2

# Start
NODE_ENV=production pm2 start server/index.js --name forgetrack

# Auto-restart on reboot
pm2 save
pm2 startup
```

### Nginx reverse proxy
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p data
EXPOSE 3000
CMD ["node", "server/index.js"]
```

---

## API Reference

All endpoints require authentication via JWT cookie (set automatically on login).

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET  | `/api/auth/me` | Current user |
| PATCH | `/api/auth/profile` | Update profile / password |

### Projects
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/projects` | List all projects |
| POST   | `/api/projects` | Create project |
| GET    | `/api/projects/:id` | Get project |
| PATCH  | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |

### Issues
| Method | Path | Description |
|--------|------|-------------|
| GET    | `/api/issues?project_id=&status=&type=&priority=&assignee_id=&q=` | List/filter issues |
| POST   | `/api/issues` | Create issue |
| GET    | `/api/issues/:id` | Get issue with comments |
| PATCH  | `/api/issues/:id` | Update issue |
| DELETE | `/api/issues/:id` | Delete issue |
| POST   | `/api/issues/:id/comments` | Add comment |
| DELETE | `/api/issues/:id/comments/:cid` | Delete comment |

### Users
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users` | List all users |

---

## Project Structure

```
forgetrack/
├── server/
│   ├── index.js               # Express entry point
│   ├── db/
│   │   ├── migrate.js         # Schema setup (run once)
│   │   └── connection.js      # SQLite connection singleton
│   ├── middleware/
│   │   └── auth.js            # JWT middleware
│   └── routes/
│       ├── auth.js            # Auth endpoints
│       ├── projects.js        # Projects endpoints
│       ├── issues.js          # Issues + comments endpoints
│       └── users.js           # Users endpoint
├── public/                    # Static frontend (served directly)
│   ├── css/
│   │   ├── main.css           # Full design system
│   │   └── auth.css           # Auth page styles
│   ├── js/
│   │   ├── app.js             # Shared utilities, API helpers
│   │   └── shell.js           # Topbar + sidebar HTML injection
│   ├── index.html             # Dashboard
│   ├── login.html             # Sign in
│   ├── signup.html            # Create account
│   ├── project.html           # Project issues/backlog/bugs/settings
│   ├── issue.html             # Issue detail
│   ├── reports.html           # Project reports
│   ├── profile.html           # User profile
│   └── settings.html          # App settings
├── proxmox/                   # Proxmox VE helper scripts
│   ├── ct/
│   │   └── forgetrack.sh      # Runs on Proxmox host — creates LXC container
│   └── install/
│       └── forgetrack-install.sh  # Runs inside container — installs the app
├── data/                      # SQLite database files (git-ignored)
├── .env.example          # template — copy and fill in, never commit real values
├── .gitignore
├── .github/workflows/deploy.yml
└── package.json
```

---

## Proxmox VE Deployment

ForgeTrack includes a Proxmox helper script that follows the same pattern as [community-scripts/ProxmoxVE](https://community-scripts.github.io/ProxmoxVE/). It creates a Debian 12 LXC container, installs Node.js 20, clones the `develop` branch, and sets up a systemd service — all in one command.

### One-line install

Run this from your **Proxmox host shell**:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/loucas781/ForgeTrack/develop/proxmox/ct/forgetrack.sh)"
```

This presents the standard interactive UI for choosing container settings (ID, hostname, IP, storage, password, etc.) before doing anything.

### Default container settings

| Setting | Value      |
|---------|------------|
| OS      | Debian 12  |
| CPU     | 2 cores    |
| RAM     | 1024 MB    |
| Disk    | 8 GB       |
| Port    | 3000       |

### Updating

Re-run the script on an existing container to pull the latest `develop` branch and restart, or run the update helper inside the container directly:

```bash
# From the Proxmox host
pct exec <CTID> -- bash /opt/forgetrack/update.sh
```

---

## GitHub Actions Setup

To enable automatic deployment, configure these secrets in your GitHub repository (**Settings → Secrets → Actions**):

| Secret | Description |
|--------|-------------|
| `STAGING_HOST` | Staging server IP or hostname |
| `STAGING_USER` | SSH username |
| `STAGING_SSH_KEY` | Private SSH key |
| `PROD_HOST` | Production server IP or hostname |
| `PROD_USER` | SSH username |
| `PROD_SSH_KEY` | Private SSH key |

Then uncomment the deploy steps in `.github/workflows/deploy.yml`.

---

## Versioning

ForgeTrack uses automatic semantic versioning driven by GitHub Actions. You never need to manually update the version — it happens on every push.

| Branch    | What happens | Example version |
|-----------|-------------|-----------------|
| `develop` | Increments build counter | `0.0.1-dev.4` |
| `staging` | Bumps patch number, resets counter | `0.0.2` |
| `main`    | Tags a GitHub Release | `v0.0.2` |

The version is visible in two places in the UI:
- **Topbar** — small `v0.0.1` chip next to the ForgeTrack logo
- **Settings → Application Info** — full version string with build type badge

### How the counter works

- `BUILDCOUNT` — a plain text file in the repo root that the Actions workflow increments on every `develop` push
- `package.json` `version` field — updated automatically by the workflow commit
- Both files are committed back to the branch by `github-actions[bot]` with a `[skip ci]` tag so they don't trigger another run

### Manual version bump

To bump the minor or major version, update `package.json` manually before merging to `staging`:

```bash
# e.g. bump minor: 0.0.x → 0.1.0
npm version minor --no-git-tag-version
git add package.json BUILDCOUNT
git commit -m "chore: bump minor version"
```

---

## License

MIT
