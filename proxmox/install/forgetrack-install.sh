#!/usr/bin/env bash
# ForgeTrack install script
# Runs inside the LXC container via: pct exec $CTID -- bash -c "$(curl ...)"
# Self-contained — no dependency on FUNCTIONS_FILE_PATH or community-scripts helpers

set -euo pipefail

# ── Colour helpers (mirrors community-scripts style) ─────────────────────────
YW=$(echo "\033[33m")
GN=$(echo "\033[1;92m")
RD=$(echo "\033[01;31m")
CL=$(echo "\033[m")
CM="${GN}✓${CL}"
CROSS="${RD}✗${CL}"
INFO="💡"

msg_info()  { echo -e " ${INFO}  ${YW}${1}...${CL}"; }
msg_ok()    { echo -e " ${CM}  ${GN}${1}${CL}"; }
msg_error() { echo -e " ${CROSS}  ${RD}${1}${CL}"; exit 1; }

# ── 1. Update OS ──────────────────────────────────────────────────────────────
msg_info "Updating OS packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
msg_ok "OS packages updated"

# ── 2. Install base dependencies ──────────────────────────────────────────────
msg_info "Installing dependencies"
apt-get install -y -qq \
  curl \
  git \
  ca-certificates \
  gnupg
msg_ok "Installed dependencies"

# ── 3. Node.js 20 ─────────────────────────────────────────────────────────────
msg_info "Setting up Node.js 20 repository"
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update -qq
apt-get install -y -qq nodejs
msg_ok "Installed Node.js $(node --version)"

# ── 4. Clone ForgeTrack ───────────────────────────────────────────────────────
msg_info "Cloning ForgeTrack (develop branch)"
git clone \
  --branch develop \
  --single-branch \
  https://github.com/loucas781/ForgeTrack.git \
  /opt/forgetrack 2>&1 | grep -v "^$" || true
msg_ok "Cloned ForgeTrack"

# ── 5. Install Node dependencies ──────────────────────────────────────────────
msg_info "Installing Node.js dependencies"
cd /opt/forgetrack
npm ci --omit=dev --silent
msg_ok "Installed Node.js dependencies"

# ── 6. Generate JWT secret ────────────────────────────────────────────────────
msg_info "Generating JWT secret"
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
msg_ok "Generated JWT secret"

# ── 7. Write environment config ───────────────────────────────────────────────
msg_info "Writing environment configuration"
mkdir -p /opt/forgetrack/data
cat > /opt/forgetrack/.env.development <<ENVEOF
NODE_ENV=development
PORT=3000
APP_NAME=ForgeTrack
APP_ENV=development
JWT_SECRET=${JWT_SECRET}
DB_PATH=/opt/forgetrack/data/forgetrack.db
COOKIE_SECURE=false
COOKIE_MAX_AGE_HOURS=72
ENVEOF
msg_ok "Wrote environment configuration"

# ── 8. Run DB migration ───────────────────────────────────────────────────────
msg_info "Running database migration"
cd /opt/forgetrack
NODE_ENV=development node server/db/migrate.js
msg_ok "Database initialised"

# ── 9. Create systemd service ─────────────────────────────────────────────────
msg_info "Creating systemd service"
cat > /etc/systemd/system/forgetrack.service <<SVCEOF
[Unit]
Description=ForgeTrack Issue Tracker
Documentation=https://github.com/loucas781/ForgeTrack
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/forgetrack
Environment=NODE_ENV=development
ExecStart=/usr/bin/node /opt/forgetrack/server/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=forgetrack

[Install]
WantedBy=multi-user.target
SVCEOF
systemctl daemon-reload
systemctl enable -q forgetrack
systemctl start forgetrack
msg_ok "ForgeTrack service started"

# ── 10. Write update helper ───────────────────────────────────────────────────
msg_info "Writing update helper"
cat > /opt/forgetrack/update.sh <<'UPDATEEOF'
#!/usr/bin/env bash
set -e
echo "Pulling latest from develop..."
cd /opt/forgetrack
git pull origin develop
echo "Installing dependencies..."
npm ci --omit=dev --silent
echo "Running database migration..."
NODE_ENV=development node server/db/migrate.js
echo "Restarting service..."
systemctl restart forgetrack
echo "Done — ForgeTrack is running at http://localhost:3000"
UPDATEEOF
chmod +x /opt/forgetrack/update.sh
msg_ok "Created update script at /opt/forgetrack/update.sh"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
msg_ok "ForgeTrack installation complete!"
