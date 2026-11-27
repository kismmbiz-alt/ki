#!/usr/bin/env bash
# Обновление CRM до последней версии из GitHub. Запуск от root: bash /opt/crm/deploy/update.sh
set -euo pipefail
APP_DIR=/opt/crm
APP_USER=crm

[ "$(id -u)" = 0 ] || { echo "Запустите от root: sudo bash update.sh"; exit 1; }

# копия базы перед обновлением
su postgres -c "pg_dump -Fc crm > /var/backups/crm/crm-before-update-$(date +%F-%H%M).dump"

git -C "$APP_DIR" pull --ff-only
chown -R "$APP_USER": "$APP_DIR"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && HOME=/home/$APP_USER npm ci --no-audit --no-fund && npx prisma migrate deploy && npm run build"
systemctl restart crm
echo "Обновлено до $(git -C "$APP_DIR" log -1 --format='%h %s')"
