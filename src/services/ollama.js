import { Ollama } from 'ollama';
import dotenv from 'dotenv';

dotenv.config();

const ollama = new Ollama({
  host: process.env.OLLAMA_HOST || 'http://localhost:11434'
});

/**
 * Генерация ответа от Ollama
 * @param {string} prompt - Промпт для модели
 * @param {string} context - Контекст из базы знаний
 * @returns {Promise<string>} - Ответ модели
 */
export async function generateResponse(prompt, context = '') {
  try {
    const systemPrompt = `Ты - HR-ассистент компании. Твоя задача - помогать сотрудникам с вопросами по HR-процессам.

Правила:
1. Отвечай только на основе предоставленного контекста
2. Если информации нет в контексте, честно скажи об этом и предложи обратиться к HR
3. Всегда указывай источник информации (документ, пункт ЛНА)
4. Будь вежливым и профессиональным
5. Отвечай на русском языке

Контекст из документов:
${context}`;

    const response = await ollama.chat({
      model: process.env.OLLAMA_MODEL || 'llama3.2',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      stream: false
    });

    return response.message.content;
  } catch (error) {
    console.error('Ollama error:', error);
    throw new Error('Не удалось получить ответ от AI модели');
  }
}

/**
 * Проверка доступности Ollama
 * @returns {Promise<boolean>}
 */
export async function checkOllamaHealth() {
  try {
    const models = await ollama.list();
    return models && models.models.length > 0;
  } catch (error) {
    console.error('Ollama health check failed:', error);
    return false;
  }
}

export default ollama;
