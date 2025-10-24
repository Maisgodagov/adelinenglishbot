FROM node:18-alpine

WORKDIR /app

# Копируем package файлы
COPY package*.json ./

# Устанавливаем зависимости
RUN npm ci --only=production

# Копируем исходники
COPY . .

# Собираем проект
RUN npm run build

# Запускаем бота
CMD ["node", "dist/bot.js"]
