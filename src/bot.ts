import TelegramBot from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';

dotenv.config();

const token = process.env.BOT_TOKEN!;
const channelId = process.env.CHANNEL_ID!; // Формат: @channelname или -100123456789
const supportContact = process.env.SUPPORT_CONTACT || '@support';
const courseLink = process.env.COURSE_LINK || 'https://example.com/course';
const channelLink = process.env.CHANNEL_LINK || 'https://t.me/yourchannel';

// Хранилище для состояний пользователей (в продакшене использовать БД)
interface UserState {
  step: string;
  name?: string;
  phone?: string;
  hasPaid?: boolean;
  lastReminderSent?: number;
}

const userStates = new Map<number, UserState>();

const bot = new TelegramBot(token, { polling: true });

// Клавиатуры
const contactKeyboard = {
  keyboard: [[{ text: 'Оставить контакт ☎️', request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true
};

const subscribeKeyboard = {
  inline_keyboard: [
    [{ text: 'Подписаться на канал 📢', url: channelLink }],
    [{ text: 'Я подписалась ✅', callback_data: 'check_subscription' }]
  ]
};

const startKeyboard = {
  inline_keyboard: [[{ text: 'Начать 🚀', callback_data: 'start_warming' }]]
};

const showExampleKeyboard = {
  inline_keyboard: [[{ text: 'Да, покажи пример 👀', callback_data: 'show_example' }]]
};

const wantDetailsKeyboard = {
  inline_keyboard: [[{ text: '💬 Да, хочу подробнее', callback_data: 'show_product' }]]
};

const paymentKeyboard = {
  inline_keyboard: [[{ text: '💳 Оплатить 1000₽', callback_data: 'payment' }]]
};

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  userStates.set(chatId, { step: 'greeting' });

  await bot.sendMessage(
    chatId,
    '🌟 Привет! Я — Аделина, преподаватель английского для взрослых и детей.\n\n' +
    'Уже более 10 лет помогаю маленьким и взрослым перестать бояться английского, учить слова легко и навсегда 📚\n\n' +
    'Чтобы прислать тебе материалы и полезные советы, нажми кнопку ниже 👇',
    { reply_markup: contactKeyboard }
  );
});

// Обработчик получения контакта
bot.on('contact', async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  const state = userStates.get(chatId);

  if (!state || state.step !== 'greeting') return;

  const firstName = contact?.first_name || msg.from?.first_name || 'друг';

  userStates.set(chatId, {
    step: 'subscription_check',
    name: firstName,
    phone: contact?.phone_number
  });

  await bot.sendMessage(
    chatId,
    `Отлично, ${firstName}! 👏\n\n` +
    'А ты знал(а), что каждый русскоговорящий уже знает английский, просто не догадывается об этом? 😉\n\n' +
    'Подпишись на мой канал — покажу, как заговорить на английском быстрее, чем ты думаешь, и дам кучу полезных разборов.',
    { reply_markup: { remove_keyboard: true } }
  );

  await bot.sendMessage(
    chatId,
    'Подпишись, а потом нажми кнопку ниже 👇',
    { reply_markup: subscribeKeyboard }
  );
});

// Проверка подписки на канал
async function checkSubscription(chatId: number): Promise<boolean> {
  try {
    const member = await bot.getChatMember(channelId, chatId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (error) {
    console.error('Ошибка проверки подписки:', error);
    return false;
  }
}

// Обработчик callback-кнопок
bot.on('callback_query', async (query) => {
  const chatId = query.message!.chat.id;
  const messageId = query.message!.message_id;
  const data = query.data;
  const state = userStates.get(chatId);

  await bot.answerCallbackQuery(query.id);

  switch (data) {
    case 'check_subscription':
      const isSubscribed = await checkSubscription(chatId);

      if (isSubscribed) {
        userStates.set(chatId, { ...state!, step: 'warming' });

        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: messageId }
        );

        await bot.sendMessage(
          chatId,
          'Класс! 🎉 Теперь я покажу тебе, почему большинство людей не могут запомнить слова — и как исправить это с помощью моей авторской системы "Букварь английского".\n\n' +
          'Готов? Начнём с самого главного 💪',
          { reply_markup: startKeyboard }
        );
      } else {
        await bot.sendMessage(
          chatId,
          '❌ Похоже, ты ещё не подписался на канал. Подпишись и нажми кнопку снова 😊',
          { reply_markup: subscribeKeyboard }
        );
      }
      break;

    case 'start_warming':
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      await bot.sendMessage(
        chatId,
        '🤔 *Почему мы учим слова — и забываем их через пару дней?*\n\n' +
        'Потому что мозг не запоминает изолированные слова, ему нужны связи и образы.\n\n' +
        'Я покажу тебе, как мой "Букварь" делает это автоматически:\n\n' +
        '1️⃣ Картинки для лучшей ассоциации\n' +
        '2️⃣ Голосовые кнопки — как твой личный учитель\n' +
        '3️⃣ Задания для каждой буквы — закрепляем знания на практике\n' +
        '4️⃣ Помощник шаг за шагом, который ведёт к результату\n\n' +
        'Хочешь, покажу, как это выглядит внутри?',
        { parse_mode: 'Markdown', reply_markup: showExampleKeyboard }
      );
      break;

    case 'show_example':
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      // Здесь можно отправить фото/видео/аудио из букваря
      await bot.sendMessage(
        chatId,
        '🎯 Маленький лайфхак от меня:\n\n' +
        'Вместо того чтобы учить слово "apple" отдельно, свяжи его с образом и контекстом:\n\n' +
        '🍎 *"I\'m eating an apple"* — и мозг сам запоминает.\n\n' +
        'Именно так устроен мой "Букварь английского" — буквы, слова, картинки, примеры, ассоциации.',
        { parse_mode: 'Markdown' }
      );

      setTimeout(async () => {
        await bot.sendMessage(
          chatId,
          '🎁 *За 30 дней ты выучишь 500–1000 слов, которые реально используются в жизни.*\n\n' +
          'Хочешь получить весь Букварь за 1000₽?',
          { parse_mode: 'Markdown', reply_markup: wantDetailsKeyboard }
        );
      }, 2000);
      break;

    case 'show_product':
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      await bot.sendMessage(
        chatId,
        '🎁 *Мини-курс "Букварь английского от меня" — это:*\n\n' +
        '✅ 30+ аудиоуроков\n' +
        '✅ Разбор каждой буквы с примерами слогов и слов\n' +
        '✅ Аудио-файлы для тренировки произношения\n' +
        '✅ Удобный формат — всё на телефоне\n\n' +
        '💰 *Стоимость — всего 1000₽* (вместо 2900₽).\n\n' +
        'Хочешь начать учить английский уже сегодня?',
        { parse_mode: 'Markdown', reply_markup: paymentKeyboard }
      );

      // Запускаем таймер для дожима через 24-48 часов
      userStates.set(chatId, { ...state!, step: 'offer_shown' });
      scheduleReminder(chatId);
      break;

    case 'payment':
      // Здесь интегрируется платёжная система (YooKassa, Stripe и т.д.)
      await bot.sendMessage(
        chatId,
        '💳 *Для оплаты свяжитесь с администратором:*\n\n' +
        `${supportContact}\n\n` +
        'После оплаты вы сразу получите доступ к курсу! 🎉',
        { parse_mode: 'Markdown' }
      );

      // Имитация успешной оплаты (в реальности нужна интеграция с платёжкой)
      // После реальной оплаты вызвать функцию: await handleSuccessfulPayment(chatId);
      break;
  }
});

// Функция обработки успешной оплаты
async function handleSuccessfulPayment(chatId: number) {
  const state = userStates.get(chatId);

  userStates.set(chatId, { ...state!, hasPaid: true, step: 'paid' });

  await bot.sendMessage(
    chatId,
    '🎉 *Отлично, оплата прошла успешно!*\n\n' +
    `Вот твой доступ к "Букварю английского":\n${courseLink}\n\n` +
    'Начни с 1-го дня — и уже через неделю почувствуешь, что запоминаешь слова легко. 📚\n\n' +
    'А также, заходи в мой канал и делись в комментариях, сколько слов удалось запомнить и выучить! 😌\n\n' +
    `Если что-то не работает, пиши в поддержку: ${supportContact}`,
    { parse_mode: 'Markdown' }
  );
}

// Напоминание через 24-48 часов
function scheduleReminder(chatId: number) {
  const delay = 24 * 60 * 60 * 1000; // 24 часа

  setTimeout(async () => {
    const state = userStates.get(chatId);

    if (state && !state.hasPaid && state.step === 'offer_shown') {
      await bot.sendMessage(
        chatId,
        '👋 Привет, это снова Аделина!\n\n' +
        'Напоминаю, что доступ к "Букварю английского" ещё открыт — и сейчас он стоит всего 1000₽.\n\n' +
        '⏰ Уже завтра цена может вырасти.\n\n' +
        'Хочешь успеть забрать по старой цене?',
        { reply_markup: paymentKeyboard }
      );

      userStates.set(chatId, { ...state, lastReminderSent: Date.now() });
    }
  }, delay);
}

// Команда для админа для подтверждения оплаты
bot.onText(/\/paid (\d+)/, async (msg, match) => {
  const adminId = msg.from?.id;
  const targetUserId = parseInt(match![1]);

  // Проверить, что отправитель - админ (добавьте свой ID в .env)
  const adminIds = process.env.ADMIN_IDS?.split(',').map(id => parseInt(id)) || [];

  if (adminIds.includes(adminId!)) {
    await handleSuccessfulPayment(targetUserId);
    await bot.sendMessage(msg.chat.id, `✅ Доступ выдан пользователю ${targetUserId}`);
  } else {
    await bot.sendMessage(msg.chat.id, '❌ У вас нет прав администратора');
  }
});

console.log('🤖 Бот запущен!');
