import TelegramBot from "node-telegram-bot-api";
import * as dotenv from "dotenv";
import express from "express";
import { v4 as uuidv4 } from "uuid";
import { YooCheckout } from "@a2seven/yoo-checkout";
import { Analytics } from "./analytics";
import fs from "fs";
import path from "path";

dotenv.config();

const token = process.env.BOT_TOKEN!;
const courseLink = process.env.COURSE_LINK || "https://example.com/course";
const channelLink = process.env.CHANNEL_LINK || "https://t.me/adelengl";
const marathonLink =
  process.env.MARATHON_LINK ||
  "https://progressme.ru/cabinet/school/marathons/marathon/116466/lessons";
const chatLink = process.env.MARATHON_CHAT_LINK || "https://t.me/+18GWR5r4wm04OTIy";

const mediaDir =
  process.env.MEDIA_DIR || "/var/www/adelinenglishbot/media";
const videoIntro = path.join(mediaDir, "intro.mp4");
const videoMarathonGoodLuck = path.join(mediaDir, "marathon_goodluck.mp4");
const videoPraise = path.join(mediaDir, "praise.mp4");
const videoCourseGoodLuck = path.join(mediaDir, "course_goodluck.mp4");

// YooKassa settings
const yookassaShopId = process.env.YOOKASSA_SHOP_ID!;
const yookassaSecretKey = process.env.YOOKASSA_SECRET_KEY!;
const paymentAmount = process.env.PAYMENT_AMOUNT || "990.00";
const webhookPort = parseInt(process.env.WEBHOOK_PORT || "3000");
const serverUrl = process.env.SERVER_URL || "http://localhost:3000";

const checkout = new YooCheckout({
  shopId: yookassaShopId,
  secretKey: yookassaSecretKey,
});

interface UserState {
  step: string;
  hasPaid?: boolean;
  paymentId?: string;
}

const userStates = new Map<number, UserState>();
const paymentToChatId = new Map<string, number>();
const processedPayments = new Set<string>();
const orderToPaymentId = new Map<string, string>();

const bot = new TelegramBot(token, { polling: true });

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const startKeyboard = {
  inline_keyboard: [
    [{ text: "Пройти марафон", callback_data: "marathon_start" }],
    [{ text: "Уже прошел марафон", callback_data: "marathon_done" }],
  ],
};

const marathonDescriptionKeyboard = {
  inline_keyboard: [[{ text: "Описание марафона", callback_data: "marathon_description" }]],
};

const participateKeyboard = {
  inline_keyboard: [[{ text: "Участвую", callback_data: "marathon_participate" }]],
};

const marathonLinksKeyboard = {
  inline_keyboard: [
    [{ text: "Ссылка на марафон", url: marathonLink }],
    [{ text: "Чат марафона", url: chatLink }],
  ],
};

const continueStudyKeyboard = {
  inline_keyboard: [
    [{ text: "Да", callback_data: "continue_yes" }],
    [{ text: "Нет", callback_data: "continue_no" }],
  ],
};

const takeCourseKeyboard = {
  inline_keyboard: [[{ text: "Беру", callback_data: "take_course" }]],
};

const channelKeyboard = {
  inline_keyboard: [[{ text: "Перейти в канал", url: channelLink }]],
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendVideoNoteFromFile(chatId: number, filePath: string) {
  return bot.sendVideoNote(
    chatId,
    fs.createReadStream(filePath),
    { duration: 60, length: 640 },
    { filename: path.basename(filePath), contentType: "video/mp4" }
  );
}

async function createYooKassaPayment(
  chatId: number
): Promise<{ paymentId: string; paymentUrl: string }> {
  const idempotenceKey = uuidv4();
  const orderId = uuidv4();

  const payment = await checkout.createPayment(
    {
      amount: {
        value: paymentAmount,
        currency: "RUB",
      },
      confirmation: {
        type: "redirect",
        return_url: `${serverUrl}/payment/return?order_id=${orderId}`,
      },
      capture: true,
      description: "Марафон 2-й урок. Работа",
      metadata: {
        chatId: chatId.toString(),
        orderId,
      },
    },
    idempotenceKey
  );

  if (!payment.id || !payment.confirmation?.confirmation_url) {
    throw new Error("Failed to create payment");
  }

  paymentToChatId.set(payment.id, chatId);
  orderToPaymentId.set(orderId, payment.id);

  return {
    paymentId: payment.id,
    paymentUrl: payment.confirmation.confirmation_url,
  };
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  await Analytics.botStart(chatId, user?.first_name, user?.last_name);
  userStates.set(chatId, { step: "start" });

  await bot.sendMessage(chatId, "Привет! Выбирай, что тебе подходит:", {
    reply_markup: startKeyboard,
  });
});

bot.on("callback_query", async (query) => {
  const chatId = query.message!.chat.id;
  const messageId = query.message!.message_id;
  const data = query.data;
  const state = userStates.get(chatId);

  await Analytics.buttonClicked(chatId, data || "unknown");
  await bot.answerCallbackQuery(query.id);

  switch (data) {
    case "marathon_start":
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      await sendVideoNoteFromFile(chatId, videoIntro);
      await sleep(2500);
      await bot.sendMessage(chatId, "Жми кнопку ниже:", {
        reply_markup: marathonDescriptionKeyboard,
      });
      break;

    case "marathon_description":
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      await bot.sendMessage(
        chatId,
        "Марафон 1-й урок. Мои вещи\n" +
          "В первое занятие входит 5 блоков \n" +
          "Новые слова \n" +
          "Действия \n" +
          "Единственное и множественное число \n" +
          "Это/То Местоимения \n" +
          "Притяжательные местоимения \n\n" +
          "На марафоне вы:\n\n" +
          "-научитесь говорить на тему «Мои вещи» \n" +
          "-запомните 50 слов \n" +
          "-научитесь понимать английский на слух \n" +
          "-забудете про зубрежку\n" +
          "-изучите две грамматические темы, сами того не заметив. \n\n" +
          "Это не магия, ребят. Так обучают на курсах для преподавателей ESL. \n\n" +
          "Все блоки составлены так, что вы даже не почувствуете, что учитесь. Для вас это будет выглядеть, как прохождение игры.",
        { reply_markup: participateKeyboard }
      );
      break;

    case "marathon_participate":
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      await sendVideoNoteFromFile(chatId, videoMarathonGoodLuck);
      await sleep(2500);
      await bot.sendMessage(chatId, "Ссылки на марафон:", {
        reply_markup: marathonLinksKeyboard,
      });
      break;

    case "marathon_done":
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      await sendVideoNoteFromFile(chatId, videoPraise);
      await sleep(2500);
      await bot.sendMessage(chatId, "Хочешь учиться дальше?", {
        reply_markup: continueStudyKeyboard,
      });
      break;

    case "continue_yes":
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      await bot.sendMessage(
        chatId,
        "Тема Работа \n\n" +
          "5 блоков \n\n" +
          "-Профессии \n" +
          "-Рабочие места \n" +
          "-Предмет работы \n" +
          "-Степени сравнения \n\n" +
          "Здесь вы выучите так же 50 слов, научитесь читать тексты по больше, научитесь понимать разговоры  о работе на слух, и , что сама важное, начнете говорить.",
        { reply_markup: takeCourseKeyboard }
      );
      break;

    case "continue_no":
      await bot.editMessageReplyMarkup(
        { inline_keyboard: [] },
        { chat_id: chatId, message_id: messageId }
      );

      await bot.sendMessage(
        chatId,
        "Оставайся с нами в канале, узнавай новое каждый день и учи Английский",
        { reply_markup: channelKeyboard }
      );
      break;

    case "take_course":
      await Analytics.paymentInitiated(chatId, parseInt(paymentAmount));
      await Analytics.funnelStep(chatId, "payment_initiated");

      const { paymentId, paymentUrl } = await createYooKassaPayment(chatId);

      userStates.set(chatId, {
        ...state,
        paymentId,
        step: "awaiting_payment",
      });

  await bot.sendMessage(
    chatId,
    "Для оплаты перейдите по ссылке ниже:\n\n" +
      "После успешной оплаты доступ придет автоматически.",
    {
      reply_markup: {
        inline_keyboard: [[{ text: "Оплатить", url: paymentUrl }]],
      },
        }
      );
      break;
  }
});

async function handleSuccessfulPayment(chatId: number) {
  const state = userStates.get(chatId);

  await Analytics.paymentSuccess(
    chatId,
    parseInt(paymentAmount),
    state?.paymentId || "unknown"
  );
  await Analytics.courseAccessGranted(chatId);
  await Analytics.funnelStep(chatId, "course_access_granted");

  userStates.set(chatId, { ...state!, hasPaid: true, step: "paid" });

  await sendVideoNoteFromFile(chatId, videoCourseGoodLuck);

  await sleep(2500);
  await bot.sendMessage(chatId, "Доступ к курсу открыт! Перейдите по кнопке:", {
    reply_markup: {
      inline_keyboard: [[{ text: "Открыть курс", url: courseLink }]],
    },
  });

  await bot.sendMessage(chatId, "Чат курса:", {
    reply_markup: {
      inline_keyboard: [[{ text: "Чат курса", url: chatLink }]],
    },
  });
}

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

bot.onText(/\/paid (\d+)/, async (msg, match) => {
  const adminId = msg.from?.id;
  const targetUserId = parseInt(match![1]);

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

app.post("/webhook/yookassa", express.json(), async (req, res) => {
  try {
    const notification = req.body;

    if (notification.event === "payment.succeeded") {
      const payment = notification.object;
      const paymentId = payment.id;

      if (processedPayments.has(paymentId)) {
        res.status(200).json({ success: true });
        return;
      }

      const chatId = paymentToChatId.get(paymentId);

      if (chatId) {
        await handleSuccessfulPayment(chatId);
        processedPayments.add(paymentId);
        paymentToChatId.delete(paymentId);
      } else {
        const chatIdFromMetadata = payment.metadata?.chatId;
        if (chatIdFromMetadata) {
          const chatIdNum = parseInt(chatIdFromMetadata);
          await handleSuccessfulPayment(chatIdNum);
          processedPayments.add(paymentId);
        }
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Ошибка обработки webhook от YooKassa:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/payment/return", async (req, res) => {
  try {
    const orderId = typeof req.query.order_id === "string" ? req.query.order_id : "";
    const paymentId = orderId ? orderToPaymentId.get(orderId) : undefined;

    let isSuccess = false;
    if (paymentId) {
      const payment = await checkout.getPayment(paymentId);
      isSuccess = payment?.status === "succeeded";
    }

    if (!paymentId) {
      res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Платеж обрабатывается</title>
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
            h1 { color: #333; margin: 0 0 20px 0; }
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
            <div class="emoji">⏳</div>
            <h1>Платеж обрабатывается</h1>
            <p>Если оплата прошла успешно, доступ придет в Telegram-боте.</p>
            <p>Если вы отменили оплату — просто вернитесь в бота.</p>
            <a href="https://t.me/adelinClassBot" class="button">Открыть бота</a>
          </div>
        </body>
        </html>
      `);
      return;
    }

    if (!isSuccess) {
      res.send(`
        <!DOCTYPE html>
        <html lang="ru">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Оплата не завершена</title>
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
            h1 { color: #E53935; margin: 0 0 20px 0; }
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
            <div class="emoji">❌</div>
            <h1>Оплата не завершена</h1>
            <p>Вы отменили оплату или она еще не прошла.</p>
            <p>Вернитесь в бот и попробуйте снова.</p>
            <a href="https://t.me/adelinClassBot" class="button">Открыть бота</a>
          </div>
        </body>
        </html>
      `);
      return;
    }

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
        <p>Спасибо за покупку курса!</p>
        <p>Доступ придет в Telegram-боте в течение 1-2 минут.</p>
        <p><strong>Вернитесь в Telegram и проверьте сообщения от бота.</strong></p>
        <a href="https://t.me/adelinClassBot" class="button">Открыть бота</a>
      </div>
    </body>
    </html>
  `);
  } catch (error) {
    console.error("Ошибка проверки статуса оплаты:", error);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/payment/success", (req, res) => {
  res.redirect("/payment/return");
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", bot: "running" });
});

app.listen(webhookPort, () => {
  console.log(`🤖 Бот запущен!`);
  console.log(`🌐 Webhook сервер запущен на порту ${webhookPort}`);
  console.log(`📍 Webhook URL: ${serverUrl}/webhook/yookassa`);
  console.log(`✅ Success URL: ${serverUrl}/payment/success`);
});
