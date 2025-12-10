/**
 * Скрипт для проверки доступности и точных названий моделей в OpenRouter
 * 
 * Запуск: npx tsx scripts/check-models.ts
 * 
 * Требуется переменная окружения: OPENROUTER_API_KEY
 */

// Модели, которые мы хотим проверить
const modelsToCheck = [
  'xai/grok-beta',
  'xai/grok-2',
  'xai/grok-2-vision-1212',
  'google/gemini-2.0-flash-exp',
  'google/gemini-2.5-flash',
  'google/gemini-2.5-flash-lite',
  'google/gemini-flash-1.5',
  'deepseek/deepseek-chat',
  'deepseek/deepseek-v3.2',
  'deepseek/deepseek-chat-v3',
];

async function checkModels() {
  try {
    console.log('Получение списка всех моделей из OpenRouter...\n');
    
    // Получаем список всех моделей
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Ошибка при получении списка моделей: ${response.statusText}`);
    }

    const data = await response.json();
    const allModels = data.data || [];

    console.log(`Всего моделей в OpenRouter: ${allModels.length}\n`);
    console.log('Проверка наших моделей:\n');
    console.log('='.repeat(80));

    // Проверяем каждую модель
    for (const modelId of modelsToCheck) {
      const foundModel = allModels.find((m: any) => 
        m.id === modelId || 
        m.id.includes(modelId.split('/')[1]) ||
        m.name?.toLowerCase().includes(modelId.split('/')[1].toLowerCase())
      );

      if (foundModel) {
        console.log(`✓ ${modelId}`);
        console.log(`  ID: ${foundModel.id}`);
        console.log(`  Название: ${foundModel.name}`);
        if (foundModel.pricing) {
          console.log(`  Цена (input): $${foundModel.pricing.prompt} / 1M tokens`);
          console.log(`  Цена (output): $${foundModel.pricing.completion} / 1M tokens`);
        }
        console.log('');
      } else {
        console.log(`✗ ${modelId} - НЕ НАЙДЕНА`);
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log('\nПоиск похожих моделей:\n');

    // Ищем модели по ключевым словам
    const keywords = ['grok', 'gemini', 'deepseek'];
    for (const keyword of keywords) {
      const matchingModels = allModels.filter((m: any) => 
        m.id.toLowerCase().includes(keyword.toLowerCase()) ||
        m.name?.toLowerCase().includes(keyword.toLowerCase())
      ).slice(0, 5); // Показываем первые 5

      if (matchingModels.length > 0) {
        console.log(`Модели, содержащие "${keyword}":`);
        matchingModels.forEach((m: any) => {
          console.log(`  - ${m.id} (${m.name})`);
        });
        console.log('');
      }
    }

  } catch (error) {
    console.error('Ошибка:', error);
    process.exit(1);
  }
}

checkModels();

