#!/usr/bin/env bash
# ForgeTrack — LXC Install Script

set -euo pipefail

export LANG=C LC_ALL=C DEBIAN_FRONTEND=noninteractive

GN=$(echo "\033[1;92m"); RD=$(echo "\033[01;31m"); YW=$(echo "\033[33m"); CL=$(echo "\033[m")
msg_info()  { echo -e "  💡  ${YW}${1}...${CL}"; }
msg_ok()    { echo -e "  ✓   ${GN}${1}${CL}"; }
msg_error() { echo -e "  ✖   ${RD}${1}${CL}"; exit 1; }

# ── 1. OS update ──────────────────────────────────────────────────────────────
msg_info "Updating OS packages"
apt-get update -qq && apt-get upgrade -y -qq 2>&1 | tail -3
msg_ok "OS packages updated"

# ── 2. Base deps ──────────────────────────────────────────────────────────────
msg_info "Installing base dependencies"
apt-get install -y -qq curl git gnupg ca-certificates openssl
msg_ok "Base dependencies ready"

# ── 3. Node.js 20 ─────────────────────────────────────────────────────────────
msg_info "Installing Node.js 20"
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update -qq && apt-get install -y -qq nodejs
msg_ok "Node.js $(node --version) / npm $(npm --version) installed"

# ── 4. PostgreSQL ─────────────────────────────────────────────────────────────
msg_info "Installing PostgreSQL"
apt-get install -y -qq postgresql postgresql-client 2>&1 | tail -3
systemctl enable postgresql --now
for i in $(seq 1 15); do
  pg_isready -q && break || sleep 1
  [[ $i -eq 15 ]] && msg_error "PostgreSQL did not start in time"
done
msg_ok "PostgreSQL running"

# ── 5. Create DB and user ─────────────────────────────────────────────────────
msg_info "Creating database"
DB_PASS=$(openssl rand -hex 24)
su -s /bin/sh -c "psql -q" postgres 2>/dev/null << SQL
CREATE USER forgetrack WITH PASSWORD '${DB_PASS}';
CREATE DATABASE forgetrack OWNER forgetrack;
SQL
msg_ok "Database 'forgetrack' created"

# ── 6. Clone repo ─────────────────────────────────────────────────────────────
msg_info "Cloning ForgeTrack"
rm -rf /opt/forgetrack
git clone --branch develop --single-branch --quiet \
  https://github.com/loucas781/ForgeTrack.git /opt/forgetrack 2>/dev/null
msg_ok "ForgeTrack cloned"

# ── 7. npm install ────────────────────────────────────────────────────────────
msg_info "Updating npm to latest"
HOME=/root npm install -g npm --cache /tmp/npm-cache --unsafe-perm --no-audit --no-fund --silent 2>&1 || true
msg_ok "npm $(npm --version) ready"

msg_info "Installing Node.js dependencies"
cd /opt/forgetrack
mkdir -p /tmp/npm-cache /tmp/npm-tmp
chmod 777 /tmp/npm-cache /tmp/npm-tmp

HOME=/root npm install \
  --omit=dev \
  --cache /tmp/npm-cache \
  --unsafe-perm \
  --no-audit \
  --no-fund \
  2>&1 || msg_error "npm install failed — see output above"
msg_ok "Node.js dependencies installed"

# ── 8. Write .env ─────────────────────────────────────────────────────────────
msg_info "Writing configuration"
JWT_SECRET=$(openssl rand -hex 48)
cat > /opt/forgetrack/.env.development << ENVEOF
NODE_ENV=development
PORT=3000
APP_NAME=ForgeTrack
APP_ENV=development
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=postgresql://forgetrack:${DB_PASS}@localhost:5432/forgetrack
COOKIE_SECURE=false
TRUST_PROXY=false
COOKIE_MAX_AGE_HOURS=72
ENVEOF
msg_ok "Configuration written"

# ── 9. DB migration ───────────────────────────────────────────────────────────
msg_info "Running database migration"
cd /opt/forgetrack && HOME=/root NODE_ENV=development node server/db/migrate.js \
  || msg_error "Database migration failed"
msg_ok "Database schema ready"

# ── 10. systemd service ───────────────────────────────────────────────────────
msg_info "Creating ForgeTrack service"
cat > /etc/systemd/system/forgetrack.service << SVCEOF
[Unit]
Description=ForgeTrack Issue Tracker
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
WorkingDirectory=/opt/forgetrack
Environment=NODE_ENV=development
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF
systemctl daemon-reload
systemctl enable forgetrack --now
msg_ok "ForgeTrack service started"

# ── 11. Update helper ─────────────────────────────────────────────────────────
cat > /opt/forgetrack/update.sh << 'UPDATEEOF'
#!/usr/bin/env bash
set -e; cd /opt/forgetrack
git pull origin develop
mkdir -p /tmp/npm-cache
HOME=/root npm install --omit=dev --cache /tmp/npm-cache --unsafe-perm --no-audit --no-fund
HOME=/root NODE_ENV=development node server/db/migrate.js
systemctl restart forgetrack
echo "Done — ForgeTrack running at http://localhost:3000"
UPDATEEOF
chmod +x /opt/forgetrack/update.sh

echo ""
msg_ok "ForgeTrack installation complete — running at http://localhost:3000"
