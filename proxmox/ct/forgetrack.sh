#!/usr/bin/env bash
# ForgeTrack — Proxmox LXC Install Script
# Usage: bash -c "$(curl -fsSL https://raw.githubusercontent.com/loucas781/ForgeTrack/develop/proxmox/ct/forgetrack.sh)"

set -euo pipefail

# ── Colours & icons ───────────────────────────────────────────────────────────
YW=$(echo "\033[33m"); YWB=$(echo "\033[93m"); BL=$(echo "\033[36m")
RD=$(echo "\033[01;31m"); BGN=$(echo "\033[4;92m"); GN=$(echo "\033[1;92m")
DGN=$(echo "\033[32m"); CL=$(echo "\033[m"); BOLD=$(echo "\033[1m")
TAB="  "
CM="${TAB}✔️ ${CL}"; CROSS="${TAB}✖️ ${CL}"; INFO="${TAB}💡${TAB}"
CREATING="${TAB}🚀${TAB}"; GATEWAY="${TAB}🌐${TAB}"

msg_info()  { echo -e " ${INFO}${YW}${1}${CL}"; }
msg_ok()    { echo -e " ${CM}${GN}${1}${CL}"; }
msg_error() { echo -e " ${CROSS}${RD}${1}${CL}"; cleanup_on_error; exit 1; }

# ── Cleanup: stop + destroy container if something goes wrong ─────────────────
CTID_CREATED=""   # set after pct create succeeds so we only clean up if created

cleanup_on_error() {
  if [[ -n "$CTID_CREATED" ]]; then
    echo ""
    echo -e " ${CROSS}${RD}Installation failed — destroying container ${CTID_CREATED} in 60s...${CL}"
    echo -e " ${TAB}${TAB}${YW}(Press Ctrl-C within 60s to keep the container for debugging)${CL}"
    sleep 60
    pct stop "$CTID_CREATED" &>/dev/null || true
    pct destroy "$CTID_CREATED" --purge &>/dev/null || true
    echo -e " ${CM}${GN}Container ${CTID_CREATED} destroyed.${CL}"
  fi
}

# Also catch unexpected exits (set -e triggers, unhandled signals)
trap 'cleanup_on_error' ERR

# ── Timeout watchdog — kills the whole script after 60 minutes ────────────────
# (60s is too short for a full apt+postgres+npm install; 10 min is realistic)
WATCHDOG_TIMEOUT=600   # seconds — adjust if your connection is very slow
(
  sleep $WATCHDOG_TIMEOUT
  echo ""
  echo -e "\033[01;31m  ✖  Timeout: install exceeded ${WATCHDOG_TIMEOUT}s — triggering cleanup\033[m"
  kill -TERM $$ 2>/dev/null
) &
WATCHDOG_PID=$!
# Cancel watchdog on clean exit
trap 'kill $WATCHDOG_PID 2>/dev/null; cleanup_on_error' ERR
trap 'kill $WATCHDOG_PID 2>/dev/null' EXIT

# ── Verify running on Proxmox ─────────────────────────────────────────────────
if ! command -v pct &>/dev/null; then
  echo "This script must be run on a Proxmox VE host."
  exit 1
fi

PVE_VERSION=$(pveversion | grep -oP '(?<=pve-manager/)\S+' || echo "unknown")
PVE_NODE=$(hostname)
INSTALL_URL="https://raw.githubusercontent.com/loucas781/ForgeTrack/develop/proxmox/install/forgetrack-install.sh"

# ── Default settings ──────────────────────────────────────────────────────────
CT_TYPE="1"
DISK_SIZE="8"
CORE_COUNT="2"
RAM_SIZE="1024"
CT_HOSTNAME="forgetrack"
CT_PASSWORD=""
BRIDGE="vmbr0"
NET_TYPE="dhcp"
STATIC_IP=""; STATIC_GW=""; STATIC_CIDR="24"
CTID=$(pvesh get /cluster/nextid 2>/dev/null || echo "100")
TEMPLATE_STORAGE="local"

# Pick the first available rootdir-capable storage as default
STORAGE=$(pvesm status -content rootdir 2>/dev/null | awk 'NR>1 && $2!="dir" || NR>1 {print $1; exit}' || echo "local-lvm")

# ── whiptail helper ───────────────────────────────────────────────────────────
check_whiptail() { command -v whiptail &>/dev/null || apt-get install -y -qq whiptail; }

# ── Build storage menu from live pvesm output ─────────────────────────────────
pick_storage() {
  # Build whiptail menu: "pool_name  type  free_space"
  local menu_items=()
  while read -r name _type _status total used avail _pct; do
    local free_gb=$(( avail / 1024 / 1024 ))
    menu_items+=("$name" "Free: ${free_gb}GB")
  done < <(pvesm status -content rootdir 2>/dev/null | awk 'NR>1')

  if [[ ${#menu_items[@]} -eq 0 ]]; then
    whiptail --backtitle "ForgeTrack Install" --msgbox \
      "No suitable storage pools found.\nCheck Proxmox storage config." 8 50
    exit 1
  fi

  local chosen
  chosen=$(whiptail --backtitle "ForgeTrack Install" --title "STORAGE" \
    --menu "Select storage pool for the container:" 18 60 8 \
    "${menu_items[@]}" 3>&1 1>&2 2>&3) || exit 1
  echo "$chosen"
}

# ── Network config dialog ─────────────────────────────────────────────────────
pick_network() {
  if whiptail --backtitle "ForgeTrack Install" --title "NETWORK TYPE" --yesno \
    "Use DHCP (automatic IP)?\n\nSelect No to configure a static IP." 9 58 3>&1 1>&2 2>&3; then
    NET_TYPE="dhcp"
  else
    NET_TYPE="static"
    STATIC_IP=$(whiptail --backtitle "ForgeTrack Install" \
      --inputbox "Static IP address (e.g. 192.168.1.100)" 8 58 "" \
      --title "STATIC IP" 3>&1 1>&2 2>&3) || exit 1

    STATIC_CIDR=$(whiptail --backtitle "ForgeTrack Install" \
      --inputbox "Subnet prefix length (e.g. 24 for /24)" 8 58 "24" \
      --title "SUBNET" 3>&1 1>&2 2>&3) || exit 1

    STATIC_GW=$(whiptail --backtitle "ForgeTrack Install" \
      --inputbox "Gateway IP (e.g. 192.168.1.1)" 8 58 "" \
      --title "GATEWAY" 3>&1 1>&2 2>&3) || exit 1
  fi
}

# ── Summary printers ──────────────────────────────────────────────────────────
print_net_summary() {
  if [[ "$NET_TYPE" == "dhcp" ]]; then
    echo -e "${TAB}📡${TAB}Network: ${YWB}DHCP${CL}"
  else
    echo -e "${TAB}📡${TAB}Network: ${YWB}Static ${STATIC_IP}/${STATIC_CIDR} via ${STATIC_GW}${CL}"
  fi
}

print_summary() {
  local label="$1"
  echo ""
  echo -e "${TAB}⚙️  ${BOLD}${label} on node ${PVE_NODE}${CL}"
  echo ""
  echo -e " ${INFO}${BL}PVE Version ${PVE_VERSION}${CL}"
  echo -e "${TAB}🆔${TAB}Container ID: ${YWB}${CTID}${CL}"
  echo -e "${TAB}🏠${TAB}Hostname: ${YWB}${CT_HOSTNAME}${CL}"
  echo -e "${TAB}🖥️${TAB}OS: ${YWB}Debian 12${CL}"
  echo -e "${TAB}📦${TAB}Type: ${YWB}$([ "$CT_TYPE" = "1" ] && echo "Unprivileged" || echo "Privileged")${CL}"
  echo -e "${TAB}💾${TAB}Disk: ${YWB}${DISK_SIZE} GB${CL}"
  echo -e "${TAB}🧠${TAB}CPU Cores: ${YWB}${CORE_COUNT}${CL}"
  echo -e "${TAB}🛠️${TAB}RAM: ${YWB}${RAM_SIZE} MiB${CL}"
  echo -e "${TAB}🗄️${TAB}Storage: ${YWB}${STORAGE}${CL}"
  echo -e "${TAB}🌉${TAB}Bridge: ${YWB}${BRIDGE}${CL}"
  print_net_summary
  echo ""
}

# ── Settings flow ─────────────────────────────────────────────────────────────
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

header_info
check_whiptail
echo ""

if whiptail --backtitle "ForgeTrack Install" --title "SETTINGS" --yesno \
  "Use default settings?\n\nDefault: Debian 12, 2 CPU, 1GB RAM, 8GB disk\nStorage: ${STORAGE}, DHCP networking\n\nSelect No to customise." \
  12 60 3>&1 1>&2 2>&3; then
  # Default — still ask network & storage since those are environment-specific
  STORAGE=$(pick_storage)
  pick_network
  print_summary "Default Settings"
else
  # Advanced
  CTID=$(whiptail --backtitle "ForgeTrack Install" --inputbox "Container ID" 8 58 "$CTID" \
    --title "CONTAINER ID" 3>&1 1>&2 2>&3) || exit 1

  CT_HOSTNAME=$(whiptail --backtitle "ForgeTrack Install" --inputbox "Hostname" 8 58 "$CT_HOSTNAME" \
    --title "HOSTNAME" 3>&1 1>&2 2>&3) || exit 1

  DISK_SIZE=$(whiptail --backtitle "ForgeTrack Install" --inputbox "Disk Size (GB)" 8 58 "$DISK_SIZE" \
    --title "DISK SIZE" 3>&1 1>&2 2>&3) || exit 1

  CORE_COUNT=$(whiptail --backtitle "ForgeTrack Install" --inputbox "CPU Cores" 8 58 "$CORE_COUNT" \
    --title "CPU CORES" 3>&1 1>&2 2>&3) || exit 1

  RAM_SIZE=$(whiptail --backtitle "ForgeTrack Install" --inputbox "RAM (MiB)" 8 58 "$RAM_SIZE" \
    --title "RAM SIZE" 3>&1 1>&2 2>&3) || exit 1

  CT_PASSWORD=$(whiptail --backtitle "ForgeTrack Install" \
    --passwordbox "Root password (leave blank for auto-generated)" 8 58 \
    --title "ROOT PASSWORD" 3>&1 1>&2 2>&3) || exit 1

  BRIDGE=$(whiptail --backtitle "ForgeTrack Install" --inputbox "Network Bridge" 8 58 "$BRIDGE" \
    --title "BRIDGE" 3>&1 1>&2 2>&3) || exit 1

  STORAGE=$(pick_storage)
  pick_network

  if whiptail --backtitle "ForgeTrack Install" --title "CONTAINER TYPE" --yesno \
    "Use unprivileged container?\n\n(Recommended — more secure)" 9 58 3>&1 1>&2 2>&3; then
    CT_TYPE="1"
  else
    CT_TYPE="0"
  fi

  print_summary "Advanced Settings"
fi

# ── Confirm ───────────────────────────────────────────────────────────────────
NET_LABEL=$([ "$NET_TYPE" = "dhcp" ] && echo "DHCP" || echo "Static ${STATIC_IP}/${STATIC_CIDR}")
TYPE_LABEL=$([ "$CT_TYPE" = "1" ] && echo "Unprivileged" || echo "Privileged")

if ! whiptail --backtitle "ForgeTrack Install" --title "CONFIRM INSTALL" --yesno \
  "Create ForgeTrack LXC with these settings?\n
ID: ${CTID}         Hostname: ${CT_HOSTNAME}
Type: ${TYPE_LABEL}
OS: Debian 12       Storage: ${STORAGE}
Disk: ${DISK_SIZE}GB   CPU: ${CORE_COUNT}   RAM: ${RAM_SIZE}MiB
Bridge: ${BRIDGE}   Network: ${NET_LABEL}" \
  17 62 3>&1 1>&2 2>&3; then
  echo "Aborted."
  exit 0
fi

echo ""
echo -e " ${CREATING}${GN}${BOLD}Creating ForgeTrack LXC...${CL}"
echo ""

# ── Auto-generate password if blank ──────────────────────────────────────────
[[ -z "$CT_PASSWORD" ]] && CT_PASSWORD=$(openssl rand -base64 12)

# ── Template ──────────────────────────────────────────────────────────────────
msg_info "Checking Debian 12 template"
TEMPLATE_NAME=$(pveam list "$TEMPLATE_STORAGE" 2>/dev/null \
  | grep "debian-12" | sort -t_ -k2 -V | tail -1 | awk '{print $1}')
if [[ -z "$TEMPLATE_NAME" ]]; then
  msg_info "Downloading Debian 12 template"
  pveam update &>/dev/null
  AVAIL=$(pveam available --section system 2>/dev/null \
    | grep "debian-12" | sort -t_ -k3 -V | tail -1 | awk '{print $2}')
  [[ -z "$AVAIL" ]] && msg_error "No Debian 12 template available. Run 'pveam update' manually."
  pveam download "$TEMPLATE_STORAGE" "$AVAIL" &>/dev/null
  TEMPLATE_NAME="${TEMPLATE_STORAGE}:vztmpl/${AVAIL}"
fi
msg_ok "Template ready: ${TEMPLATE_NAME##*:vztmpl/}"

# ── Build net0 string ─────────────────────────────────────────────────────────
if [[ "$NET_TYPE" == "dhcp" ]]; then
  NET0="name=eth0,bridge=${BRIDGE},ip=dhcp,ip6=auto"
else
  NET0="name=eth0,bridge=${BRIDGE},ip=${STATIC_IP}/${STATIC_CIDR},gw=${STATIC_GW}"
fi

# ── Create container ──────────────────────────────────────────────────────────
msg_info "Creating LXC container ${CTID}"
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
  --net0 "$NET0" \
  --nameserver "1.1.1.1 8.8.8.8" \
  --onboot 1 \
  --start 0 \
  --ostype debian &>/dev/null

CTID_CREATED="$CTID"   # arm the cleanup trap now that the container exists
msg_ok "Container ${CTID} created"

# ── Start ─────────────────────────────────────────────────────────────────────
msg_info "Starting container"
pct start "$CTID"
msg_ok "Container started"

# ── Wait for network ──────────────────────────────────────────────────────────
msg_info "Waiting for network connectivity"
for i in $(seq 1 30); do
  if pct exec "$CTID" -- ping -c1 -W1 1.1.1.1 &>/dev/null; then
    msg_ok "Network reachable"
    break
  fi
  [[ $i -eq 30 ]] && msg_error "No network after 30s — check bridge/DHCP config."
  sleep 1
done

# ── Run install script ────────────────────────────────────────────────────────
echo ""
msg_info "Running ForgeTrack install script"
echo ""
pct exec "$CTID" -- bash -c "$(curl -fsSL ${INSTALL_URL})"
echo ""
msg_ok "ForgeTrack installed"

# Disarm cleanup — install succeeded
CTID_CREATED=""

# ── Get IP ────────────────────────────────────────────────────────────────────
sleep 2
if [[ "$NET_TYPE" == "static" ]]; then
  IP="$STATIC_IP"
else
  IP=$(pct exec "$CTID" -- ip -4 a s dev eth0 2>/dev/null \
    | awk '/inet / {print $2}' | cut -d/ -f1 || echo "your-container-ip")
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e " ${CM}${BOLD}${GN}Installation complete!${CL}"
echo ""
echo -e " ${CREATING}${GN}ForgeTrack is ready!${CL}"
echo -e " ${GATEWAY}${BGN}http://${IP}:3000${CL}          (app)"
echo -e " ${GATEWAY}${BGN}http://${IP}:3000/signup.html${CL}  (first-time setup)"
echo ""
echo -e " ${INFO}${YW}Container root password: ${YWB}${CT_PASSWORD}${CL}"
echo -e " ${INFO}${YW}To update ForgeTrack later:${CL}"
echo -e "${TAB}${TAB}${DGN}pct exec ${CTID} -- bash /opt/forgetrack/update.sh${CL}"
echo ""
