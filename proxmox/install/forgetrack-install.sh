#!/usr/bin/env bash
# ForgeTrack — LXC Install Script
# Runs inside the container via: pct exec $CTID -- bash -c "$(curl ...)"

set -euo pipefail

# Suppress locale noise
export LANG=C LC_ALL=C DEBIAN_FRONTEND=noninteractive

GN=$(echo "\033[1;92m"); RD=$(echo "\033[01;31m"); YW=$(echo "\033[33m"); CL=$(echo "\033[m")
msg_info()  { echo -e "  💡  ${YW}${1}...${CL}"; }
msg_ok()    { echo -e "  ✓   ${GN}${1}${CL}"; }
msg_error() { echo -e "  ✖   ${RD}${1}${CL}"; exit 1; }

# ── 1. OS update ──────────────────────────────────────────────────────────────
msg_info "Updating OS packages"
apt-get update -qq && apt-get upgrade -y -qq 2>&1 | tail -3
msg_ok "OS packages updated"

# ── 2. Base deps (curl already present, but ensure git + gnupg) ───────────────
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
msg_ok "Node.js $(node --version) installed"

# ── 4. PostgreSQL ─────────────────────────────────────────────────────────────
msg_info "Installing PostgreSQL"
apt-get install -y -qq postgresql postgresql-client 2>&1 | tail -3
systemctl enable postgresql --now
# Wait up to 15s for postgres to accept connections
for i in $(seq 1 15); do
  pg_isready -q && break || sleep 1
  [[ $i -eq 15 ]] && msg_error "PostgreSQL did not start in time"
done
msg_ok "PostgreSQL $(pg_isready --version | awk '{print $3}') running"

# ── 5. Create DB user and database (running as root — use su, not sudo) ───────
msg_info "Creating database"
DB_PASS=$(openssl rand -hex 24)
su -s /bin/sh postgres -c "psql -q" << SQL
CREATE USER forgetrack WITH PASSWORD '${DB_PASS}';
CREATE DATABASE forgetrack OWNER forgetrack;
SQL
msg_ok "Database 'forgetrack' created"

# ── 6. Clone repo ─────────────────────────────────────────────────────────────
msg_info "Cloning ForgeTrack"
git clone --branch develop --single-branch --quiet \
  https://github.com/loucas781/ForgeTrack.git /opt/forgetrack 2>/dev/null
msg_ok "ForgeTrack cloned to /opt/forgetrack"

# ── 7. npm install ────────────────────────────────────────────────────────────
msg_info "Installing Node.js dependencies"
cd /opt/forgetrack
npm ci --omit=dev --cache /tmp/npm-cache --silent
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
COOKIE_MAX_AGE_HOURS=72
ENVEOF
msg_ok "Configuration written"

# ── 9. Run DB migration ───────────────────────────────────────────────────────
msg_info "Running database migration"
cd /opt/forgetrack && NODE_ENV=development node server/db/migrate.js
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
npm ci --omit=dev --cache /tmp/npm-cache --silent
NODE_ENV=development node server/db/migrate.js
systemctl restart forgetrack
echo "Updated — running at http://localhost:3000"
UPDATEEOF
chmod +x /opt/forgetrack/update.sh

echo ""
msg_ok "ForgeTrack installation complete — running at http://localhost:3000"
