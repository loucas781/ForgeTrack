#!/usr/bin/env bash
# Copyright (c) 2021-2026 community-scripts ORG
# Author: ForgeTrack
# License: MIT
# Source: https://github.com/loucas781/ForgeTrack
# Runs inside the LXC container after creation

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing dependencies"
$STD apt-get install -y \
  curl \
  git \
  ca-certificates \
  gnupg
msg_ok "Installed dependencies"

msg_info "Setting up Node.js 20 repository"
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list
$STD apt-get update
$STD apt-get install -y nodejs
msg_ok "Installed Node.js $(node --version)"

msg_info "Cloning ForgeTrack (develop branch)"
$STD git clone \
  --branch develop \
  --single-branch \
  https://github.com/loucas781/ForgeTrack.git \
  /opt/forgetrack
msg_ok "Cloned ForgeTrack"

msg_info "Installing Node.js dependencies"
cd /opt/forgetrack
$STD npm ci --omit=dev
msg_ok "Installed Node.js dependencies"

msg_info "Generating JWT secret"
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
msg_ok "Generated JWT secret"

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

msg_info "Running database migration"
NODE_ENV=development node /opt/forgetrack/server/db/migrate.js
msg_ok "Database initialised"

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
systemctl enable -q --now forgetrack
msg_ok "Created and started ForgeTrack service"

msg_info "Writing update helper"
cat > /opt/forgetrack/update.sh <<'UPDATEEOF'
#!/usr/bin/env bash
set -e
echo "Pulling latest from develop..."
cd /opt/forgetrack
git pull origin develop
echo "Installing dependencies..."
npm ci --omit=dev
echo "Running database migration..."
NODE_ENV=development node server/db/migrate.js
echo "Restarting service..."
systemctl restart forgetrack
echo "Done! ForgeTrack running at http://localhost:3000"
UPDATEEOF
chmod +x /opt/forgetrack/update.sh
msg_ok "Created update script at /opt/forgetrack/update.sh"

motd_ssh
customize
