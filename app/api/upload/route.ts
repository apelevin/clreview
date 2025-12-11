import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import os from 'os';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 минут

// Получаем директорию для временных файлов
// На Vercel используем /tmp, локально - uploads/
function getUploadsDir(): string {
  // Проверяем, работаем ли мы на Vercel (read-only файловая система)
  // На Vercel доступна только /tmp для записи
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    return join(os.tmpdir(), 'uploads');
  }
  return join(process.cwd(), 'uploads');
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (!files || files.length === 0) {
      return NextResponse.json(
        { error: 'Файлы не загружены' },
        { status: 400 }
      );
    }

    // Проверяем, что все файлы - это DOCX
    const invalidFiles = files.filter(
      (file) => !file.name.toLowerCase().endsWith('.docx')
    );

    if (invalidFiles.length > 0) {
      return NextResponse.json(
        { error: 'Поддерживаются только файлы формата .docx' },
        { status: 400 }
      );
    }

    // Создаем директорию для загрузок, если её нет
    const uploadsDir = getUploadsDir();
    if (!existsSync(uploadsDir)) {
      mkdirSync(uploadsDir, { recursive: true });
    }

    // Сохраняем файлы
    const savedFiles = await Promise.all(
      files.map(async (file) => {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const fileName = `${Date.now()}-${file.name}`;
        const filePath = join(uploadsDir, fileName);

        await writeFile(filePath, buffer);

        return {
          fileName: file.name,
          savedPath: fileName,
          size: file.size,
        };
      })
    );

    return NextResponse.json({
      success: true,
      files: savedFiles,
      message: `Загружено файлов: ${savedFiles.length}`,
    });
  } catch (error) {
    console.error('Ошибка при загрузке файлов:', error);
    return NextResponse.json(
      {
        error: 'Ошибка при загрузке файлов',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

