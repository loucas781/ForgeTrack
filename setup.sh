#!/bin/bash
# ForgeTrack — Server Bootstrap Script
# Run as root on each fresh Ubuntu 22.04 LXC container
# Usage: bash setup.sh [develop|staging|production]

set -e

ENV=${1:-develop}

if [[ "$ENV" != "develop" && "$ENV" != "staging" && "$ENV" != "production" ]]; then
  echo "Usage: bash setup.sh [develop|staging|production]"
  exit 1
fi

echo ""
echo "=========================================="
echo " ForgeTrack — Setting up: $ENV"
echo "=========================================="
echo ""

# ── System updates ─────────────────────────────────────────────────
echo "[1/6] Updating system..."
apt update -qq && apt upgrade -y -qq
apt install -y -qq curl nginx git ufw

# ── Node.js 20 ─────────────────────────────────────────────────────
echo "[2/6] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
apt install -y -qq nodejs
echo "      Node: $(node --version)  npm: $(npm --version)"

# ── PM2 ────────────────────────────────────────────────────────────
echo "[3/6] Installing PM2..."
npm install -g pm2 --quiet
echo "      PM2: $(pm2 --version)"

# ── Deploy user ────────────────────────────────────────────────────
echo "[4/6] Creating deploy user..."
if id "deploy" &>/dev/null; then
  echo "      deploy user already exists, skipping"
else
  useradd -m -s /bin/bash deploy
  echo "      deploy user created"
fi

# SSH directory for GitHub Actions
mkdir -p /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh

echo ""
echo "  !! ACTION REQUIRED:"
echo "  Paste your GitHub Actions public SSH key into:"
echo "  /home/deploy/.ssh/authorized_keys"
echo ""

# ── App directory ──────────────────────────────────────────────────
echo "[5/6] Creating app directory..."
mkdir -p /var/www/forgetrack
chown deploy:deploy /var/www/forgetrack

# ── Nginx ─────────────────────────────────────────────────────────
echo "[6/6] Configuring Nginx..."

# Pick port based on env (all run on 3000 inside container, nginx proxies)
cat > /etc/nginx/sites-available/forgetrack << NGINX
server {
    listen 80 default_server;
    server_name _;

    # Increase timeout for slow connections over VPN
    proxy_read_timeout 60s;
    proxy_connect_timeout 60s;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGINX

# Enable site
ln -sf /etc/nginx/sites-available/forgetrack /etc/nginx/sites-enabled/forgetrack
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx

# ── Firewall (allow SSH + HTTP) ────────────────────────────────────
ufw allow OpenSSH > /dev/null
ufw allow 'Nginx HTTP' > /dev/null
ufw --force enable > /dev/null

# ── PM2 startup ────────────────────────────────────────────────────
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u deploy --hp /home/deploy > /dev/null
echo ""
echo "=========================================="
echo " Setup complete!"
echo "=========================================="
echo ""
echo " Next steps:"
echo " 1. Add your GitHub Actions SSH key to /home/deploy/.ssh/authorized_keys"
echo " 2. Clone and start the app:"
echo ""
echo "    su - deploy"
echo "    cd /var/www/forgetrack"
echo "    git clone https://github.com/YOUR_USERNAME/forgetrack.git ."
echo "    git checkout $ENV   # (or 'main' for production)"
echo "    npm ci --omit=dev"
echo "    mkdir -p data"
echo "    NODE_ENV=$ENV node server/db/migrate.js"
echo "    pm2 start server/index.js --name forgetrack --env $ENV"
echo "    pm2 save"
echo ""
echo " 3. Visit http://$(hostname -I | awk '{print $1}')"
echo ""
