// lib/orchestration/stages/reviewStage.ts

import type { ReviewStageParams, StageEvent, AiChatMessage } from './types'; // Assuming AiChatMessage is also in types.ts or imported
import { callLLMStream } from '@/lib/services/llmService';

export async function* reviewStage({
  filename,
  refinedPrompt,
  conversationHistory,
  projectFiles,
  worker1Response,
}: ReviewStageParams): AsyncGenerator<StageEvent, void> {
  const fileContent = projectFiles[filename] ?? '// (empty file)';

  const apiKey = process.env.OPENAI_API_KEY_WORKER2; // Or however you get your Worker 2 API key
  if (!apiKey) {
    console.error('Missing API key for Worker 2 in reviewStage');
    // Throw an error. The main collaborationPipeline will catch this.
    throw new Error('Configuration error: Missing API key for Worker 2. Cannot proceed with review.');
  }

  // V V V V  NEW PROMPT FROM CHATGPT V V V V
  const userPrompt = `
Review the following code provided by Worker 1. Your review should include:
- An overall assessment status: [APPROVED | REVISION_NEEDED | NEEDS_CLARIFICATION]
- A list of key issues (if any) that need to be addressed, presented as a list of short, actionable points.
- A specific action or next step for Worker 1 (e.g., "Refactor function X" or "Pause for user input").

Ensure your entire response is **ONLY** the valid JSON object described above, without any additional text before or after it. 

Please wrap the JSON object in triple backticks like so:

\`\`\`json
{
  "status": "[status]",
  "key_issues": ["[issue1]", "[issue2]", ...],
  "next_action_for_w1": "[action]"
}
\`\`\`

Your response should be a clear and structured JSON object that can be parsed to guide the next steps in the collaboration.

---
**Context for your review:**

**Refined Overall Task:**
${refinedPrompt}

**Current File Being Worked On:** ${filename}

**Worker 1's Last Response (Code + Explanation that you are reviewing):**
${worker1Response}

**Current Code in ${filename} (from project state, for reference):**
\`\`\`tsx
${fileContent}
\`\`\`
---
Now, provide your review in the specified JSON format:
`.trim();
  // ^ ^ ^ ^ END OF NEW PROMPT ^ ^ ^ ^

  let fullText = '';

  const systemMessage: AiChatMessage = { // Explicitly type systemMessage
    role: 'system',
    content:
      "You are an AI assistant participating in a multi-turn code generation and review process. Pay close attention to the role assigned in the user prompt ('Worker 1' or 'Worker 2') and fulfill ONLY that role's specific task for the current turn. When asked to provide JSON, provide ONLY the JSON object wrapped in triple backticks as requested."
  };

  // Wrap the callLLMStream in a try...catch if it can throw errors you want to handle within the stage
  try {
    const messages: AiChatMessage[] = [
      systemMessage,
      ...conversationHistory,
      { role: 'user', content: userPrompt },
    ];
    for await (const chunk of callLLMStream({
      messages,
      model: 'gpt-4.1-nano-2025-04-14',
      provider: 'openai',
      apiKey,
      stream: true,
    })) {
      fullText += chunk;
      yield {
        type: 'review-chunk',
        data: { content: chunk },
      };
    }

    yield {
      type: 'review-complete',
      data: { fullText, messages }, // Include messages to match StageEventDataMap type
    };


  } catch (error: any) {
    console.error(`[reviewStage] Error during LLM call or streaming: ${error.message}`);
    // Re-throw the error so the main pipeline can catch it and yield a pipeline_error
    throw new Error(`Review stage failed: ${error.message}`);
  }
}