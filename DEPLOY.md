# Инструкция по деплою с автоматическим CI/CD

Эта инструкция поможет настроить автоматический деплой бота на VPS при каждом пуше в `main` ветку.

## 📋 Что нужно

1. **VPS сервер** (например, Timeweb, Beget, DigitalOcean, Hetzner)
2. **GitHub репозиторий** с этим проектом
3. **Домен** (опционально, но удобно)

---

## 🚀 Шаг 1: Подготовка сервера

### 1.1 Подключитесь к серверу

```bash
ssh root@your-server-ip
```

### 1.2 Обновите систему

```bash
apt update && apt upgrade -y
```

### 1.3 Установите Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs
```

Проверьте:
```bash
node -v  # Должно быть v18.x.x
npm -v
```

### 1.4 Установите PM2

```bash
npm install -g pm2
```

### 1.5 Установите Git

```bash
apt-get install git -y
```

### 1.6 Создайте пользователя для бота (рекомендуется)

```bash
adduser botuser
usermod -aG sudo botuser
su - botuser
```

---

## 🔑 Шаг 2: Настройка SSH ключей

### 2.1 Создайте SSH ключ на вашем локальном компьютере

```bash
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_deploy
```

Это создаст два файла:
- `~/.ssh/github_deploy` (приватный ключ) - для GitHub
- `~/.ssh/github_deploy.pub` (публичный ключ) - для сервера

### 2.2 Скопируйте публичный ключ на сервер

```bash
ssh-copy-id -i ~/.ssh/github_deploy.pub botuser@your-server-ip
```

Или вручную:
```bash
# На сервере
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
# Вставьте содержимое файла github_deploy.pub
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 2.3 Проверьте подключение

```bash
ssh -i ~/.ssh/github_deploy botuser@your-server-ip
```

---

## 📦 Шаг 3: Первоначальная настройка бота на сервере

### 3.1 Склонируйте репозиторий

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git english-bot
cd english-bot
```

### 3.2 Создайте .env файл

```bash
nano .env
```

Вставьте:
```env
BOT_TOKEN=your_bot_token
CHANNEL_ID=@yourchannel
CHANNEL_LINK=https://t.me/yourchannel
SUPPORT_CONTACT=@support
COURSE_LINK=https://example.com/course
ADMIN_IDS=123456789
```

Сохраните: `Ctrl+X`, `Y`, `Enter`

### 3.3 Установите зависимости и соберите проект

```bash
npm install
npm run build
```

### 3.4 Запустите бота с PM2

```bash
pm2 start dist/bot.js --name english-bot
pm2 save
pm2 startup
```

Выполните команду, которую покажет `pm2 startup`.

### 3.5 Сделайте deploy.sh исполняемым

```bash
chmod +x deploy.sh
```

---

## 🔧 Шаг 4: Настройка GitHub Secrets

### 4.1 Откройте настройки репозитория на GitHub

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

### 4.2 Добавьте следующие секреты:

| Название | Значение | Описание |
|----------|----------|----------|
| `SERVER_HOST` | `123.45.67.89` | IP адрес вашего сервера |
| `SERVER_USER` | `botuser` | Имя пользователя на сервере |
| `SERVER_PORT` | `22` | SSH порт (обычно 22) |
| `SSH_PRIVATE_KEY` | Содержимое `~/.ssh/github_deploy` | Приватный SSH ключ |

**Как получить приватный ключ:**
```bash
cat ~/.ssh/github_deploy
```

Скопируйте **ВСЁ** от `-----BEGIN OPENSSH PRIVATE KEY-----` до `-----END OPENSSH PRIVATE KEY-----` включительно.

---

## ✅ Шаг 5: Проверка работы

### 5.1 Сделайте тестовый коммит

```bash
git add .
git commit -m "Test auto deploy"
git push origin main
```

### 5.2 Проверьте статус в GitHub

`Actions` → Должен запуститься workflow `Deploy Bot`

### 5.3 Проверьте на сервере

```bash
ssh botuser@your-server-ip
pm2 status
pm2 logs english-bot
```

---

## 🛠 Полезные команды

### На сервере:

```bash
# Статус бота
pm2 status

# Логи в реальном времени
pm2 logs english-bot

# Перезапуск
pm2 restart english-bot

# Остановка
pm2 stop english-bot

# Удаление из PM2
pm2 delete english-bot

# Ручной деплой
cd ~/english-bot && ./deploy.sh
```

### Локально:

```bash
# Проверить статус workflow
gh run list

# Посмотреть логи последнего запуска
gh run view

# Запустить workflow вручную
gh workflow run deploy.yml
```

---

## 🔍 Troubleshooting

### Проблема: "Permission denied (publickey)"

**Решение:**
```bash
# На сервере проверьте права
ls -la ~/.ssh
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys

# Проверьте содержимое
cat ~/.ssh/authorized_keys
```

### Проблема: Бот не запускается после деплоя

**Решение:**
```bash
# Проверьте логи
pm2 logs english-bot --lines 50

# Проверьте .env файл
cat ~/english-bot/.env

# Проверьте зависимости
cd ~/english-bot
npm ci
npm run build
```

### Проблема: GitHub Actions падает с ошибкой

**Решение:**
- Проверьте все секреты в настройках репозитория
- Убедитесь, что путь `~/english-bot` существует на сервере
- Проверьте логи в разделе Actions на GitHub

---

## 🔐 Безопасность

### Рекомендации:

1. **Используйте SSH ключи** вместо паролей
2. **Отключите вход по паролю:**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Установите: PasswordAuthentication no
   sudo systemctl restart sshd
   ```

3. **Настройте файрвол:**
   ```bash
   ufw allow 22/tcp
   ufw enable
   ```

4. **Регулярно обновляйте систему:**
   ```bash
   apt update && apt upgrade -y
   ```

5. **Не коммитьте .env в git** (он уже в .gitignore)

---

## 🎯 Альтернативные варианты деплоя

### Railway (проще всего)

1. Зайдите на [railway.app](https://railway.app)
2. Подключите GitHub репозиторий
3. Добавьте переменные окружения
4. Railway автоматически деплоит при каждом пуше

### Heroku + GitHub

Добавьте в настройках Heroku:
`Deploy` → `GitHub` → Подключите репозиторий → Включите `Automatic deploys`

### Docker + Watchtower (авто-обновление)

```bash
# На сервере
docker run -d \
  --name watchtower \
  -v /var/run/docker.sock:/var/run/docker.sock \
  containrrr/watchtower \
  --interval 300
```

---

## 📊 Мониторинг

### Установите мониторинг PM2:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Настройте уведомления в Telegram:

Добавьте в `src/bot.ts`:

```typescript
process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await bot.sendMessage(YOUR_ADMIN_ID, `❌ Бот упал!\n\n${error.message}`);
  process.exit(1);
});
```

---

## ✨ Готово!

Теперь при каждом `git push origin main` бот автоматически обновится на сервере! 🎉

**Workflow:**
1. Пишете код локально
2. `git push origin main`
3. GitHub Actions автоматически деплоит на сервер
4. PM2 перезапускает бота
5. Готово! ✅
