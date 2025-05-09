// lib/orchestration/stages/scaffoldStage.ts

import type { StageEvent, ScaffoldStageParams } from './types';
import { callLLMStream } from '@/lib/services/llmService';
import { extractJsonString } from '@/lib/services/llmService';

type ScaffoldItem =
  | { type: 'folder'; path: string }
  | { type: 'file'; path: string; content: string };

// Type guard to validate scaffold items (can be enhanced for stricter validation)
function isScaffoldItem(item: any): item is ScaffoldItem {
  return !!item &&
    typeof item.type === 'string' &&
    typeof item.path === 'string' &&
    (item.type === 'folder' || (item.type === 'file' && typeof item.content === 'string')); // Ensure content is string for files
}

export async function* scaffoldStage({
  refinedPrompt, // This is the initialPrompt passed from collaborationPipeline for scaffold
  workerConfig
}: ScaffoldStageParams): AsyncGenerator<StageEvent, void> {
  // --- REFINED SYSTEM PROMPT ---
  const systemPrompt = `
You are an AI file structure generator. Your sole task is to output a valid JSON array representing a project's initial file and folder structure.
DO NOT output any text, explanations, apologies, or markdown formatting before or after the JSON array.
The response MUST be ONLY a JSON array.

Each item in the JSON array must be an object with one of the following structures:
1. For a folder: { "type": "folder", "path": "path/to/folder" }
2. For a file:   { "type": "file", "path": "path/to/file.ext", "content": "initial file content or empty string" }

Example of a valid response:
[
  { "type": "folder", "path": "src" },
  { "type": "folder", "path": "src/components" },
  { "type": "file", "path": "src/index.js", "content": "// Main entry point" },
  { "type": "file", "path": "src/components/Button.js", "content": "// Button component" }
]

If the user's request is unclear or too complex for a simple scaffold, provide a very minimal structure (e.g., one main file like "app/page.tsx" or "index.html").
Base the entry point (e.g., "app/page.tsx" for Next.js, "src/App.tsx" for React, "public/index.html" for static) on common conventions if the project type is hinted at.
Ensure all paths use forward slashes (/).
The "content" for files can be an empty string "" if no specific starter content is appropriate.
Your entire response must be parsable by JSON.parse().
`.trim();

  const userMessage = `Based on the following user request, generate the project scaffold JSON:
User Request: "${refinedPrompt}"`.trim();

  yield {
    type: 'status_update',
    data: { message: `[ScaffoldStage] Calling LLM with prompt for user request: "${refinedPrompt.substring(0, 50)}..."`, worker: 'system' }
  };

  const stream = await callLLMStream({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    model: workerConfig.model,
    provider: workerConfig.provider,
    apiKey: (() => {
      if (!workerConfig.apiKey) {
        throw new Error('[scaffoldStage] Missing API key in workerConfig. Cannot generate scaffold.');
      }
      return workerConfig.apiKey;
    })(),
  });

  let rawOutputAccumulator = '';
  for await (const chunk of stream) {
    if (typeof chunk === 'string') {
      rawOutputAccumulator += chunk;
    }
  }
  const finalRawOutput: string = rawOutputAccumulator.trim();

  // --- LOGGING RAW LLM OUTPUT ---
  console.log("--- [ScaffoldStage] Raw LLM Output START ---");
  console.log(finalRawOutput);
  console.log("--- [ScaffoldStage] Raw LLM Output END ---");
  // --- END LOGGING ---

  const extractedJsonString: string | null = extractJsonString(finalRawOutput);

  let scaffold: ScaffoldItem[] = [];
  try {
    if (extractedJsonString && extractedJsonString.trim() !== '') {
      const parsedJson = JSON.parse(extractedJsonString);
      if (Array.isArray(parsedJson)) {
        // Filter for valid items and type assert after filtering
        scaffold = parsedJson.filter(isScaffoldItem) as ScaffoldItem[];
        if (scaffold.length !== parsedJson.length) {
            yield {
                type: 'status_update',
                data: { message: `[ScaffoldStage] Warning: Some items in the scaffold JSON were invalid and have been filtered out.`, worker: 'system' }
            };
        }
      } else {
        throw new Error("Parsed JSON is not an array.");
      }
    } else {
      scaffold = [];
      yield {
        type: 'status_update',
        data: { message: `[ScaffoldStage] No valid JSON scaffold structure found in LLM response or response was empty. Proceeding with an empty scaffold. Raw Output was: "${finalRawOutput.substring(0,100)}..."`, worker: 'system' }
      };
    }
  } catch (err: any) {
    yield {
      type: 'status_update',
      data: { message: `[ScaffoldStage] Could not parse scaffold JSON: ${err.message}. Attempted to parse: "${extractedJsonString?.slice(0, 200) ?? 'null'}"`, worker: 'system' }
    };
    return; // Stop further processing if JSON is unparseable
  }

  if (!Array.isArray(scaffold)) { // Should be redundant due to above check, but good for safety
    yield {
        type: 'status_update',
        data: { message: `[ScaffoldStage] Critical error: Scaffold data is not an array after parsing. Content: "${String(extractedJsonString).slice(0,100)}"`, worker: 'system' }
    };
    return;
  }

  if (scaffold.length === 0 && extractedJsonString && extractedJsonString.trim() !== '') {
    // This case means JSON was valid and an array, but it was empty or all items were filtered out.
    yield {
      type: 'status_update',
      data: { message: `[ScaffoldStage] LLM provided an empty or invalid scaffold array. No files or folders will be created.`, worker: 'system' }
    };
  }

  for (const item of scaffold) {
    // isScaffoldItem already called via filter, but keeping for explicitness if filter removed
    if (item.type === 'folder') {
        yield { type: 'folder_create', data: { path: item.path } };
    } else if (item.type === 'file') {
        // item.content is already validated by isScaffoldItem to be a string
        yield {
            type: 'file_create',
            data: { path: item.path, content: item.content }
        };
    }
  }

  if (scaffold.length > 0) {
    yield {
        type: 'status_update',
        data: { message: `[ScaffoldStage] ${scaffold.length} scaffold items processed.`, worker: 'system' }
    };
  }
  // The "Scaffold stage completed successfully" message is now emitted by collaborationPipeline.ts after this stage finishes.
}