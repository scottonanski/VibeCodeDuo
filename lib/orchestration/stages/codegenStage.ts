// lib/orchestration/stages/codegenStage.ts

import { fetchChatCompletion } from '@/lib/services/ai-service';
import type { AiChatMessage } from './types';

interface CodegenResult {
  filename: string;
  content: string;
  fullText: string;
  messages: AiChatMessage[];
}

import type { CodegenStageParams, StageEvent } from './types';

export async function* codegenStage(
  params: CodegenStageParams
): AsyncGenerator<StageEvent, void> {
  const { filename, refinedPrompt, conversationHistory, currentCode, workerConfig, projectType } = params;
  // Use workerConfig.provider, workerConfig.model, workerConfig.apiKey

  const systemPrompt = `You are an expert front-end developer.
Your job is to generate clean, modern, production-quality code.
Only write the code for the file you are asked to build.`;

  const filePrompt = `Task: Based on the following description, write the complete code for this file:

File: \`${filename}\`

Description: ${refinedPrompt}

Do not explain anything. Just return the file content in a valid code block with proper syntax highlighting (e.g., \`\`\`tsx).`;

  const messages: AiChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: filePrompt },
  ];

  const generator = await fetchChatCompletion({
    provider: workerConfig.provider,
    model: workerConfig.model,
    messages,
    apiKey: workerConfig.apiKey,
    stream: true,
  });

  let fullText = '';
  for await (const chunk of generator) {
    fullText += chunk;
    yield {
      type: 'codegen-chunk',
      data: { content: chunk },
    };
  }

  // Parse out code block from fullText
  const codeMatch = fullText.match(/```(?:tsx|js|ts)?\n([\s\S]*?)```/);
  const codeContent = codeMatch ? codeMatch[1].trim() : '// Failed to extract code';

  yield {
    type: 'codegen-complete',
    data: {
      content: codeContent,
      fullText,
      messages,
    },
  };
}
