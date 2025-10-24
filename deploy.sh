#!/bin/bash

# Скрипт для ручного деплоя на сервер

set -e  # Остановка при ошибке

echo "🚀 Starting deployment..."

# Переход в директорию проекта
cd ~/english-bot

# Обновление кода
echo "📥 Pulling latest changes..."
git pull origin main

# Установка зависимостей
echo "📦 Installing dependencies..."
npm ci --only=production

# Сборка проекта
echo "🔨 Building project..."
npm run build

# Перезапуск бота
echo "🔄 Restarting bot..."
if pm2 list | grep -q "english-bot"; then
    pm2 restart english-bot
else
    pm2 start dist/bot.js --name english-bot
fi

pm2 save

echo "✅ Deployment completed successfully!"
echo "📊 Bot status:"
pm2 status english-bot
