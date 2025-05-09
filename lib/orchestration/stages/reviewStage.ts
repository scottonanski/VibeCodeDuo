// lib/orchestration/stages/reviewStage.ts

import type { ReviewStageParams, StageEvent, AiChatMessage } from './types'; // Assuming AiChatMessage is also in types.ts or imported
import { callLLMStream } from '@/lib/services/llmService';
import { parseReviewOutput } from '@/lib/utils/jsonParser';


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
  You are Worker 2 in a collaborative AI coding system. Your job is to critically review the code written by Worker 1 and return your findings in **strict JSON format**.
  
  ---
  🧠 **Your Responsibilities:**
  - Analyze the code quality, correctness, and alignment with the refined task.
  - Report any issues in clear, concise bullet points.
  - Decide whether the code is acceptable, needs revision, or requires clarification.
  
  ---
  📦 **Return format:**
  You MUST return **only** the following JSON object, wrapped in a \`\`\`json block:
  
  \`\`\`json
  {
    "status": "APPROVED" | "REVISION_NEEDED" | "NEEDS_CLARIFICATION",
    "key_issues": ["Describe each key issue in one sentence."],
    "next_action_for_w1": "A clear, direct instruction for what Worker 1 should do next."
  }
  \`\`\`
  
  ✅ **Rules**:
  - DO NOT include anything before or after the JSON block — no text, explanation, or formatting.
  - DO NOT add markdown headers, footers, or commentary.
  - DO NOT invent new status types.
  - DO NOT truncate your JSON. Ensure all brackets, quotes, and commas are present.
  - Double-check that it is valid JSON. Imagine a strict JSON parser will validate it.
  
  ---
  🎯 **Context for Your Review**:
  
  📝 **Refined Task:**
  ${refinedPrompt}
  
  📄 **File Being Reviewed:** \`${filename}\`
  
  💬 **Worker 1’s Explanation and Code:**
  ${worker1Response}
  
  🧾 **Current Content of \`${filename}\`:**
  \`\`\`tsx
  ${fileContent}
  \`\`\`
  
  Now return ONLY the JSON block. You are not allowed to say anything else.
  `.trim();
  // ^ ^ ^ ^ END OF NEW PROMPT ^ ^ ^ ^

  let fullText = '';

  const systemMessage: AiChatMessage = { // Explicitly type systemMessage
    role: 'system',
    content:
      "You are an AI assistant participating in a multi-turn code generation and review process. Pay close attention to the role assigned in the user prompt ('Worker 1' or 'Worker 2') and fulfill ONLY that role's specific task for the current turn. When asked to provide JSON,provide ONLY the JSON object wrapped in triple backticks as requested. If your response is cut off mid-JSON, or your JSON is not perfectly valid, the system will reject it. Be careful to include closing brackets, quotes, and required keys. Double-check before finalizing your response. Do not include any partial JSON. If unsure, recheck your output before sending."
      
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
      data: { fullText, messages },
    };
    
    const parsedReview = parseReviewOutput(fullText);
    
    yield {
      type: 'review_result_internal',
      data: parsedReview,
    };
    
  } catch (error: any) {
    console.error(`[reviewStage] Error during LLM call or streaming: ${error.message}`);
    // Re-throw the error so the main pipeline can catch it and yield a pipeline_error
    throw new Error(`Review stage failed: ${error.message}`);
  }
}