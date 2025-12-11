import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';

// Ленивая инициализация клиента OpenRouter
let openaiInstance: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiInstance) {
    // Отладочная информация для диагностики на Vercel
    const envInfo = {
      VERCEL: process.env.VERCEL,
      NODE_ENV: process.env.NODE_ENV,
      VERCEL_ENV: process.env.VERCEL_ENV,
      hasApiKey: !!process.env.OPENROUTER_API_KEY,
      apiKeyLength: process.env.OPENROUTER_API_KEY?.length || 0,
    };
    
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY отсутствует. Информация об окружении:', envInfo);
      const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';
      const errorMessage = isVercel
        ? `OPENROUTER_API_KEY не установлен в переменных окружения Vercel. Добавьте переменную в настройках проекта: Settings → Environment Variables. Убедитесь, что переменная добавлена для окружения "${process.env.VERCEL_ENV || 'Production'}" и перезапустите деплой.`
        : 'OPENROUTER_API_KEY не установлен в переменных окружения. Создайте файл .env.local и добавьте OPENROUTER_API_KEY=your_key';
      throw new Error(errorMessage);
    }
    
    // Логируем успешную инициализацию (без ключа)
    console.log('OpenRouter клиент инициализирован. Окружение:', {
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
    });
    
    openaiInstance = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'https://github.com/apelevin/review',
        'X-Title': 'Legal Review Service',
      },
    });
  }
  return openaiInstance;
}

// Цены для моделей (per 1M tokens)
interface ModelPricing {
  input: number;
  cached_input: number;
  output: number;
}

// Цены для моделей OpenRouter (за токен, не за 1M токенов!)
// Цены обновлены на основе данных из OpenRouter API
// Внимание: OpenRouter возвращает цены за токен, поэтому умножаем напрямую на количество токенов
const MODEL_PRICING: Record<string, ModelPricing> = {
  // Step 0: xAI Grok 4.1 Fast (данные из OpenRouter API)
  'x-ai/grok-4.1-fast': {
    input: 0.0000002, // $0.0000002 за токен
    cached_input: 0.00000002, // $0.00000002 за токен
    output: 0.0000005, // $0.0000005 за токен
  },
  // Step 1: Google Gemini 2.5 Flash Lite Preview (данные из OpenRouter API)
  'google/gemini-2.5-flash-lite-preview-09-2025': {
    input: 0.0000001, // $0.0000001 за токен
    cached_input: 0.00000001, // $0.00000001 за токен
    output: 0.0000004, // $0.0000004 за токен
  },
  // Step 3: DeepSeek V3.2 (данные из OpenRouter API)
  'deepseek/deepseek-v3.2': {
    input: 0.00000026, // $0.00000026 за токен (исправлено с 0.00000027)
    cached_input: 0.000000026, // $0.000000026 за токен
    output: 0.00000039, // $0.00000039 за токен (исправлено с 0.00000041)
  },
  // Step 4: Google Gemini 2.5 Flash Preview (данные из OpenRouter API)
  'google/gemini-2.5-flash-preview-09-2025': {
    input: 0.0000003, // $0.0000003 за токен
    cached_input: 0.00000003, // $0.00000003 за токен
    output: 0.0000025, // $0.0000025 за токен
  },
  // Старые модели (для совместимости) - цены за 1M токенов, нужно конвертировать
  'openai/gpt-5-mini': {
    input: 0.25 / 1_000_000, // Конвертировано из $0.25 / 1M tokens
    cached_input: 0.025 / 1_000_000,
    output: 2.0 / 1_000_000,
  },
  'openai/gpt-5': {
    input: 1.25 / 1_000_000, // Конвертировано из $1.25 / 1M tokens
    cached_input: 0.125 / 1_000_000,
    output: 10.0 / 1_000_000,
  },
  'openai/gpt-5.1': {
    input: 1.25 / 1_000_000, // Конвертировано из $1.25 / 1M tokens
    cached_input: 0.125 / 1_000_000,
    output: 10.0 / 1_000_000,
  },
};

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  totalTokens: number;
}

export interface CostBreakdown {
  inputCost: number;
  cachedInputCost: number;
  outputCost: number;
  totalCost: number;
}

export interface APIResponse {
  content: string;
  usage: TokenUsage;
  cost: CostBreakdown;
}


/**
 * Отправляет запрос к OpenRouter API с системным промптом и пользовательским контентом
 * @param systemPrompt - системный промпт
 * @param userContent - пользовательский контент (текст документа)
 * @param model - модель OpenRouter (по умолчанию openai/gpt-5.1)
 * @returns Promise с ответом от модели, статистикой токенов и расходами
 */
export async function callOpenAI(
  systemPrompt: string,
  userContent: string,
  model: string = 'openai/gpt-5.1'
): Promise<APIResponse> {
  try {
    const openai = getOpenAIClient();
    
    let response;
    let usedModel = model;
    
    // Функция для создания запроса
    const createRequest = () => {
      return openai.chat.completions.create({
        model: usedModel,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userContent,
          },
        ],
        temperature: 0.7,
      });
    };
    
    // Выполняем запрос
    response = await createRequest();

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Пустой ответ от OpenRouter API');
    }

    // Извлекаем статистику использования токенов
    const usage = response.usage;
    if (!usage) {
      throw new Error('Не получена статистика использования токенов');
    }

    const tokenUsage: TokenUsage = {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      cachedTokens: (usage as any).cached_tokens || 0,
      totalTokens: usage.total_tokens || 0,
    };

    // Рассчитываем расходы
    const inputTokens = tokenUsage.promptTokens - (tokenUsage.cachedTokens || 0);
    const cachedInputTokens = tokenUsage.cachedTokens || 0;
    const outputTokens = tokenUsage.completionTokens;

    // Определяем цены в зависимости от модели
    const pricing = MODEL_PRICING[usedModel] || MODEL_PRICING['x-ai/grok-4.1-fast'];

    // Цены в OpenRouter API указаны за токен, а не за 1M токенов
    const cost: CostBreakdown = {
      inputCost: inputTokens * pricing.input,
      cachedInputCost: cachedInputTokens * pricing.cached_input,
      outputCost: outputTokens * pricing.output,
      totalCost: 0,
    };

    cost.totalCost = cost.inputCost + cost.cachedInputCost + cost.outputCost;

    return {
      content,
      usage: tokenUsage,
      cost,
    };
  } catch (error) {
    throw new Error(
      `Ошибка при вызове OpenRouter API: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Загружает промпт из файла
 * @param promptPath - путь к файлу с промптом
 * @returns Promise с содержимым промпта
 */
export async function loadPrompt(promptPath: string): Promise<string> {
  try {
    const fullPath = path.join(process.cwd(), promptPath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return content.trim();
  } catch (error) {
    throw new Error(
      `Ошибка при загрузке промпта из ${promptPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Загружает промпт из файла и разделяет на SYSTEM и USER части
 * @param promptPath - путь к файлу с промптом
 * @returns Promise с объектом, содержащим systemPrompt и userPrompt
 */
export async function loadPromptWithParts(promptPath: string): Promise<{
  systemPrompt: string;
  userPrompt: string;
}> {
  try {
    const fullPath = path.join(process.cwd(), promptPath);
    const content = await fs.readFile(fullPath, 'utf-8');
    
    // Разделяем на SYSTEM и USER части
    const systemMatch = content.match(/## 🟦\s*\*\*SYSTEM PROMPT\*\*\s*\n\n(.*?)(?=\n---|\n## 🟩|$)/s);
    const userMatch = content.match(/## 🟩\s*\*\*USER PROMPT\*\*\s*\n\n(.*?)(?=\n---|\n## 🟥|$)/s);
    
    const systemPrompt = systemMatch ? systemMatch[1].trim() : content.trim();
    const userPrompt = userMatch ? userMatch[1].trim() : '';
    
    return {
      systemPrompt,
      userPrompt: userPrompt || content.trim(), // Если USER не найден, используем весь контент
    };
  } catch (error) {
    throw new Error(
      `Ошибка при загрузке промпта из ${promptPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

