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
const channelLink = process.env.CHANNEL_LINK || "https://t.me/adelengl";
const supportContact = process.env.SUPPORT_CONTACT || "@adelinteacher";
const mediaDir = process.env.MEDIA_DIR || "/var/www/adelinenglishbot/media";
const adminIds =
  process.env.ADMIN_IDS?.split(",")
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !Number.isNaN(id)) || [];

const videoIntro = path.join(mediaDir, "intro.mp4");
const videoMarathonGoodLuck = path.join(mediaDir, "marathon_goodluck.mp4");
const videoPraise = path.join(mediaDir, "praise.mp4");
const videoCourseGoodLuck = path.join(mediaDir, "course_goodluck.mp4");

const yookassaShopId = process.env.YOOKASSA_SHOP_ID!;
const yookassaSecretKey = process.env.YOOKASSA_SECRET_KEY!;
const paymentAmount = process.env.PAYMENT_AMOUNT || "990.00";
const webhookPort = parseInt(process.env.WEBHOOK_PORT || "3000", 10);
const serverUrl = process.env.SERVER_URL || "http://localhost:3000";

const checkout = new YooCheckout({
  shopId: yookassaShopId,
  secretKey: yookassaSecretKey,
});

type FlowStep =
  | "start"
  | "awaiting_free_email"
  | "awaiting_paid_email"
  | "awaiting_payment"
  | "free_access_requested"
  | "paid";

interface UserState {
  step: FlowStep;
  hasPaid?: boolean;
  paymentId?: string;
  email?: string;
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function buildTelegramIdentity(msg: TelegramBot.Message): string {
  const from = msg.from;
  const username = from?.username ? `@${from.username}` : "нет username";
  return `${username} (id: ${msg.chat.id})`;
}

async function sendVideoNoteFromFile(chatId: number, filePath: string) {
  return bot.sendVideoNote(
    chatId,
    fs.createReadStream(filePath),
    { duration: 60, length: 640 },
    { filename: path.basename(filePath), contentType: "video/mp4" }
  );
}

async function notifyAdmins(payload: {
  title: string;
  chatId: number;
  telegramIdentity: string;
  email: string;
  paymentId?: string;
}) {
  if (!adminIds.length) return;

  const lines = [
    payload.title,
    `Telegram: ${payload.telegramIdentity}`,
    `Email: ${payload.email}`,
    `Chat ID: ${payload.chatId}`,
  ];

  if (payload.paymentId) {
    lines.push(`Payment ID: ${payload.paymentId}`);
  }

  const text = lines.join("\n");

  for (const adminId of adminIds) {
    try {
      await bot.sendMessage(adminId, text);
    } catch (error) {
      console.error(`Failed to notify admin ${adminId}:`, error);
    }
  }
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
          "В первое занятие входит 5 блоков\n" +
          "Новые слова\n" +
          "Действия\n" +
          "Единственное и множественное число\n" +
          "Это/То местоимения\n" +
          "Притяжательные местоимения\n\n" +
          "На марафоне вы:\n" +
          "- научитесь говорить на тему «Мои вещи»\n" +
          "- запомните 50 слов\n" +
          "- научитесь понимать английский на слух\n" +
          "- забудете про зубрежку\n" +
          "- изучите две грамматические темы, сами того не заметив.",
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
      userStates.set(chatId, { ...state, step: "awaiting_free_email" });
      await bot.sendMessage(
        chatId,
        "Отправьте вашу почту для выдачи доступа к бесплатному марафону.",
        { reply_markup: channelKeyboard }
      );
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
        "Тема Работа\n\n" +
          "5 блоков\n\n" +
          "- Профессии\n" +
          "- Рабочие места\n" +
          "- Предмет работы\n" +
          "- Степени сравнения\n\n" +
          "Здесь вы выучите 50 слов, научитесь читать более длинные тексты, понимать разговоры о работе на слух и начнете говорить.",
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
        "Оставайся с нами в канале, узнавай новое каждый день и учи английский.",
        { reply_markup: channelKeyboard }
      );
      break;

    case "take_course":
      userStates.set(chatId, {
        ...state,
        step: "awaiting_paid_email",
      });

      await bot.sendMessage(
        chatId,
        "Перед оплатой отправьте вашу почту для выдачи доступа.",
        { reply_markup: channelKeyboard }
      );
      break;
  }
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const state = userStates.get(chatId);
  if (!state) return;

  if (state.step !== "awaiting_free_email" && state.step !== "awaiting_paid_email") {
    return;
  }

  const email = msg.text.trim().toLowerCase();
  if (!isValidEmail(email)) {
    await bot.sendMessage(chatId, "Похоже, это не email. Отправьте в формате name@example.com");
    return;
  }

  const telegramIdentity = buildTelegramIdentity(msg);

  if (state.step === "awaiting_free_email") {
    userStates.set(chatId, { ...state, email, step: "free_access_requested" });

    await notifyAdmins({
      title: "Новая заявка: бесплатный марафон",
      chatId,
      telegramIdentity,
      email,
    });

    await bot.sendMessage(
      chatId,
      `Спасибо! Доступ будет выдан в ближайшее время.\nПри вопросах напишите ${supportContact}`,
      { reply_markup: channelKeyboard }
    );
    return;
  }

  await Analytics.paymentInitiated(chatId, parseInt(paymentAmount, 10));
  await Analytics.funnelStep(chatId, "payment_initiated");

  const { paymentId, paymentUrl } = await createYooKassaPayment(chatId);
  userStates.set(chatId, { ...state, email, paymentId, step: "awaiting_payment" });

  await bot.sendMessage(chatId, "Для оплаты перейдите по ссылке ниже:", {
    reply_markup: {
      inline_keyboard: [[{ text: "Оплатить", url: paymentUrl }]],
    },
  });
});

async function handleSuccessfulPayment(chatId: number) {
  const state = userStates.get(chatId);

  await Analytics.paymentSuccess(
    chatId,
    parseInt(paymentAmount, 10),
    state?.paymentId || "unknown"
  );
  await Analytics.courseAccessGranted(chatId);
  await Analytics.funnelStep(chatId, "course_access_granted");

  userStates.set(chatId, { ...state!, hasPaid: true, step: "paid" });

  const chat = await bot.getChat(chatId);
  const telegramIdentity = chat.username ? `@${chat.username} (id: ${chatId})` : `id: ${chatId}`;

  await notifyAdmins({
    title: "Новая заявка: платный марафон (оплата успешна)",
    chatId,
    telegramIdentity,
    email: state?.email || "email не указан",
    paymentId: state?.paymentId,
  });

  await sendVideoNoteFromFile(chatId, videoCourseGoodLuck);
  await sleep(2500);

  await bot.sendMessage(
    chatId,
    `Спасибо за оплату! Доступ будет выдан в ближайшее время.\nПри вопросах напишите ${supportContact}`,
    { reply_markup: channelKeyboard }
  );
}

bot.onText(/\/myid/, async (msg) => {
  const chatId = msg.chat.id;
  const userName = msg.from?.first_name || "пользователь";

  await bot.sendMessage(
    chatId,
    `Твой Telegram ID: ${chatId}. Пользователь: ${userName}`
  );
});

bot.onText(/\/paid (\d+)/, async (msg, match) => {
  const adminId = msg.from?.id;
  const targetUserId = parseInt(match![1], 10);

  if (adminIds.includes(adminId!)) {
    await handleSuccessfulPayment(targetUserId);
    await bot.sendMessage(msg.chat.id, `Доступ выдан пользователю ${targetUserId}`);
  } else {
    await bot.sendMessage(msg.chat.id, "У вас нет прав администратора");
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
          const chatIdNum = parseInt(chatIdFromMetadata, 10);
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
      res.send("<h1>Платеж обрабатывается</h1><p>Вернитесь в Telegram-бота.</p>");
      return;
    }

    if (!isSuccess) {
      res.send("<h1>Оплата не завершена</h1><p>Вернитесь в Telegram-бота и попробуйте снова.</p>");
      return;
    }

    res.send("<h1>Оплата прошла успешно</h1><p>Вернитесь в Telegram-бота.</p>");
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
  console.log(`Bot started`);
  console.log(`Webhook server on ${webhookPort}`);
  console.log(`Webhook URL: ${serverUrl}/webhook/yookassa`);
  console.log(`Success URL: ${serverUrl}/payment/success`);
});
