// lib/services/llmService.ts

import type { AiChatMessage } from '@/lib/orchestration/stages/types';
import { fetchChatCompletion } from './ai-service';  // Ensure this import is correct

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
  yield '[Ollama Stream Placeholder]'; // This should be valid JSON if it's to be parsed
}

/**
 * Extracts a JSON string from a response text.
 * Priority:
 * 1. JSON within ```json ... ``` markdown block.
 * 2. The entire responseText if it's valid JSON (array or object).
 * 3. Fallback: Braces matching (less reliable).
 */
export function extractJsonString(responseText: string | null | undefined): string | null {
  if (!responseText || typeof responseText !== 'string' || responseText.trim() === '') {
    return null;
  }

  const trimmedResponse = responseText.trim();

  // 1. Attempt to find JSON within ```json ... ``` markdown block
  const markdownMatch = trimmedResponse.match(/```json\s*([\s\S]*?)\s*```/);
  if (markdownMatch && markdownMatch[1]) {
    const potentialJson = markdownMatch[1].trim();
    try {
      JSON.parse(potentialJson); // Validate
      return potentialJson;
    } catch (err) {
      console.warn("extractJsonString: Found ```json block, but content is invalid JSON:", err);
      // Continue to other methods if this fails
    }
  }

  // 2. Attempt to parse the entire trimmed responseText as JSON
  // This handles cases where the LLM returns a raw JSON array or object without markdown
  if (trimmedResponse.startsWith('[') && trimmedResponse.endsWith(']')) { // Likely a JSON array
    try {
      JSON.parse(trimmedResponse); // Validate
      return trimmedResponse;
    } catch (err) {
      console.warn("extractJsonString: Response looked like an array, but failed to parse:", err);
      // Continue to fallback if this fails
    }
  } else if (trimmedResponse.startsWith('{') && trimmedResponse.endsWith('}')) { // Likely a JSON object
     try {
      JSON.parse(trimmedResponse); // Validate
      return trimmedResponse;
    } catch (err) {
      console.warn("extractJsonString: Response looked like an object, but failed to parse:", err);
      // Continue to fallback if this fails
    }
  }


  // 3. Fallback: Try to recover partial JSON with brace matching (less reliable)
  // This is the original heuristic, now a last resort.
  const firstBrace = trimmedResponse.indexOf("{");
  const lastBrace = trimmedResponse.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const possibleJsonSubstring = trimmedResponse.substring(firstBrace, lastBrace + 1);
    try {
      JSON.parse(possibleJsonSubstring); // Validate
      return possibleJsonSubstring;
    } catch (err) {
      // This warning might be noisy if the above methods already failed, but can be useful.
      // console.warn("extractJsonString (fallback): Found braces but content is invalid JSON:", err);
    }
  }

  console.warn("extractJsonString: Could not find or parse valid JSON from the response.");
  return null; // If no valid JSON found by any method
}

// Export fetchChatCompletion if needed elsewhere
export { fetchChatCompletion };