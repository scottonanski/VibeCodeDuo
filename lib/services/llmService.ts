// lib/orchestration/llmService.ts

import type { AiChatMessage } from '@/lib/orchestration/stages/types';

export type Provider = 'openai' | 'ollama';

export interface LLMStreamParams {
  messages: AiChatMessage[];
  model: string;
  provider: Provider;
  apiKey: string;
  stream?: boolean;
  signal?: AbortSignal;
}

// Narrowed types for each provider-specific function
type ProviderStreamParams = Omit<LLMStreamParams, 'provider'>;

/**
 * Unified LLM stream handler for both OpenAI and Ollama providers.
 * Delegates to the correct implementation based on provider.
 */
export async function* callLLMStream({
  provider,
  ...rest
}: LLMStreamParams): AsyncGenerator<string> {
  if (provider === 'openai') {
    yield* streamOpenAI(rest);
  } else if (provider === 'ollama') {
    yield* streamOllama(rest);
  } else {
    throw new Error(`Unsupported provider: ${provider}`);
  }
}

import { fetchChatCompletion } from './ai-service';

async function* streamOpenAI({
  messages,
  model,
  apiKey,
  stream = true,
  signal = new AbortController().signal,
}: ProviderStreamParams): AsyncGenerator<string> {
  yield* fetchChatCompletion({
    provider: 'openai',
    model,
    messages,
    apiKey,
    stream,
    signal,
  });
}

// Ollama streaming placeholder
async function* streamOllama({
  messages,
  model,
  apiKey,
  stream = true,
  signal = new AbortController().signal,
}: ProviderStreamParams): AsyncGenerator<string> {
  // TODO: Implement Ollama streaming here
  console.warn('⚠️ Ollama streaming not yet implemented.');
  yield '[Ollama Stream Placeholder]';
}
