#!/usr/bin/env bash
# ForgeTrack — LXC Install Script
# Runs inside the container via: pct exec $CTID -- bash -c "$(curl ...)"

set -euo pipefail

YW=$(echo "\033[33m"); GN=$(echo "\033[1;92m"); RD=$(echo "\033[01;31m"); CL=$(echo "\033[m")
CM="${GN}✓${CL}"; CROSS="${RD}✗${CL}"
msg_info()  { echo -e "  💡  ${YW}${1}...${CL}"; }
msg_ok()    { echo -e "  ${CM}  ${GN}${1}${CL}"; }
msg_error() { echo -e "  ${CROSS}  ${RD}${1}${CL}"; exit 1; }

# ── 1. OS update ──────────────────────────────────────────────────────────────
msg_info "Updating OS packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq && apt-get upgrade -y -qq
msg_ok "OS packages updated"

# ── 2. Dependencies ───────────────────────────────────────────────────────────
msg_info "Installing dependencies"
apt-get install -y -qq curl git ca-certificates gnupg
msg_ok "Installed dependencies"

# ── 3. Node.js 20 ─────────────────────────────────────────────────────────────
msg_info "Setting up Node.js 20"
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
apt-get update -qq && apt-get install -y -qq nodejs
msg_ok "Installed Node.js $(node --version)"

# ── 4. PostgreSQL ─────────────────────────────────────────────────────────────
msg_info "Installing PostgreSQL"
apt-get install -y -qq postgresql postgresql-client
systemctl enable postgresql --now
# Wait for postgres to be ready
for i in $(seq 1 10); do
  pg_isready -q && break || sleep 1
done
msg_ok "Installed and started PostgreSQL"

# ── 5. Create DB and user ─────────────────────────────────────────────────────
msg_info "Creating database and user"
DB_PASS=$(openssl rand -hex 24)
sudo -u postgres psql -q << SQL
CREATE USER forgetrack WITH PASSWORD '${DB_PASS}';
CREATE DATABASE forgetrack OWNER forgetrack;
GRANT ALL PRIVILEGES ON DATABASE forgetrack TO forgetrack;
SQL
msg_ok "Created database 'forgetrack'"

# ── 6. Clone repo ─────────────────────────────────────────────────────────────
msg_info "Cloning ForgeTrack (develop branch)"
git clone --branch develop --single-branch --quiet \
  https://github.com/loucas781/ForgeTrack.git /opt/forgetrack
msg_ok "Cloned ForgeTrack"

# ── 7. npm install — set cache to writable path to avoid uid permission issues ─
msg_info "Installing Node.js dependencies"
cd /opt/forgetrack
# Explicitly set npm cache to avoid issues in unprivileged LXC containers
npm ci --omit=dev --cache /tmp/npm-cache
msg_ok "Installed Node.js dependencies"

# ── 8. JWT secret ─────────────────────────────────────────────────────────────
msg_info "Generating secrets"
JWT_SECRET=$(openssl rand -hex 48)
msg_ok "Generated secrets"

# ── 9. Environment file ───────────────────────────────────────────────────────
msg_info "Writing environment configuration"
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
msg_ok "Wrote environment configuration"

# ── 10. Run migration ─────────────────────────────────────────────────────────
msg_info "Running database migration"
cd /opt/forgetrack
NODE_ENV=development node server/db/migrate.js
msg_ok "Database schema ready"

# ── 11. systemd service ───────────────────────────────────────────────────────
msg_info "Creating systemd service"
cat > /etc/systemd/system/forgetrack.service << SVCEOF
[Unit]
Description=ForgeTrack Issue Tracker
After=network.target postgresql.service
Requires=postgresql.service

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
systemctl enable forgetrack --now
msg_ok "ForgeTrack service started"

# ── 12. Update helper ─────────────────────────────────────────────────────────
msg_info "Writing update script"
cat > /opt/forgetrack/update.sh << 'UPDATEEOF'
#!/usr/bin/env bash
set -e
cd /opt/forgetrack
echo "Pulling latest from develop..."
git pull origin develop
echo "Installing dependencies..."
npm ci --omit=dev --cache /tmp/npm-cache
echo "Running database migration..."
NODE_ENV=development node server/db/migrate.js
echo "Restarting service..."
systemctl restart forgetrack
echo "Done — ForgeTrack running at http://localhost:3000"
UPDATEEOF
chmod +x /opt/forgetrack/update.sh
msg_ok "Created update script"

echo ""
msg_ok "ForgeTrack installation complete!"
