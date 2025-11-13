import TelegramBot from "node-telegram-bot-api";
import * as dotenv from "dotenv";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { YooCheckout, ICreatePayment } from "@a2seven/yoo-checkout";
import { Analytics } from "./analytics";

dotenv.config();

const token = process.env.BOT_TOKEN!;
const channelId = process.env.CHANNEL_ID!; // Формат: @channelname или -100123456789
const supportContact = process.env.SUPPORT_CONTACT || "@support";
const courseLink = process.env.COURSE_LINK || "https://example.com/course";
const channelLink = process.env.CHANNEL_LINK || "https://t.me/yourchannel";

// ЮKassa настройки
const yookassaShopId = process.env.YOOKASSA_SHOP_ID!;
const yookassaSecretKey = process.env.YOOKASSA_SECRET_KEY!;
const paymentAmount = process.env.PAYMENT_AMOUNT || "1000.00";
const webhookPort = parseInt(process.env.WEBHOOK_PORT || "3000");
const serverUrl = process.env.SERVER_URL || "http://localhost:3000";

// Инициализация ЮKassa SDK
const checkout = new YooCheckout({
  shopId: yookassaShopId,
  secretKey: yookassaSecretKey,
});

// Хранилище для состояний пользователей (в продакшене использовать БД)
interface UserState {
  step: string;
  name?: string;
  phone?: string;
  hasPaid?: boolean;
  lastReminderSent?: number;
  paymentId?: string; // ID платежа ЮMoney
}

const userStates = new Map<number, UserState>();
// Связь paymentId -> chatId для обработки webhook от ЮMoney
const paymentToChatId = new Map<string, number>();

const bot = new TelegramBot(token, { polling: true });

// Express сервер для webhook от ЮMoney
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Клавиатуры
const contactKeyboard = {
  keyboard: [[{ text: "Оставить контакт ☎️", request_contact: true }]],
  resize_keyboard: true,
  one_time_keyboard: true,
};

const subscribeKeyboard = {
  inline_keyboard: [
    [{ text: "Подписаться на канал 📢", url: channelLink }],
    [{ text: "Я подписался(-ась) ✅", callback_data: "check_subscription" }],
  ],
};

const startKeyboard = {
  inline_keyboard: [[{ text: "Начать 🚀", callback_data: "start_warming" }]],
};

const showExampleKeyboard = {
  inline_keyboard: [
    [{ text: "Да, покажи пример 👀", callback_data: "show_example" }],
  ],
};

const wantDetailsKeyboard = {
  inline_keyboard: [
    [{ text: "💬 Да, хочу подробнее", callback_data: "show_product" }],
  ],
};

// Функция для создания платежа через ЮKassa
async function createYooKassaPayment(
  chatId: number
): Promise<{ paymentId: string; paymentUrl: string }> {
  const idempotenceKey = uuidv4();

  try {
    // Создаём платёж через ЮKassa API
    const payment = await checkout.createPayment(
      {
        amount: {
          value: paymentAmount,
          currency: "RUB",
        },
        confirmation: {
          type: "redirect",
          return_url: `${serverUrl}/payment/success`,
        },
        capture: true, // Автоматическое списание
        description: "Букварь английского языка",
        metadata: {
          chatId: chatId.toString(), // Сохраняем chatId в метаданных
        },
      },
      idempotenceKey
    );

    if (!payment.id || !payment.confirmation?.confirmation_url) {
      throw new Error("Failed to create payment");
    }

    // Сохраняем связь paymentId -> chatId
    paymentToChatId.set(payment.id, chatId);

    return {
      paymentId: payment.id,
      paymentUrl: payment.confirmation.confirmation_url,
    };
  } catch (error) {
    console.error("Ошибка создания платежа ЮKassa:", error);
    throw error;
  }
}

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  // Отправляем событие в Google Analytics
  await Analytics.botStart(chatId, user?.first_name, user?.last_name);

  userStates.set(chatId, { step: "greeting" });

  await bot.sendMessage(
    chatId,
    "🌟 Привет! Я — Аделина, преподаватель английского для взрослых и детей.\n\n" +
      "Уже более 10 лет помогаю маленьким и взрослым перестать бояться английского, учить слова легко и навсегда 📚\n\n" +
      "Чтобы прислать тебе материалы и полезные советы, нажми кнопку ниже 👇",
    { reply_markup: contactKeyboard }
  );
});

// Обработчик получения контакта
bot.on("contact", async (msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;
  const state = userStates.get(chatId);

  if (!state || state.step !== "greeting") return;

  const firstName = contact?.first_name || msg.from?.first_name || "друг";

  // Трекаем получение контакта
  await Analytics.contactShared(chatId, contact?.phone_number || "");
  await Analytics.funnelStep(chatId, "contact_received");

  userStates.set(chatId, {
    step: "subscription_check",
    name: firstName,
    phone: contact?.phone_number,
  });

  await bot.sendMessage(
    chatId,
    `Отлично, ${firstName}! 👏\n\n` +
      "А ты знал(а), что каждый русскоговорящий уже знает английский, просто не догадывается об этом? 😉\n\n" +
      "Подпишись на мой канал — покажу, как заговорить на английском быстрее, чем ты думаешь, и дам кучу полезных разборов.",
    { reply_markup: { remove_keyboard: true } }
  );

  await bot.sendMessage(chatId, "Подпишись, а потом нажми кнопку ниже 👇", {
    reply_markup: subscribeKeyboard,
  });
});

// Проверка подписки на канал
async function checkSubscription(chatId: number): Promise<boolean> {
  try {
    const member = await bot.getChatMember(channelId, chatId);
    return ["member", "administrator", "creator"].includes(member.status);
  } catch (error) {
    console.error("Ошибка проверки подписки:", error);
    return false;
  }
}

// Обработчик callback-кнопок
bot.on("callback_query", async (query) => {
  const chatId = query.message!.chat.id;
  const messageId = query.message!.message_id;
  const data = query.data;
  const state = userStates.get(chatId);

  // Трекаем нажатия на кнопки
  await Analytics.buttonClicked(chatId, data || "unknown");

  await bot.answerCallbackQuery(query.id);

  switch (data) {
    case "check_subscription":
      const isSubscribed = await checkSubscription(chatId);

      if (isSubscribed) {
        // Трекаем успешную подписку
        await Analytics.channelSubscribed(chatId, channelId);
        await Analytics.funnelStep(chatId, "subscribed");

        userStates.set(chatId, { ...state!, step: "warming" });

        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: chatId, message_id: messageId }
        );

        await bot.sendMessage(
          chatId,
          'Класс! 🎉 Теперь я покажу тебе, почему большинство людей не могут запомнить слова — и как исправить это с помощью моей авторской системы "Букварь английского".\n\n' +
            "Готов? Начнём с самого главного 💪",
          { reply_markup: startKeyboard }
        );
      } else {
        await bot.sendMessage(
          chatId,
          "❌ Похоже, ты ещё не подписался на канал. Подпишись и нажми кнопку снова 😊",
          { reply_markup: subscribeKeyboard }
        );
      }
      break;

    case "start_warming":
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      await bot.sendMessage(
        chatId,
        "🤔 *Почему мы учим слова — и забываем их через пару дней?*\n\n" +
          "Потому что мозг не запоминает изолированные слова, ему нужны связи и образы.\n\n" +
          'Я покажу тебе, как мой "Букварь" делает это автоматически:\n\n' +
          "1️⃣ Картинки для лучшей ассоциации\n" +
          "2️⃣ Голосовые кнопки — как твой личный учитель\n" +
          "3️⃣ Задания для каждой буквы — закрепляем знания на практике\n" +
          "4️⃣ Помощник шаг за шагом, который ведёт к результату\n\n" +
          "Хочешь, покажу, как это выглядит внутри?",
        { parse_mode: "Markdown", reply_markup: showExampleKeyboard }
      );
      break;

    case "show_example":
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      // Здесь можно отправить фото/видео/аудио из букваря
      await bot.sendMessage(
        chatId,
        "🎯 Маленький лайфхак от меня:\n\n" +
          'Вместо того чтобы учить слово "apple" отдельно, свяжи его с образом и контекстом:\n\n' +
          '🍎 *"I\'m eating an apple"* — и мозг сам запоминает.\n\n' +
          'Именно так устроен мой "Букварь английского" — буквы, слова, картинки, примеры, ассоциации.',
        { parse_mode: "Markdown" }
      );

      setTimeout(async () => {
        await bot.sendMessage(
          chatId,
          "🎁 *За 30 дней ты выучишь 500–1000 слов, которые реально используются в жизни.*\n\n" +
            "Хочешь получить весь Букварь за 1000₽?",
          { parse_mode: "Markdown", reply_markup: wantDetailsKeyboard }
        );
      }, 2000);
      break;

    case "show_product":
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      // Трекаем показ продукта
      await Analytics.funnelStep(chatId, "product_shown");

      await bot.sendMessage(
        chatId,
        '🎁 *Мини-курс "Букварь английского от меня" — это:*\n\n' +
          "✅ 30+ аудиоуроков\n" +
          "✅ Разбор каждой буквы с примерами слогов и слов\n" +
          "✅ Аудио-файлы для тренировки произношения\n" +
          "✅ Удобный формат — всё на телефоне\n\n" +
          "💰 *Стоимость — всего 1000₽* (вместо 2900₽).\n\n" +
          "Хочешь начать учить английский уже сегодня?",
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💳 Оплатить 1000₽", callback_data: "payment" }],
            ],
          },
        }
      );

      // Запускаем таймер для дожима через 24-48 часов
      userStates.set(chatId, { ...state!, step: "offer_shown" });
      scheduleReminder(chatId);
      break;

    case "payment":
      // Трекаем начало оплаты
      await Analytics.paymentInitiated(chatId, parseInt(paymentAmount));
      await Analytics.funnelStep(chatId, "payment_initiated");

      // Создаём платёжную ссылку ЮKassa
      const { paymentId, paymentUrl } = await createYooKassaPayment(chatId);

      // Сохраняем paymentId в состояние пользователя
      userStates.set(chatId, {
        ...state!,
        paymentId,
        step: "awaiting_payment",
      });

      await bot.sendMessage(
        chatId,
        "💳 *Для оплаты перейдите по ссылке ниже:*\n\n" +
          "После успешной оплаты доступ к курсу придёт автоматически! ✅\n\n" +
          "💰 Сумма: 1000₽\n\n" +
          `Если возникли проблемы, пишите: ${supportContact}`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "💳 Оплатить через ЮKassa", url: paymentUrl }],
              [{ text: "✅ Я уже оплатил", callback_data: "check_payment" }],
            ],
          },
        }
      );
      break;

    case "check_payment":
      const userState = userStates.get(chatId);

      if (userState?.hasPaid) {
        await bot.sendMessage(
          chatId,
          "✅ Ваша оплата подтверждена! Доступ уже выдан.",
          { parse_mode: "Markdown" }
        );
      } else {
        await bot.sendMessage(
          chatId,
          "⏳ Ожидаем подтверждение оплаты...\n\n" +
            "Обычно это занимает 1-2 минуты. Если оплата прошла, доступ придёт автоматически.\n\n" +
            `Если прошло более 5 минут, напишите: ${supportContact}`,
          { parse_mode: "Markdown" }
        );
      }
      break;
  }
});

// Функция обработки успешной оплаты
async function handleSuccessfulPayment(chatId: number) {
  const state = userStates.get(chatId);

  // Трекаем успешную оплату и выдачу доступа
  await Analytics.paymentSuccess(
    chatId,
    parseInt(paymentAmount),
    state?.paymentId || "unknown"
  );
  await Analytics.courseAccessGranted(chatId);
  await Analytics.funnelStep(chatId, "course_access_granted");

  userStates.set(chatId, { ...state!, hasPaid: true, step: "paid" });

  // Отправляем текстовое сообщение
  await bot.sendMessage(
    chatId,
    "Готово! \nТеперь можно забрать свой букварь, который научит тебя читать и слышать.\n\n" +
      "Не удивляйся, если научишься читать за один день.\nУдачи 😉"
  );

  // Отправляем PDF файл
  await bot.sendDocument(chatId, courseLink);

  // Отправляем ссылку на кнопочки
  await bot.sendMessage(
    chatId,
    "Кнопочки здесь. Чтобы было удобно, открой букварь на одном устройстве, а кнопочки на другом.\n\n" +
      "https://adelinteacher.ru/letteread/"
  );
}

// Напоминание через 24-48 часов
function scheduleReminder(chatId: number) {
  const delay = 24 * 60 * 60 * 1000; // 24 часа

  setTimeout(async () => {
    const state = userStates.get(chatId);

    if (state && !state.hasPaid && state.step === "offer_shown") {
      await bot.sendMessage(
        chatId,
        "👋 Привет, это снова Аделина!\n\n" +
          'Напоминаю, что доступ к "Букварю английского" ещё открыт — и сейчас он стоит всего 1000₽.\n\n' +
          "⏰ Уже завтра цена может вырасти.\n\n" +
          "Хочешь успеть забрать по старой цене?",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "💳 Оплатить 1000₽", callback_data: "payment" }],
            ],
          },
        }
      );

      userStates.set(chatId, { ...state, lastReminderSent: Date.now() });
    }
  }, delay);
}

// Команда для показа своего ID
bot.onText(/\/myid/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "пользователь";

  await bot.sendMessage(
    chatId,
    `👤 Привет, ${userName}!\n\n` +
      `Твой Telegram ID: \`${chatId}\`\n\n` +
      `Этот ID используется для идентификации в системе.`,
    { parse_mode: "Markdown" }
  );
});

// Команда для админа для подтверждения оплаты
bot.onText(/\/paid (\d+)/, async (msg, match) => {
  const adminId = msg.from?.id;
  const targetUserId = parseInt(match![1]);

  // Проверить, что отправитель - админ (добавьте свой ID в .env)
  const adminIds =
    process.env.ADMIN_IDS?.split(",").map((id) => parseInt(id)) || [];

  if (adminIds.includes(adminId!)) {
    await handleSuccessfulPayment(targetUserId);
    await bot.sendMessage(
      msg.chat.id,
      `✅ Доступ выдан пользователю ${targetUserId}`
    );
  } else {
    await bot.sendMessage(msg.chat.id, "❌ У вас нет прав администратора");
  }
});

// Webhook endpoint для ЮKassa (уведомления о платежах)
app.post("/webhook/yookassa", express.json(), async (req, res) => {
  try {
    console.log("Получен webhook от ЮKassa:", req.body);

    const notification = req.body;

    // Проверяем тип события
    if (notification.event === "payment.succeeded") {
      const payment = notification.object;
      const paymentId = payment.id;
      const chatId = paymentToChatId.get(paymentId);

      if (chatId) {
        // Обрабатываем успешную оплату
        await handleSuccessfulPayment(chatId);

        console.log(
          `✅ Доступ выдан пользователю ${chatId}, платёж ${paymentId}`
        );

        // Удаляем из Map после обработки
        paymentToChatId.delete(paymentId);
      } else {
        // Попробуем найти chatId в metadata
        const chatIdFromMetadata = payment.metadata?.chatId;
        if (chatIdFromMetadata) {
          const chatIdNum = parseInt(chatIdFromMetadata);
          await handleSuccessfulPayment(chatIdNum);
          console.log(
            `✅ Доступ выдан пользователю ${chatIdNum} (из metadata), платёж ${paymentId}`
          );
        } else {
          console.error(
            `❌ Не найден пользователь для paymentId: ${paymentId}`
          );
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Ошибка обработки webhook от ЮKassa:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Success page после оплаты
app.get("/payment/success", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ru">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Оплата прошла успешно!</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
          text-align: center;
          background: white;
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.2);
          max-width: 500px;
        }
        h1 { color: #4CAF50; margin: 0 0 20px 0; }
        p { color: #666; line-height: 1.6; margin: 10px 0; }
        .emoji { font-size: 64px; margin-bottom: 20px; }
        .button {
          display: inline-block;
          margin-top: 20px;
          padding: 15px 30px;
          background: #667eea;
          color: white;
          text-decoration: none;
          border-radius: 10px;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="emoji">🎉</div>
        <h1>Оплата прошла успешно!</h1>
        <p>Спасибо за покупку курса "Букварь английского"!</p>
        <p>Доступ к курсу придёт в Telegram-боте в течение 1-2 минут.</p>
        <p><strong>Вернитесь в Telegram и проверьте сообщения от бота.</strong></p>
        <a href="https://t.me/adelinClassBot" class="button">Открыть бота</a>
      </div>
    </body>
    </html>
  `);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", bot: "running" });
});

// Запуск Express сервера для webhook
app.listen(webhookPort, () => {
  console.log(`🤖 Бот запущен!`);
  console.log(`🌐 Webhook сервер запущен на порту ${webhookPort}`);
  console.log(`📍 Webhook URL: ${serverUrl}/webhook/yoomoney`);
  console.log(`✅ Success URL: ${serverUrl}/payment/success`);
});
