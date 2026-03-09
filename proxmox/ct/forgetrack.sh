#!/usr/bin/env bash
source <(curl -fsSL https://raw.githubusercontent.com/community-scripts/ProxmoxVE/main/misc/build.func)
# Copyright (c) 2021-2026 community-scripts ORG
# Author: ForgeTrack
# License: MIT
# Source: https://github.com/loucas781/ForgeTrack

# Override header_info so the banner says "ForgeTrack" instead of
# "Proxmox Helper Scripts" — must be redefined after sourcing build.func
function header_info() {
  clear
  cat <<"BANNER"
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

# Point build.func at our own install script instead of the community-scripts repo
INSTALL_URL="https://raw.githubusercontent.com/loucas781/ForgeTrack/develop/proxmox/install/forgetrack-install.sh"

start
build_container
description

msg_ok "Completed Successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW} Access ForgeTrack at:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:3000${CL}"
echo -e "${INFO}${YW} First time? Create your account at:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:3000/signup.html${CL}"
