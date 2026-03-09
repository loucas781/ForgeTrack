#!/usr/bin/env bash
# ForgeTrack — Proxmox LXC Install Script
# Styled after community-scripts/ProxmoxVE but fully standalone
# Usage: bash -c "$(curl -fsSL https://raw.githubusercontent.com/loucas781/ForgeTrack/develop/proxmox/ct/forgetrack.sh)"

set -euo pipefail

# ── Colours & icons (matching community-scripts style exactly) ────────────────
YW=$(echo "\033[33m")
YWB=$(echo "\033[93m")
BL=$(echo "\033[36m")
RD=$(echo "\033[01;31m")
BGN=$(echo "\033[4;92m")
GN=$(echo "\033[1;92m")
DGN=$(echo "\033[32m")
CL=$(echo "\033[m")
BOLD=$(echo "\033[1m")
TAB="  "
CM="${TAB}✔️${TAB}${CL}"
CROSS="${TAB}✖️${TAB}${CL}"
INFO="${TAB}💡${TAB}${CL}"
CREATING="${TAB}🚀${TAB}"
GATEWAY="${TAB}🌐${TAB}"

msg_info()    { local msg="$1"; echo -ne " ${INFO}${YW}${msg}${CL}"; }
msg_ok()      { local msg="$1"; echo -e "\r${CM}${GN}${msg}${CL}"; }
msg_error()   { local msg="$1"; echo -e "\r${CROSS}${RD}${msg}${CL}"; exit 1; }
msg_detail()  { echo -e "${TAB}${TAB}${DGN}${1}${CL}"; }

header_info() {
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

# ── Verify running on Proxmox ─────────────────────────────────────────────────
if ! command -v pct &>/dev/null; then
  echo "This script must be run on a Proxmox VE host."
  exit 1
fi

PVE_VERSION=$(pveversion | grep -oP '(?<=pve-manager/)\S+' || echo "unknown")
PVE_NODE=$(hostname)

# ── Default settings ──────────────────────────────────────────────────────────
CT_TYPE="1"           # 1=unprivileged 0=privileged
DISK_SIZE="8"
CORE_COUNT="2"
RAM_SIZE="1024"
OS_VERSION="12"
CT_HOSTNAME="forgetrack"
CT_PASSWORD=""
BRIDGE="vmbr0"
NET_TYPE="dhcp"       # dhcp or static
CTID=$(pvesh get /cluster/nextid 2>/dev/null || echo "100")
STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR==2{print $1}' || echo "local-lvm")
TEMPLATE_STORAGE="local"
INSTALL_URL="https://raw.githubusercontent.com/loucas781/ForgeTrack/develop/proxmox/install/forgetrack-install.sh"

# ── whiptail helpers ──────────────────────────────────────────────────────────
function check_whiptail() {
  command -v whiptail &>/dev/null || apt-get install -y -qq whiptail
}

function default_settings() {
  echo ""
  echo -e "${TAB}⚙️  ${BOLD}Using Default Settings on node ${PVE_NODE}${CL}"
  echo ""
  echo -e "${INFO}${BL}PVE Version ${PVE_VERSION}${CL}"
  echo -e "${TAB}🆔${TAB}Container ID: ${YWB}${CTID}${CL}"
  echo -e "${TAB}🖥️${TAB}Operating System: ${YWB}Debian ${OS_VERSION}${CL}"
  echo -e "${TAB}📦${TAB}Container Type: ${YWB}Unprivileged${CL}"
  echo -e "${TAB}💾${TAB}Disk Size: ${YWB}${DISK_SIZE} GB${CL}"
  echo -e "${TAB}🧠${TAB}CPU Cores: ${YWB}${CORE_COUNT}${CL}"
  echo -e "${TAB}🛠️${TAB}RAM Size: ${YWB}${RAM_SIZE} MiB${CL}"
  echo -e "${TAB}🌉${TAB}Bridge: ${YWB}${BRIDGE}${CL}"
  echo -e "${TAB}📡${TAB}Network: ${YWB}DHCP${CL}"
  echo ""
}

function advanced_settings() {
  check_whiptail

  CTID=$(whiptail --backtitle "ForgeTrack Install" --inputbox "Container ID" 8 58 "$CTID" \
    --title "CONTAINER ID" 3>&1 1>&2 2>&3) || exit

  CT_HOSTNAME=$(whiptail --backtitle "ForgeTrack Install" --inputbox "Hostname" 8 58 "$CT_HOSTNAME" \
    --title "HOSTNAME" 3>&1 1>&2 2>&3) || exit

  DISK_SIZE=$(whiptail --backtitle "ForgeTrack Install" --inputbox "Disk Size (GB)" 8 58 "$DISK_SIZE" \
    --title "DISK SIZE" 3>&1 1>&2 2>&3) || exit

  CORE_COUNT=$(whiptail --backtitle "ForgeTrack Install" --inputbox "CPU Cores" 8 58 "$CORE_COUNT" \
    --title "CPU CORES" 3>&1 1>&2 2>&3) || exit

  RAM_SIZE=$(whiptail --backtitle "ForgeTrack Install" --inputbox "RAM (MiB)" 8 58 "$RAM_SIZE" \
    --title "RAM SIZE" 3>&1 1>&2 2>&3) || exit

  CT_PASSWORD=$(whiptail --backtitle "ForgeTrack Install" --passwordbox "Root password (leave blank for auto)" \
    8 58 --title "PASSWORD" 3>&1 1>&2 2>&3) || exit

  BRIDGE=$(whiptail --backtitle "ForgeTrack Install" --inputbox "Network Bridge" 8 58 "$BRIDGE" \
    --title "BRIDGE" 3>&1 1>&2 2>&3) || exit

  STORAGE=$(whiptail --backtitle "ForgeTrack Install" --inputbox "Storage Pool" 8 58 "$STORAGE" \
    --title "STORAGE" 3>&1 1>&2 2>&3) || exit

  if (whiptail --backtitle "ForgeTrack Install" --title "CONTAINER TYPE" --yesno \
    "Use unprivileged container? (recommended)" 8 58); then
    CT_TYPE="1"
  else
    CT_TYPE="0"
  fi

  echo ""
  echo -e "${TAB}🧩  ${BOLD}Using Advanced Settings on node ${PVE_NODE}${CL}"
  echo ""
  echo -e "${TAB}🆔${TAB}Container ID: ${YWB}${CTID}${CL}"
  echo -e "${TAB}🏠${TAB}Hostname: ${YWB}${CT_HOSTNAME}${CL}"
  echo -e "${TAB}🖥️${TAB}OS: ${YWB}Debian ${OS_VERSION}${CL}"
  echo -e "${TAB}📦${TAB}Type: ${YWB}$([ "$CT_TYPE" = "1" ] && echo "Unprivileged" || echo "Privileged")${CL}"
  echo -e "${TAB}💾${TAB}Disk: ${YWB}${DISK_SIZE} GB${CL}"
  echo -e "${TAB}🧠${TAB}Cores: ${YWB}${CORE_COUNT}${CL}"
  echo -e "${TAB}🛠️${TAB}RAM: ${YWB}${RAM_SIZE} MiB${CL}"
  echo -e "${TAB}🌉${TAB}Bridge: ${YWB}${BRIDGE}${CL}"
  echo -e "${TAB}🗄️${TAB}Storage: ${YWB}${STORAGE}${CL}"
  echo ""
}

# ── Ask Default or Advanced ───────────────────────────────────────────────────
header_info
check_whiptail
echo ""

if (whiptail --backtitle "ForgeTrack Install" --title "SETTINGS" --yesno \
  "Use default settings?\n\nDefault: Debian 12, 2 CPU, 1GB RAM, 8GB disk, DHCP\n\nSelect No for custom settings." \
  12 58 3>&1 1>&2 2>&3); then
  default_settings
else
  advanced_settings
fi

# ── Confirm ───────────────────────────────────────────────────────────────────
TYPE_LABEL=$([ "$CT_TYPE" = "1" ] && echo "Unprivileged" || echo "Privileged")
if ! (whiptail --backtitle "ForgeTrack Install" --title "CONFIRM" --yesno \
  "Create ForgeTrack LXC?\n\nID: ${CTID}\nHostname: ${CT_HOSTNAME}\nType: ${TYPE_LABEL}\nOS: Debian ${OS_VERSION}\nDisk: ${DISK_SIZE}GB  CPU: ${CORE_COUNT}  RAM: ${RAM_SIZE}MiB\nStorage: ${STORAGE}\nBridge: ${BRIDGE}" \
  16 58 3>&1 1>&2 2>&3); then
  echo "Aborted."
  exit 0
fi

echo ""
echo -e " ${CREATING}${GN}${BOLD}Creating a ForgeTrack LXC using the above settings${CL}"
echo ""

# ── Generate password if blank ────────────────────────────────────────────────
if [[ -z "$CT_PASSWORD" ]]; then
  CT_PASSWORD=$(openssl rand -base64 12 2>/dev/null || echo "ForgeTrack$(date +%s)")
fi

# ── Validate / find storage ───────────────────────────────────────────────────
if ! pvesm status | grep -q "^${STORAGE}"; then
  STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR==2{print $1}')
  [[ -z "$STORAGE" ]] && msg_error "No valid storage pool found. Check Proxmox storage config."
fi
msg_ok "Storage ${STORAGE} validated"

# ── Download Debian 12 template if needed ─────────────────────────────────────
msg_info "Checking for Debian 12 template"
TEMPLATE_NAME=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null | grep "debian-12" | sort -t_ -k2 -V | tail -1 | awk '{print $1}')
if [[ -z "$TEMPLATE_NAME" ]]; then
  msg_info "Downloading Debian 12 template"
  pveam update &>/dev/null
  AVAIL=$(pveam available --section system 2>/dev/null | grep "debian-12" | sort -t_ -k3 -V | tail -1 | awk '{print $2}')
  [[ -z "$AVAIL" ]] && msg_error "Could not find a Debian 12 template. Run 'pveam update' manually."
  pveam download "$TEMPLATE_STORAGE" "$AVAIL" &>/dev/null
  TEMPLATE_NAME="${TEMPLATE_STORAGE}:vztmpl/${AVAIL}"
fi
msg_ok "Template ${TEMPLATE_NAME##*:vztmpl/} ready"

# ── Create LXC container ──────────────────────────────────────────────────────
msg_info "Creating LXC Container ${CTID}"

FEATURES="nesting=1"
[[ "$CT_TYPE" == "1" ]] && FEATURES="keyctl=1,nesting=1"

pct create "$CTID" "$TEMPLATE_NAME" \
  --hostname "$CT_HOSTNAME" \
  --password "$CT_PASSWORD" \
  --unprivileged "$CT_TYPE" \
  --features "$FEATURES" \
  --cores "$CORE_COUNT" \
  --memory "$RAM_SIZE" \
  --rootfs "${STORAGE}:${DISK_SIZE}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp,ip6=auto" \
  --nameserver "1.1.1.1 8.8.8.8" \
  --onboot 1 \
  --start 0 \
  --ostype debian &>/dev/null

msg_ok "LXC Container ${CTID} created"

# ── Start container ───────────────────────────────────────────────────────────
msg_info "Starting LXC Container"
pct start "$CTID"
msg_ok "Started LXC Container"

# ── Wait for network ──────────────────────────────────────────────────────────
msg_info "Waiting for network"
for i in $(seq 1 30); do
  if pct exec "$CTID" -- ping -c1 -W1 1.1.1.1 &>/dev/null; then
    msg_ok "Network in LXC is reachable"
    break
  fi
  [[ $i -eq 30 ]] && msg_error "No network after 30s. Check bridge and DHCP."
  sleep 1
done

# ── Run install script directly inside container ──────────────────────────────
echo ""
msg_info "Running ForgeTrack install script inside container"
echo ""
pct exec "$CTID" -- bash -c "$(curl -fsSL ${INSTALL_URL})"
echo ""
msg_ok "ForgeTrack installed successfully"

# ── Get IP ────────────────────────────────────────────────────────────────────
sleep 2
IP=$(pct exec "$CTID" -- ip a s dev eth0 2>/dev/null | awk '/inet / {print $2}' | cut -d/ -f1 || echo "your-container-ip")

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e " ${CM}${BOLD}${GN}Completed Successfully!${CL}"
echo ""
echo -e " ${CREATING}${GN}ForgeTrack setup has been successfully initialized!${CL}"
echo -e " ${INFO}${YW}Access ForgeTrack at:${CL}"
echo -e " ${GATEWAY}${BGN}http://${IP}:3000${CL}"
echo -e " ${INFO}${YW}First time? Create your account at:${CL}"
echo -e " ${GATEWAY}${BGN}http://${IP}:3000/signup.html${CL}"
echo ""
echo -e " ${INFO}${YW}Container root password: ${YWB}${CT_PASSWORD}${CL}"
echo -e " ${INFO}${YW}To update ForgeTrack later, run:${CL}"
echo -e " ${TAB}${TAB}${DGN}pct exec ${CTID} -- bash /opt/forgetrack/update.sh${CL}"
echo ""
