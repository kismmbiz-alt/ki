# Установка CRM на сервер

Нужен сервер с **Ubuntu 24.04**, от 1 ГБ памяти и 10 ГБ диска, расположенный в России.

## 1. Подключиться к серверу

Можно через веб-консоль в панели хостинга или с компьютера командой `ssh root@IP-сервера`.

## 2. Дать серверу доступ к коду

Вставьте в консоль:

```bash
[ -f ~/.ssh/id_ed25519 ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -q; cat ~/.ssh/id_ed25519.pub
```

Скопируйте строку, которая начинается с `ssh-ed25519`. Откройте https://github.com/kismmbiz-alt/ki/settings/keys/new, в поле **Title** напишите `crm-server`, в поле **Key** вставьте строку и нажмите **Add key**. Галочку «Allow write access» ставить не нужно.

## 3. Установить

```bash
apt-get update -q && apt-get install -y -q git && GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new" git clone git@github.com:kismmbiz-alt/ki.git /opt/crm && bash /opt/crm/deploy/install.sh
```

Установка займёт 5–15 минут. В конце появятся адрес CRM и **код приглашения**: он нужен, чтобы зарегистрировать мастерскую.

Пока своего домена нет, адрес будет вида `https://1-2-3-4.sslip.io` (бесплатно, с HTTPS). Когда купите домен, направьте его на IP сервера и повторите установку с ним:
`DOMAIN=crm.example.ru bash /opt/crm/deploy/install.sh`.

## Обновление

```bash
bash /opt/crm/deploy/update.sh
```

Перед каждым обновлением делается копия базы. Ежедневные копии хранятся 14 дней в `/var/backups/crm`.
