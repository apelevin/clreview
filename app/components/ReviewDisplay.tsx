'use client';

import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import CostStatistics from './CostStatistics';

interface StepCostStatistics {
  step: number;
  stepName: string;
  calls: number;
  tokens: {
    input: number;
    cachedInput: number;
    output: number;
    total: number;
  };
  cost: {
    input: number;
    cachedInput: number;
    output: number;
    total: number;
  };
}

interface CostStatistics {
  steps: StepCostStatistics[];
  total: {
    tokens: {
      input: number;
      cachedInput: number;
      output: number;
      total: number;
    };
    cost: {
      input: number;
      cachedInput: number;
      output: number;
      total: number;
    };
  };
}

interface ReviewDisplayProps {
  review: string;
  documents?: Array<{
    fileName: string;
    hasError: boolean;
    error?: string;
  }>;
  costStatistics?: CostStatistics;
}

export default function ReviewDisplay({ review, documents, costStatistics }: ReviewDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(review);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Ошибка при копировании:', err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([review], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `обзор-судебной-практики-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!review) {
    return null;
  }

  return (
    <div className="w-full mt-6 space-y-4">
      {costStatistics && <CostStatistics statistics={costStatistics} />}
      
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Обзор судебной практики</h2>
        <div className="flex space-x-2">
          <button
            onClick={handleCopy}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            {copied ? 'Скопировано!' : 'Копировать'}
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            Скачать
          </button>
        </div>
      </div>

      {documents && documents.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Обработанные документы:
          </h3>
          <ul className="space-y-1">
            {documents.map((doc, index) => (
              <li key={index} className="text-sm text-gray-600 flex items-center">
                {doc.hasError ? (
                  <>
                    <span className="text-red-500 mr-2">✗</span>
                    <span className="text-red-600">
                      {doc.fileName} - {doc.error}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-green-500 mr-2">✓</span>
                    <span>{doc.fileName}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="prose prose-sm max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-p:text-gray-800 prose-p:leading-relaxed prose-ul:list-disc prose-ol:list-decimal prose-li:my-1 prose-strong:text-gray-900 prose-strong:font-semibold">
          <ReactMarkdown
            components={{
              h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-gray-900" {...props} />,
              h2: ({ node, ...props }) => <h2 className="text-xl font-bold mt-5 mb-3 text-gray-900" {...props} />,
              h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mt-4 mb-2 text-gray-900" {...props} />,
              h4: ({ node, ...props }) => <h4 className="text-base font-semibold mt-3 mb-2 text-gray-900" {...props} />,
              p: ({ node, ...props }) => <p className="mb-3 text-gray-800 leading-relaxed" {...props} />,
              ul: ({ node, ...props }) => <ul className="list-disc list-inside mb-3 space-y-1 ml-4" {...props} />,
              ol: ({ node, ...props }) => <ol className="list-decimal list-inside mb-3 space-y-1 ml-4" {...props} />,
              li: ({ node, ...props }) => <li className="my-1 text-gray-800" {...props} />,
              strong: ({ node, ...props }) => <strong className="font-semibold text-gray-900" {...props} />,
              em: ({ node, ...props }) => <em className="italic" {...props} />,
              code: ({ node, inline, ...props }: any) => 
                inline ? (
                  <code className="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono text-gray-900" {...props} />
                ) : (
                  <code className="block bg-gray-100 p-3 rounded text-sm font-mono text-gray-900 overflow-x-auto" {...props} />
                ),
              blockquote: ({ node, ...props }) => (
                <blockquote className="border-l-4 border-gray-300 pl-4 italic my-4 text-gray-700" {...props} />
              ),
            }}
          >
            {review}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

