/**
 * База знаний (заглушка)
 * В продакшене здесь будет векторная БД или поиск по документам
 */

const knowledgeBase = {
  vacation: {
    title: 'Отпуска',
    content: `
      Правила предоставления отпусков:
      - Ежегодный оплачиваемый отпуск составляет 28 календарных дней
      - Отпуск предоставляется согласно графику отпусков
      - Для переноса отпуска необходимо подать заявление за 14 дней

      Основание: п. 4.2 Правил внутреннего трудового распорядка
    `,
    source: 'Правила внутреннего трудового распорядка, п. 4.2'
  },
  salary: {
    title: 'Заработная плата',
    content: `
      Выплата заработной платы:
      - Аванс: 20 числа каждого месяца
      - Основная часть: 5 числа следующего месяца
      - Расчетный лист доступен в личном кабинете на портале

      Основание: п. 5.1 Положения об оплате труда
    `,
    source: 'Положение об оплате труда, п. 5.1'
  },
  sickLeave: {
    title: 'Больничный лист',
    content: `
      Оформление больничного:
      - Больничный лист оплачивается согласно ТК РФ
      - Необходимо предоставить электронный больничный лист в отдел кадров
      - Оплата производится в ближайшую зарплату после предоставления документов

      Основание: п. 6.3 Положения об оплате труда
    `,
    source: 'Положение об оплате труда, п. 6.3'
  },
  dms: {
    title: 'ДМС (Добровольное медицинское страхование)',
    content: `
      Программы ДМС:
      - Базовая программа: амбулаторное и стационарное лечение
      - Расширенная программа: включает стоматологию
      - Для подключения обратитесь в отдел кадров

      Подробнее: https://portal.company.ru/benefits/dms

      Основание: Положение о социальных льготах, раздел 3
    `,
    source: 'Положение о социальных льготах, раздел 3'
  },
  merch: {
    title: 'Магазин мерча',
    content: `
      Заказ корпоративного мерча:
      - Магазин доступен по ссылке: https://merch.company.ru
      - Доставка в офис бесплатная
      - Оплата через внутренние бонусы или банковской картой

      Основание: Положение о корпоративной культуре
    `,
    source: 'Положение о корпоративной культуре'
  },
  referral: {
    title: 'Реферальная программа',
    content: `
      Рекомендация кандидатов:
      - Заполните форму: https://portal.company.ru/referral
      - Бонус за успешный найм: 50 000 рублей
      - Контакт рекрутера: hr@company.ru

      Основание: Положение о реферальной программе
    `,
    source: 'Положение о реферальной программе'
  }
};

/**
 * Поиск релевантного контекста по запросу
 * @param {string} query - Запрос пользователя
 * @returns {Object} - Найденный контекст и источник
 */
export function searchKnowledge(query) {
  const lowerQuery = query.toLowerCase();

  // Простой поиск по ключевым словам (в продакшене - векторный поиск)
  if (lowerQuery.includes('отпуск') || lowerQuery.includes('vacation')) {
    return knowledgeBase.vacation;
  }

  if (lowerQuery.includes('зарплат') || lowerQuery.includes('аванс') || lowerQuery.includes('расчетный лист')) {
    return knowledgeBase.salary;
  }

  if (lowerQuery.includes('больничн') || lowerQuery.includes('sick')) {
    return knowledgeBase.sickLeave;
  }

  if (lowerQuery.includes('дмс') || lowerQuery.includes('страхован') || lowerQuery.includes('медицин')) {
    return knowledgeBase.dms;
  }

  if (lowerQuery.includes('мерч') || lowerQuery.includes('merch')) {
    return knowledgeBase.merch;
  }

  if (lowerQuery.includes('рекоменд') || lowerQuery.includes('друг') || lowerQuery.includes('вакан')) {
    return knowledgeBase.referral;
  }

  return null;
}

/**
 * Получить всю базу знаний
 * @returns {Object}
 */
export function getAllKnowledge() {
  return knowledgeBase;
}

export default { searchKnowledge, getAllKnowledge };
