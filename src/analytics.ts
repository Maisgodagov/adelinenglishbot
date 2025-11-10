import fetch from 'node-fetch';

// Google Analytics 4 Measurement Protocol
const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID!;
const GA_API_SECRET = process.env.GA_API_SECRET!;
const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

interface AnalyticsEvent {
  name: string;
  params?: Record<string, any>;
}

/**
 * Отправляет событие в Google Analytics 4
 * @param userId - ID пользователя (Telegram chatId)
 * @param event - Событие и его параметры
 */
export async function trackEvent(userId: string | number, event: AnalyticsEvent): Promise<void> {
  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) {
    console.warn('Google Analytics не настроен. Пропускаю событие:', event.name);
    return;
  }

  try {
    const payload = {
      client_id: userId.toString(),
      events: [
        {
          name: event.name,
          params: {
            engagement_time_msec: '100',
            session_id: Date.now().toString(),
            ...event.params,
          },
        },
      ],
    };

    const url = `${GA_ENDPOINT}?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Ошибка отправки события в GA:', response.status, response.statusText);
    } else {
      console.log(`✅ GA событие отправлено: ${event.name} для пользователя ${userId}`);
    }
  } catch (error) {
    console.error('Ошибка при отправке события в Google Analytics:', error);
  }
}

/**
 * Хелперы для типичных событий
 */
export const Analytics = {
  // Пользователь начал взаимодействие с ботом
  botStart: (userId: string | number, firstName?: string, lastName?: string) => {
    return trackEvent(userId, {
      name: 'bot_start',
      params: {
        user_first_name: firstName || '',
        user_last_name: lastName || '',
      },
    });
  },

  // Пользователь прошёл шаг воронки
  funnelStep: (userId: string | number, step: string) => {
    return trackEvent(userId, {
      name: 'funnel_step',
      params: {
        step_name: step,
      },
    });
  },

  // Пользователь подписался на канал
  channelSubscribed: (userId: string | number, channelUsername: string) => {
    return trackEvent(userId, {
      name: 'channel_subscribed',
      params: {
        channel: channelUsername,
      },
    });
  },

  // Пользователь нажал кнопку оплаты
  paymentInitiated: (userId: string | number, amount: number) => {
    return trackEvent(userId, {
      name: 'payment_initiated',
      params: {
        currency: 'RUB',
        value: amount,
      },
    });
  },

  // Успешная оплата
  paymentSuccess: (userId: string | number, amount: number, paymentId: string) => {
    return trackEvent(userId, {
      name: 'purchase',
      params: {
        currency: 'RUB',
        value: amount,
        transaction_id: paymentId,
        items: [
          {
            item_id: 'english_course',
            item_name: 'Букварь английского языка',
            price: amount,
            quantity: 1,
          },
        ],
      },
    });
  },

  // Пользователь отправил контакт
  contactShared: (userId: string | number, phoneNumber: string) => {
    return trackEvent(userId, {
      name: 'contact_shared',
      params: {
        phone_provided: !!phoneNumber,
      },
    });
  },

  // Пользователь нажал на callback кнопку
  buttonClicked: (userId: string | number, buttonData: string) => {
    return trackEvent(userId, {
      name: 'button_click',
      params: {
        button_data: buttonData,
      },
    });
  },

  // Пользователь получил доступ к курсу
  courseAccessGranted: (userId: string | number) => {
    return trackEvent(userId, {
      name: 'course_access_granted',
      params: {
        course_id: 'english_course',
      },
    });
  },

  // Пользователь отменил взаимодействие
  userDropped: (userId: string | number, lastStep: string) => {
    return trackEvent(userId, {
      name: 'user_dropped',
      params: {
        last_step: lastStep,
      },
    });
  },
};
