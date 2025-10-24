# Инструкция по деплою с автоматическим CI/CD (с паролем)

Эта инструкция поможет настроить автоматический деплой бота на VPS при каждом пуше в `main` ветку, используя **пароль** для подключения.

## 📋 Что нужно

1. **VPS сервер** (например, Timeweb, Beget, DigitalOcean, Hetzner)
2. **GitHub репозиторий** с этим проектом
3. **Доступ по SSH с паролем**

---

## 🚀 Шаг 1: Подготовка сервера

### 1.1 Подключитесь к серверу

```bash
ssh root@your-server-ip
# Введите пароль
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

### 1.6 (Опционально) Создайте отдельного пользователя для бота

```bash
adduser botuser
# Введите пароль для botuser
usermod -aG sudo botuser
su - botuser
```

**Если создали `botuser`** - используйте его для всех дальнейших команд. Если нет - работайте от `root`.

---

## 📦 Шаг 2: Первоначальная настройка бота на сервере

### 2.1 Настройте Git (если ещё не настроен)

```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

### 2.2 Склонируйте репозиторий

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git english-bot
cd english-bot
```

**Если репозиторий приватный:**
```bash
# Вариант 1: Personal Access Token
git clone https://YOUR_TOKEN@github.com/YOUR_USERNAME/YOUR_REPO.git english-bot

# Вариант 2: Настройте SSH ключ на сервере
ssh-keygen -t ed25519
cat ~/.ssh/id_ed25519.pub
# Добавьте ключ в GitHub Settings → SSH keys
```

### 2.3 Создайте .env файл

```bash
nano .env
```

Вставьте:
```env
BOT_TOKEN=your_bot_token_here
CHANNEL_ID=@yourchannel
CHANNEL_LINK=https://t.me/yourchannel
SUPPORT_CONTACT=@support
COURSE_LINK=https://example.com/course
ADMIN_IDS=123456789
```

Сохраните: `Ctrl+X`, `Y`, `Enter`

### 2.4 Установите зависимости и соберите проект

```bash
npm install
npm run build
```

### 2.5 Запустите бота с PM2

```bash
pm2 start dist/bot.js --name english-bot
pm2 save
pm2 startup
```

Выполните команду, которую покажет `pm2 startup`.

### 2.6 Сделайте deploy.sh исполняемым

```bash
chmod +x deploy.sh
```

### 2.7 Проверьте, что бот работает

```bash
pm2 status
pm2 logs english-bot
```

---

## 🔧 Шаг 3: Настройка GitHub Secrets

### 3.1 Откройте настройки репозитория на GitHub

`Settings` → `Secrets and variables` → `Actions` → `New repository secret`

### 3.2 Добавьте следующие секреты:

| Название | Значение | Пример |
|----------|----------|--------|
| `SERVER_HOST` | IP адрес вашего сервера | `123.45.67.89` |
| `SERVER_USER` | Имя пользователя | `root` или `botuser` |
| `SERVER_PASSWORD` | Пароль от пользователя | `your_password` |
| `SERVER_PORT` | SSH порт (обычно 22) | `22` |

**⚠️ ВАЖНО:**
- Используйте того же пользователя, от которого запустили PM2!
- Если создавали `botuser` - используйте его данные
- Если работаете от `root` - используйте пароль root

---

## ✅ Шаг 4: Проверка автодеплоя

### 4.1 Инициализируйте Git локально (если ещё не сделано)

```bash
cd "c:\Users\mgoda\OneDrive\Рабочий стол\тг бот"
git init
git add .
git commit -m "Initial commit"
```

### 4.2 Подключите GitHub репозиторий

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
```

### 4.3 Сделайте первый пуш

```bash
git push -u origin main
```

### 4.4 Проверьте GitHub Actions

1. Откройте GitHub репозиторий
2. Перейдите во вкладку `Actions`
3. Должен запуститься workflow `Deploy Bot`
4. Дождитесь завершения (обычно 1-2 минуты)

### 4.5 Проверьте на сервере

```bash
ssh root@your-server-ip
pm2 status
pm2 logs english-bot --lines 20
```

---

## 🎯 Workflow теперь работает так:

1. **Вы делаете изменения локально**
   ```bash
   # Редактируете код
   git add .
   git commit -m "Update: добавил новую функцию"
   git push origin main
   ```

2. **GitHub Actions автоматически:**
   - ✅ Подключается к серверу по SSH (через пароль)
   - ✅ Обновляет код (`git pull`)
   - ✅ Устанавливает зависимости
   - ✅ Собирает проект
   - ✅ Перезапускает бота через PM2

3. **Готово!** Бот обновлён на сервере 🎉

---

## 🛠 Полезные команды

### На сервере:

```bash
# Подключиться к серверу
ssh root@your-server-ip

# Статус бота
pm2 status

# Логи в реальном времени
pm2 logs english-bot

# Логи последних 50 строк
pm2 logs english-bot --lines 50

# Перезапуск бота
pm2 restart english-bot

# Остановка бота
pm2 stop english-bot

# Удаление из PM2
pm2 delete english-bot

# Ручной деплой
cd ~/english-bot && ./deploy.sh

# Обновить код вручную
cd ~/english-bot
git pull origin main
npm ci --only=production
npm run build
pm2 restart english-bot
```

### Локально:

```bash
# Проверить статус
git status

# Добавить все изменения
git add .

# Закоммитить
git commit -m "Описание изменений"

# Запушить (автоматический деплой)
git push origin main

# Посмотреть историю
git log --oneline
```

---

## 🔍 Troubleshooting

### ❌ Проблема: "Authentication failed" в GitHub Actions

**Решение:**
1. Проверьте правильность пароля в GitHub Secrets
2. Убедитесь, что используете правильный username
3. Попробуйте подключиться вручную:
   ```bash
   ssh username@your-server-ip
   ```

### ❌ Проблема: "cd ~/english-bot: No such file or directory"

**Решение:**
```bash
# Проверьте путь на сервере
ssh root@your-server-ip
ls -la ~
cd ~/english-bot

# Если директории нет - склонируйте заново
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git english-bot
```

### ❌ Проблема: "pm2: command not found"

**Решение:**
```bash
# Установите PM2 глобально
npm install -g pm2

# Или укажите полный путь в deploy.yml
/usr/local/bin/pm2 restart english-bot
```

### ❌ Проблема: Git требует пароль при `git pull`

**Решение:**

Настройте Personal Access Token:

```bash
# На сервере
cd ~/english-bot
git remote set-url origin https://YOUR_TOKEN@github.com/YOUR_USERNAME/YOUR_REPO.git
```

Как создать токен:
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token → Выберите scope: `repo`
3. Скопируйте токен и используйте вместо `YOUR_TOKEN`

### ❌ Проблема: Бот не запускается после деплоя

**Решение:**
```bash
# Проверьте логи PM2
pm2 logs english-bot --lines 50

# Проверьте .env файл
cat ~/english-bot/.env

# Проверьте ошибки сборки
cd ~/english-bot
npm run build

# Проверьте Node.js версию
node -v  # Должна быть 18+
```

### ❌ Проблема: Permission denied при деплое

**Решение:**
```bash
# На сервере дайте права
chmod +x ~/english-bot/deploy.sh
chown -R $USER:$USER ~/english-bot
```

---

## 🔐 Безопасность

### ⚠️ Рекомендации:

1. **Используйте надёжный пароль** для SSH
2. **Смените стандартный SSH порт:**
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Измените Port 22 на Port 2222
   sudo systemctl restart sshd
   ```
   И обновите `SERVER_PORT` в GitHub Secrets

3. **Настройте файрвол:**
   ```bash
   ufw allow 2222/tcp  # Ваш SSH порт
   ufw enable
   ```

4. **Регулярно обновляйте систему:**
   ```bash
   apt update && apt upgrade -y
   ```

5. **Не коммитьте .env в git** (он уже в .gitignore)

6. **Для продакшена лучше использовать SSH ключи** вместо паролей

---

## 🎯 Альтернативные варианты (без GitHub Actions)

### Railway (проще всего, без сервера)

1. Зайдите на [railway.app](https://railway.app)
2. Подключите GitHub репозиторий
3. Добавьте переменные окружения из `.env`
4. Railway автоматически деплоит при каждом пуше
5. Бесплатно до $5/месяц использования

### Heroku

1. Установите [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)
2. ```bash
   heroku login
   heroku create your-bot-name
   heroku config:set BOT_TOKEN=xxx CHANNEL_ID=xxx
   git push heroku main
   ```
3. Автоматический деплой при пуше

---

## 📊 Мониторинг

### Установите ротацию логов PM2:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### Настройте уведомления об ошибках в Telegram:

Добавьте в `src/bot.ts` свой admin ID:

```typescript
const ADMIN_TELEGRAM_ID = 123456789; // Ваш ID

process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  try {
    await bot.sendMessage(
      ADMIN_TELEGRAM_ID,
      `❌ Бот упал!\n\n${error.message}\n\n${error.stack}`
    );
  } catch (e) {
    console.error('Failed to send error notification:', e);
  }
  process.exit(1);
});
```

---

## ✨ Готово!

Теперь при каждом `git push origin main` бот автоматически обновится на сервере! 🎉

**Ваш workflow:**
1. ✍️ Пишете код локально
2. 📤 `git push origin main`
3. 🤖 GitHub Actions автоматически деплоит
4. 🔄 PM2 перезапускает бота
5. ✅ Готово!

**Полезные ссылки:**
- [GitHub Actions документация](https://docs.github.com/en/actions)
- [PM2 документация](https://pm2.keymetrics.io/)
- [Node Telegram Bot API](https://github.com/yagop/node-telegram-bot-api)
