#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: ForgeTrack
# License: MIT
# Source: https://github.com/loucas781/ForgeTrack

# ── Override header so banner says ForgeTrack, not "Proxmox Helper Scripts" ───
function header_info() {
  clear
  cat << "BANNER"
    ███████╗ ██████╗ ██████╗  ██████╗ ███████╗████████╗██████╗  █████╗  ██████╗██╗  ██╗
    ██╔════╝██╔═══██╗██╔══██╗██╔════╝ ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗██╔════╝██║ ██╔╝
    █████╗  ██║   ██║██████╔╝██║  ███╗█████╗     ██║   ██████╔╝███████║██║     █████╔╝ 
    ██╔══╝  ██║   ██║██╔══██╗██║   ██║██╔══╝     ██║   ██╔══██╗██╔══██║██║     ██╔═██╗ 
    ██║     ╚██████╔╝██║  ██║╚██████╔╝███████╗   ██║   ██║  ██║██║  ██║╚██████╗██║  ██╗
    ╚═╝      ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
                                    Install Script
BANNER
}

APP="ForgeTrack"
var_tags="${var_tags:-project-management;issue-tracker}"
var_cpu="${var_cpu:-2}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-8}"
var_os="${var_os:-debian}"
var_version="${var_version:-12}"
var_unprivileged="${var_unprivileged:-1}"

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources
  if [[ ! -d /opt/forgetrack ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi
  msg_info "Pulling latest changes from develop branch"
  cd /opt/forgetrack
  $STD git pull origin develop
  msg_ok "Pulled latest changes"
  msg_info "Installing dependencies"
  $STD npm ci --omit=dev
  msg_ok "Installed dependencies"
  msg_info "Running database migration"
  $STD NODE_ENV=development node server/db/migrate.js
  msg_ok "Database migrated"
  msg_info "Restarting ${APP} service"
  $STD systemctl restart forgetrack
  msg_ok "Restarted ${APP}"
  msg_ok "Updated successfully!"
  exit
}

# ── Create the LXC container using build.func's tooling ───────────────────────
start
build_container

# ── Run our own install script inside the container via pct exec ──────────────
# build.func's build_container would normally fetch install/<app>-install.sh
# from the community-scripts repo (hardcoded) — which 404s for our app.
# Instead we stream our install script directly into the container ourselves.
msg_info "Running ForgeTrack install script inside container"
pct exec "$CTID" -- bash -c "$(curl -fsSL https://raw.githubusercontent.com/loucas781/ForgeTrack/develop/proxmox/install/forgetrack-install.sh)"
msg_ok "ForgeTrack installed inside container"

description

msg_ok "Completed Successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access ForgeTrack at:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:3000${CL}"
echo -e "${INFO}${YW} First time? Create your account at:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:3000/signup.html${CL}"
