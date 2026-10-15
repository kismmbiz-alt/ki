#!/usr/bin/env bash
# Установка CRM на чистый сервер Ubuntu 24.04 (от 1 ГБ памяти).
# Код уже должен быть склонирован в /opt/crm (см. deploy/README.md), затем от root:
#   bash /opt/crm/deploy/install.sh
# Что делает: ставит PostgreSQL, Node.js и Caddy (HTTPS), собирает приложение,
# запускает его как службу и включает ежедневный бэкап базы.
set -euo pipefail

APP_DIR=/opt/crm
APP_USER=crm
NODE_VERSION="${NODE_VERSION:-v22.23.3}"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

[ "$(id -u)" = 0 ] || { echo "Запустите от root: sudo bash install.sh"; exit 1; }

say "1/8 Файл подкачки (нужен для сборки на маленьком сервере)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "2/8 Системные пакеты: PostgreSQL, Caddy, git"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q postgresql caddy git curl ca-certificates xz-utils openssl

say "3/8 Node.js $NODE_VERSION"
if ! command -v node >/dev/null || [ "$(node -v)" != "$NODE_VERSION" ]; then
  curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz -C /usr/local --strip-components=1
  rm /tmp/node.tar.xz
fi
node -v

say "4/8 Пользователь для приложения"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$APP_USER --shell /usr/sbin/nologin "$APP_USER"
chown -R "$APP_USER": "$APP_DIR"
# git запускается от root по папке пользователя crm
git config --global --get-all safe.directory | grep -qx "$APP_DIR" || git config --global --add safe.directory "$APP_DIR"

say "5/8 Код приложения уже в $APP_DIR ($(git -C "$APP_DIR" log -1 --format='%h %s'))"

say "6/8 База данных и настройки"
ENV_FILE=$APP_DIR/.env
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS=$(openssl rand -hex 16)
  INVITE=$(openssl rand -hex 4)
  sudo -u postgres psql -qc "CREATE USER crm WITH PASSWORD '$DB_PASS';"
  sudo -u postgres psql -qc "CREATE DATABASE crm OWNER crm;"
  cat > "$ENV_FILE" <<EOF
DATABASE_URL="postgresql://crm:$DB_PASS@localhost:5432/crm"
REGISTRATION_CODE="$INVITE"
EOF
  chown "$APP_USER": "$ENV_FILE" && chmod 600 "$ENV_FILE"
fi

say "7/8 Сборка (на маленьком сервере может занять 5–10 минут)"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && HOME=/home/$APP_USER npm ci --no-audit --no-fund && npx prisma migrate deploy && npm run build"

say "8/8 Запуск службы, HTTPS и бэкапы"
cat > /etc/systemd/system/crm.service <<EOF
[Unit]
Description=CRM
After=network.target postgresql.service

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node node_modules/next/dist/bin/next start -p 3000 -H 127.0.0.1
Restart=always

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now crm
systemctl restart crm

# Адрес: свой домен из DOMAIN=..., иначе бесплатный адрес вида 1-2-3-4.sslip.io
IP=$(curl -fsS4 https://ifconfig.me || hostname -I | awk '{print $1}')
DOMAIN="${DOMAIN:-${IP//./-}.sslip.io}"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode gzip
	reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy || systemctl restart caddy

mkdir -p /var/backups/crm && chown postgres: /var/backups/crm
cat > /etc/cron.daily/crm-backup <<'EOF'
#!/bin/sh
# Ежедневная копия базы, хранится 14 дней
su postgres -c "pg_dump -Fc crm > /var/backups/crm/crm-$(date +%F).dump"
find /var/backups/crm -name '*.dump' -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/crm-backup

INVITE=$(grep REGISTRATION_CODE "$ENV_FILE" | cut -d'"' -f2)
say "Готово!"
echo "Откройте:              https://$DOMAIN/register"
echo "Код приглашения:       $INVITE"
echo "Обновление программы:  bash $APP_DIR/deploy/update.sh"
