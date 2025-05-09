// lib/orchestration/stages/debateStage.ts

import { callLLMStream, extractJsonString } from '@/lib/services/llmService'; // Added extractJsonString
import type {
  AiChatMessage,
  DebateStageParams,
  StageEvent,
  StageInternalWorker, // Ensure this is used if yielding status_update for system
} from './types';

// processAgentStream helper remains as is, it's used for debater chunks.
// Summarizer chunks are handled directly in the main function for now.

interface DebateSummaryJSON {
  summaryText: string;
  agreedPlan?: string;
  options?: string[];
  requiresResolution: boolean;
}

export async function* debateStage(
  params: DebateStageParams
): AsyncGenerator<StageEvent, void> {
  const {
    refinedPrompt,
    conversationHistory, // This is the history *before* the debate starts
    debaterAConfig,
    debaterBConfig,
    summarizerConfig,
    maxTurnsPerAgent = 2, // Reduced for faster testing, can be increased
  } = params;

  yield { type: 'status_update', data: { message: '🎙️ Debate stage started.', worker: 'system' as StageInternalWorker } };

  const debateTranscript: AiChatMessage[] = []; // Use a fresh transcript for the debate itself

  // Add the refined prompt as the initial user message for the debate context
  debateTranscript.push({
    role: 'user',
    name: 'moderator', // Optional: name the user role for clarity in transcript
    content: `The core topic for debate, based on the refined prompt, is: "${refinedPrompt}"\n\nDebater A, please begin by proposing a plan or approach.`,
  });

  let turn = 1;
  // Total turns will be maxTurnsPerAgent for A + maxTurnsPerAgent for B
  const totalDebateTurns = maxTurnsPerAgent * 2;

  try {
    for (let i = 0; i < maxTurnsPerAgent; i++) {
      // --- Debater A's turn ---
      const currentAgentA: 'debaterA' = 'debaterA';
      yield { type: 'status_update', data: { message: `Debate Turn ${turn}/${totalDebateTurns} (Proposer): Debater A formulating...`, worker: 'system' as StageInternalWorker } };

      const debaterASystemMessage: AiChatMessage = {
        role: 'system',
        content: `You are Debater A, the Proposer. Your goal is to propose a clear, actionable plan or solution to address the user's refined prompt.
        Be specific about the steps, technologies (if applicable), and expected outcomes.
        The user's refined prompt is: "${refinedPrompt}"
        Review the debate history before formulating your response. If it's your first turn, propose an initial plan. Otherwise, respond to Debater B's critique, defend your proposal, or incorporate valid points to refine your plan.
        Keep your response focused and directly related to the debate topic. Address Debater B directly if responding to a critique.`,
      };
      const messagesForDebaterA: AiChatMessage[] = [debaterASystemMessage, ...debateTranscript];

      let fullTextA = '';
      const streamA = callLLMStream({
        provider: debaterAConfig.provider,
        model: debaterAConfig.model,
        apiKey: debaterAConfig.apiKey || '', // API key handling as per existing llmService
        messages: messagesForDebaterA,
        // stream: true is default in callLLMStream if not specified, but explicit is fine
      });

      for await (const chunk of streamA) {
        fullTextA += chunk;
        yield {
          type: 'debate_agent_chunk',
          data: { agent: currentAgentA, chunk },
        };
      }

      yield {
        type: 'debate_agent_message_complete',
        data: { agent: currentAgentA, fullText: fullTextA, turn: turn },
      };
      debateTranscript.push({ role: 'assistant', name: currentAgentA, content: fullTextA });
      turn++;

      // --- Debater B's turn ---
      if (i < maxTurnsPerAgent) { // Debater B also gets maxTurnsPerAgent turns
        const currentAgentB: 'debaterB' = 'debaterB';
        yield { type: 'status_update', data: { message: `Debate Turn ${turn}/${totalDebateTurns} (Critiquer): Debater B formulating...`, worker: 'system' as StageInternalWorker } };

        const debaterBSystemMessage: AiChatMessage = {
          role: 'system',
          content: `You are Debater B, the Critiquer. Your goal is to critically evaluate Debater A's proposal.
          Identify potential flaws, missing elements, alternative approaches, or areas for improvement. Be constructive.
          The user's refined prompt is: "${refinedPrompt}"
          Review the debate history, especially Debater A's latest proposal, before formulating your response.
          Address Debater A directly. Be specific in your critique and, if possible, suggest concrete improvements or alternatives.`,
        };
        const messagesForDebaterB: AiChatMessage[] = [debaterBSystemMessage, ...debateTranscript];

        let fullTextB = '';
        const streamB = callLLMStream({
          provider: debaterBConfig.provider,
          model: debaterBConfig.model,
          apiKey: debaterBConfig.apiKey || '',
          messages: messagesForDebaterB,
        });

        for await (const chunk of streamB) {
          fullTextB += chunk;
          yield {
            type: 'debate_agent_chunk',
            data: { agent: currentAgentB, chunk },
          };
        }

        yield {
          type: 'debate_agent_message_complete',
          data: { agent: currentAgentB, fullText: fullTextB, turn: turn },
        };
        debateTranscript.push({ role: 'assistant', name: currentAgentB, content: fullTextB });
        turn++;
      }
    }
  } catch (error: any) {
    console.error(`[DebateStage] Error during debate turns:`, error);
    yield { type: 'status_update', data: { message: `Error during debate: ${error.message}`, worker: 'system' as StageInternalWorker } };
    // Optionally yield a specific error event or rethrow to be caught by pipeline
    // For now, we'll let summarization try with what it has, or fail there.
    // Depending on severity, might want to return early from the stage.
    // For now, we will try to summarize what we have.
  }


  // --- Summarization phase ---
  yield { type: 'status_update', data: { message: '📋 Summarizing debate and extracting plan...', worker: 'system' as StageInternalWorker } };

  // *** MODIFIED Summarizer System Prompt for JSON output ***
  const summarizerSystemMessage: AiChatMessage = {
    role: 'system',
    content: `You are a Debate Summarizer and Action Planner.
Your task is to analyze the provided debate transcript and produce a structured JSON output.
The JSON object MUST conform to the following structure:
{
  "summaryText": "A concise summary of the entire debate, highlighting key arguments, points of contention, and resolutions if any.",
  "agreedPlan": "If a clear, actionable plan was agreed upon or emerged as the strongest proposal, describe it here. This plan will be used for subsequent development. If no single plan is agreed, this can be null or a very brief statement of the primary disagreement.",
  "options": ["If multiple distinct viable options or unresolved significant disagreements remain, list them as strings in this array. If an agreedPlan exists, this array can be empty or list minor alternatives considered.", "Another option..."],
  "requiresResolution": true/false // Set to true if there are significant unresolved disagreements or if no clear agreedPlan emerged. Set to false if a clear plan is present and major disagreements are resolved.
}
Respond ONLY with the valid JSON object. Do NOT include any explanatory text, markdown formatting (like \`\`\`json), or any other characters before or after the JSON object.
The user's initial refined prompt was: "${refinedPrompt}"
Debate Transcript follows.`,
  };

  // The full conversation history for the summarizer should include the initial prompt and the debate transcript.
  const summarizerMessages: AiChatMessage[] = [
    summarizerSystemMessage,
    { role: 'user', name: 'moderator', content: `Refined Prompt: "${refinedPrompt}"\n\nFull Debate Transcript:\n${debateTranscript.map(m => `${m.name || m.role}: ${m.content}`).join('\n\n')}` }
  ];

  let rawSummaryOutput = '';
  try {
    const summarizerStream = callLLMStream({
      provider: summarizerConfig.provider,
      model: summarizerConfig.model,
      apiKey: summarizerConfig.apiKey || '',
      messages: summarizerMessages,
      // stream: true, // Ensure summarizer also streams if desired for UX
    });

    for await (const chunk of summarizerStream) {
      rawSummaryOutput += chunk;
      yield {
        type: 'debate_summary_chunk',
        data: { chunk: chunk }, // No 'agent' field in StageEvent for summary chunk
      };
    }

    // --- Parse the summary ---
    let parsedSummary: DebateSummaryJSON | null = null;
    const jsonString = extractJsonString(rawSummaryOutput);

    if (jsonString) {
      try {
        parsedSummary = JSON.parse(jsonString) as DebateSummaryJSON;
        // Basic validation
        if (typeof parsedSummary.summaryText !== 'string' ||
            typeof parsedSummary.requiresResolution !== 'boolean' ||
            !Array.isArray(parsedSummary.options)) {
              console.warn('[DebateStage] Parsed summary JSON has incorrect structure.', parsedSummary);
              parsedSummary = null; // Invalidate if structure is wrong
            }
      } catch (e) {
        console.error('[DebateStage] Failed to parse summary JSON:', e, "\nRaw JSON string:", jsonString);
        rawSummaryOutput = `Summarizer Error: Failed to parse JSON output. Raw output: ${rawSummaryOutput}`; // Keep raw output for debugging
      }
    } else {
        console.warn('[DebateStage] No JSON string extracted from summarizer output. Raw output:', rawSummaryOutput);
        rawSummaryOutput = `Summarizer Error: No JSON extracted. Raw output: ${rawSummaryOutput}`;
    }

    // Fallback if parsing failed or no JSON
    const finalSummaryData = parsedSummary || {
        summaryText: rawSummaryOutput, // Show raw output if parsing failed, prefixed with error.
        agreedPlan: undefined, // Or use refinedPrompt as a fallback plan
        options: [],
        requiresResolution: true, // Assume resolution is required if parsing fails
    };
    // Ensure agreedPlan falls back to refinedPrompt if it's empty and no options provided,
    // and resolution is not required. This logic might be better in the pipeline.
    // For now, scaffoldStage will handle refinedPrompt fallback.

    yield {
      type: 'debate_result_summary',
      data: {
        summaryText: finalSummaryData.summaryText,
        fullTranscript: debateTranscript, // The transcript of the actual debate
        agreedPlan: finalSummaryData.agreedPlan,
        options: finalSummaryData.options,
        requiresResolution: finalSummaryData.requiresResolution,
      },
    };

  } catch (error: any) {
    console.error('[DebateStage] Error during summarization phase:', error);
    yield { type: 'status_update', data: { message: `Error during debate summarization: ${error.message}`, worker: 'system' as StageInternalWorker } };
    // Yield a fallback summary result if summarization itself fails catastrophically
    yield {
      type: 'debate_result_summary',
      data: {
        summaryText: `Debate summarization failed: ${error.message}. Transcript is available.`,
        fullTranscript: debateTranscript,
        agreedPlan: undefined, // No plan if summarizer failed
        options: [],
        requiresResolution: true,
      },
    };
    return; // Exit stage if summarization fails critically
  }

  yield { type: 'status_update', data: { message: '✅ Debate stage completed.', worker: 'system' as StageInternalWorker } };
}

// ================================================================================
// FILE EXPLANATION: lib/orchestration/stages/debateStage.ts
// ================================================================================
//
// This file defines the "debateStage" for the VibeCodeDuo collaboration pipeline.
// Its primary purpose is to facilitate a structured debate between two AI agents
// (Debater A - Proposer, and Debater B - Critiquer) to refine and agree upon a
// development plan before any code project scaffolding or code generation begins.
//
// Key Functionalities:
//
// 1. Initialization:
//    - Receives parameters (`DebateStageParams`) including the `refinedPrompt` (the
//      topic of debate), AI configurations for Debater A, Debater B, and a
//      Summarizer, and the conversation history leading up to this stage.
//    - Emits status updates to the pipeline/UI indicating the start of the stage.
//
// 2. Debate Turns:
//    - Manages a series of turns where Debater A proposes solutions or plans
//      based on the `refinedPrompt`, and Debater B critiques these proposals,
//      suggesting improvements or alternatives.
//    - Each debater is provided with a specific system prompt defining its role
//      and objectives, along with the current debate transcript for context.
//    - For each turn, it calls the `callLLMStream` service to get responses from
//      the respective AI debater.
//    - Streams `debate_agent_chunk` events for real-time display of the
//      debaters' thoughts.
//    - Emits a `debate_agent_message_complete` event when a debater finishes
//      its turn, including the full text and turn number.
//    - Accumulates the debate dialogue in a `debateTranscript`.
//    - Handles potential errors during individual debater turns.
//
// 3. Summarization and Plan Extraction:
//    - After the debate turns are complete, it invokes a Summarizer AI.
//    - The Summarizer is given a specialized system prompt instructing it to:
//      a. Analyze the entire `debateTranscript` and the original `refinedPrompt`.
//      b. Produce a concise summary of the debate.
//      c. Identify an `agreedPlan` if one emerges from the debate.
//      d. List any alternative `options` or unresolved issues.
//      e. Determine if the outcome `requiresResolution` (i.e., if no clear plan
//         was agreed upon or significant disagreements remain).
//      f. Output this information strictly as a JSON object.
//    - Streams `debate_summary_chunk` events as the summarizer generates its response.
//    - Uses `extractJsonString` (from `llmService`) and `JSON.parse` to process
//      the Summarizer's output into a structured `DebateSummaryJSON` object.
//
// 4. Result Emission:
//    - Yields a final `debate_result_summary` StageEvent. This event contains:
//      - `summaryText`: The textual summary from the Summarizer.
//      - `fullTranscript`: The complete record of the debate dialogue.
//      - `agreedPlan` (optional): The actionable plan derived from the debate.
//      - `options` (optional): Alternative plans or unresolved points.
//      - `requiresResolution`: A boolean indicating if further human or AI
//        intervention is needed to finalize the plan.
//    - Provides fallback mechanisms if JSON parsing fails, ensuring a
//      `debate_result_summary` is always emitted, even if it's just to report
//      an error and provide the raw output or transcript.
//
// 5. Completion:
//    - Emits a final status update indicating the completion of the debate stage.
//
// Overall Goal within the Pipeline:
// The `debateStage` aims to improve the quality and robustness of the initial
// development plan by subjecting it to critical review and discussion by AI
// agents *before* committing to code generation. The `agreedPlan` (or options)
// from this stage is intended to be the primary input for the subsequent
// `scaffoldStage`.
//
// Dependencies:
// - `callLLMStream` and `extractJsonString` from `lib/services/llmService.ts` for
//   interacting with LLMs and processing their responses.
// - Type definitions from `./types.ts`.
//
// Event Yielding:
// This stage is an async generator, yielding `StageEvent` objects:
// - `status_update`
// - `debate_agent_chunk`
// - `debate_agent_message_complete`
// - `debate_summary_chunk`
// - `debate_result_summary`
// These events are consumed by `collaborationPipeline.ts` and re-yielded as
// `PipelineEvent`s for the frontend.
//