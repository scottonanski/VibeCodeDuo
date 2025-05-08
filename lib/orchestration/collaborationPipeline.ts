// lib/orchestration/collaborationPipeline.ts

import {
    type AiChatMessage,
    type CollaborationState,
    type PipelineEvent,
    // Ensure this is imported
    type PipelineParams,
    // Import if stages yield their own events that pipeline re-yields
    type StageEvent
} from './stages/types';
import { refineStage } from './stages/refineStage';
import { codegenStage } from './stages/codegenStage';
import { reviewStage } from './stages/reviewStage';
import { extractCodeFromMarkdown } from '@/lib/utils/markdownParser';
// Parse the review output from Worker 2
import { parseReviewOutput } from '@/lib/utils/jsonParser';
import type { Stage } from './stages/types';


// Helper: Sliding window for conversation history
function getTruncatedHistory(history: AiChatMessage[], refinedPrompt: string): AiChatMessage[] {
    const result: typeof history = [];
    // always keep first (system) message
    if (history.length > 0) result.push(history[0]);
    // Find first refined prompt message
    const refinedPromptMsg = history.find(m => typeof m.content === 'string' && m.content.includes(refinedPrompt));
    if (refinedPromptMsg && !result.includes(refinedPromptMsg)) result.push(refinedPromptMsg);
    // Add last 6 (excluding already added)
    const lastN = 6;
    const tail = history.slice(-lastN).filter(m => !result.includes(m));
    result.push(...tail);
    return result;
}

export async function* collaborationPipeline(
    // Accept the whole params object
    params: PipelineParams
): AsyncGenerator<PipelineEvent, void> {

    console.log('[Pipeline Debug] Initializing. Refiner config apiKey:', params.refinerConfig.apiKey ? params.refinerConfig.apiKey.substring(0, 10) + '...' : 'undefined');
    console.log('[Pipeline Debug] Worker 1 config apiKey:', params.worker1Config.apiKey ? params.worker1Config.apiKey.substring(0, 10) + '...' : 'undefined');
    console.log('[Pipeline Debug] Worker 2 config apiKey:', params.worker2Config.apiKey ? params.worker2Config.apiKey.substring(0, 10) + '...' : 'undefined');

    const state: CollaborationState = {
        stage: 'initial',
        initialPrompt: params.prompt,
        refinedPrompt: '',
        currentTurn: 0,
        maxTurns: params.maxTurns ?? 6,
        projectFiles: {},
        requiredPackages: [],
        conversationHistory: [],
        currentWorker: 'w1',
        lastError: null,
        projectType: params.projectType,
        // Store current target filename in state
        filename: params.filename,
    };

    try {
        yield { type: 'pipeline_start', data: { initialState: { initialPrompt: state.initialPrompt, maxTurns: state.maxTurns } } };

        // --- REFINE STAGE ---
        state.stage = 'refining_prompt';
        yield { type: 'stage_change', data: { newStage: state.stage } };
        yield { type: 'status_update', data: { message: `🧠 Refining prompt...`, worker: 'refiner' } };

        let refineResult;
        try {
            // refineStage is an async function that returns a promise, not a generator itself for simple case
            refineResult = await refineStage(state.initialPrompt, params.refinerConfig);
            state.refinedPrompt = refineResult.refinedPrompt;
            // Messages from refiner interaction
            state.conversationHistory.push(...refineResult.messages);
        } catch (error: any) {
            state.lastError = `Refine stage failed: ${error.message}`;
            yield { type: 'pipeline_error', data: { message: state.lastError } };
            return;
        }

        yield { type: 'prompt_refined', data: { refinedPrompt: state.refinedPrompt } };
        yield { type: 'status_update', data: { message: '✅ Refined prompt accepted. Starting collaboration turns...' } };

        // To pass W1's full text to W2
        let lastWorker1FullTextResponse = ''; 

        // --- CODING & REVIEW LOOP ---
        // TypeScript may warn about unreachable cases, but these are included for future safety and robustness.
        while (state.currentTurn < state.maxTurns && (state.stage as Stage) !== 'done' && (state.stage as Stage) !== 'error') {
            // Ensure filename is available
            const currentFilename = state.filename || 'app/page.tsx';

            if (state.currentWorker === 'w1') {
                state.stage = 'coding_turn';
                yield { type: 'stage_change', data: { newStage: state.stage, message: `Turn ${state.currentTurn + 1} (Worker 1 Coding)` } };
                yield { type: 'status_update', data: { message: `🛠️ Worker 1 coding ${currentFilename}...`, worker: 'w1' } };

                let currentFileContent = state.projectFiles[currentFilename] || "";
                // Accumulate chunks for W1's full text
                let tempAccumulatedW1Response = "";

                try {
                    for await (const step of codegenStage({
                        filename: currentFilename,
                        refinedPrompt: state.refinedPrompt,
                        conversationHistory: getTruncatedHistory(state.conversationHistory, state.refinedPrompt),
                        currentCode: currentFileContent,
                        workerConfig: params.worker1Config,
                        projectType: state.projectType,
                    })) {
                        if (step.type === 'codegen-chunk') {
                            tempAccumulatedW1Response += step.data.content;
                            yield { type: 'assistant_chunk', data: { worker: 'w1', chunk: step.data.content } };
                            // If codegenStage yields specific code chunks
                        } else if (step.type === 'codegen-code-chunk') {
                            state.projectFiles[currentFilename] = (state.projectFiles[currentFilename] || "") + step.data.content;
                            // Assume code is also part of response
                            tempAccumulatedW1Response += step.data.content;
                            yield { type: 'file_update', data: { filename: currentFilename, content: state.projectFiles[currentFilename] } };
                            yield { type: 'assistant_chunk', data: { worker: 'w1', chunk: step.data.content } };
                        } else if (step.type === 'codegen-complete') {
                            lastWorker1FullTextResponse = step.data.fullText || tempAccumulatedW1Response;
                            // Adjust lang if needed
                            const extractedCode = extractCodeFromMarkdown(lastWorker1FullTextResponse, 'tsx');
                            if (extractedCode) {
                                state.projectFiles[currentFilename] = extractedCode;
                                yield { type: 'file_update', data: { filename: currentFilename, content: extractedCode } };
                            } else {
                                console.warn(`[Pipeline] No .tsx code block found in Worker 1's response for ${currentFilename}. Storing full response as file content.`);
                                // Fallback: Store the entire response if no specific code block found, or handle as error
                                // state.projectFiles[currentFilename] = lastWorker1FullTextResponse;
                                // yield { type: 'file_update', data: { filename: currentFilename, content: lastWorker1FullTextResponse }};
                            }
                            state.conversationHistory.push(...(step.data.messages || []));
                        }
                    }
                    state.conversationHistory.push({ role: 'assistant', name: 'w1', content: lastWorker1FullTextResponse });
                    yield { type: 'assistant_done', data: { worker: 'w1' } };
                    yield { type: 'status_update', data: { message: '✅ Worker 1 finished coding.', worker: 'w1' } };
                    state.currentWorker = 'w2'; // Switch to Worker 2 for review

                } catch (error: any) {
                    state.lastError = `Worker 1 (Codegen) turn failed: ${error.message}`;
                    yield { type: 'pipeline_error', data: { message: state.lastError } };
                    return;
                }

            } else if (state.currentWorker === 'w2') {
                state.stage = 'reviewing_turn';
                yield { type: 'stage_change', data: { newStage: state.stage, message: `Turn ${state.currentTurn + 1} (Worker 2 Reviewing)` } };
                yield { type: 'status_update', data: { message: `🔎 Worker 2 reviewing ${currentFilename}...`, worker: 'w2' } };

                let fullReviewTextW2 = "";

                try {
                    for await (const step of reviewStage({
                        filename: currentFilename,
                        refinedPrompt: state.refinedPrompt,
                        conversationHistory: getTruncatedHistory(state.conversationHistory, state.refinedPrompt),
                        projectFiles: state.projectFiles,
                        worker1Response: lastWorker1FullTextResponse,
                        workerConfig: params.worker2Config,
                        projectType: state.projectType,
                    })) {
                        if (step.type === 'review-chunk') {
                            fullReviewTextW2 += step.data.content;
                            yield { type: 'assistant_chunk', data: { worker: 'w2', chunk: step.data.content } };
                        } else if (step.type === 'review-complete') {
                            fullReviewTextW2 = step.data.fullText || fullReviewTextW2;
                        }
                    }
                    state.conversationHistory.push({ role: 'assistant', name: 'w2', content: fullReviewTextW2 });
                    yield { type: 'assistant_done', data: { worker: 'w2' } };

                    console.log("--- Worker 2 Raw Review Output START ---");
                    console.log(fullReviewTextW2);
                    console.log("--- Worker 2 Raw Review Output END ---");

                    // Parse Worker 2's JSON review
                    const parsedReview = parseReviewOutput(fullReviewTextW2);
                    state.conversationHistory.push({ role: 'system', content: `Worker 2 Review Parsed: Status - ${parsedReview.status}, Action - ${parsedReview.next_action_for_w1}, Issues - ${parsedReview.key_issues.join('; ')}` });
                    yield { type: 'status_update', data: { message: `Review Outcome: ${parsedReview.status}. Action: ${parsedReview.next_action_for_w1}`, worker: 'system' } };

                    if (parsedReview.status === "APPROVED") {
                        yield { type: 'status_update', data: { message: `🎉 Worker 2 approved changes for ${currentFilename}.`, worker: 'system' } };
                        state.currentTurn++; // This turn (W1 code + W2 approve) is complete
                        state.currentWorker = 'w1'; // Next turn starts with W1 coding
                        // Potentially change filename or end if maxTurns for overall project reached
                        if (state.currentTurn >= state.maxTurns) state.stage = 'done';
                        else state.stage = 'coding_turn'; // Or a new stage to pick next file/task

                    } else if (parsedReview.status === "REVISION_NEEDED" || parsedReview.status === "NEEDS_CLARIFICATION") {
                        yield { type: 'status_update', data: { message: `⚠️ Worker 2 requests revisions/clarification for ${currentFilename}. Worker 1 to address.`, worker: 'system' } };
                        state.currentWorker = 'w1'; // Worker 1 needs to code again based on feedback
                        state.stage = 'coding_turn';
                        // Note: state.currentTurn does NOT necessarily increment here.
                        // It's a sub-iteration of the same conceptual "task turn".
                        // Or, if you want each W1/W2 interaction to be a turn, then increment.
                        // For now, let's assume it's a revision of the current turn.
                    } else { // UNKNOWN or ERROR_PARSING_JSON or ERROR_NO_JSON_FOUND
                        state.lastError = `Worker 2 review parsing error or unknown status: ${parsedReview.status} - ${parsedReview.next_action_for_w1}`;
                        yield { type: 'pipeline_error', data: { message: state.lastError } };
                        return; // Stop pipeline
                    }

                } catch (error: any) {
                    state.lastError = `Worker 2 (Review) turn failed: ${error.message}`;
                    yield { type: 'pipeline_error', data: { message: state.lastError } };
                    return;
                }
            }
        } // End while loop

        // TypeScript may warn about unreachable cases, but this is intentional for robustness.
        if ((state.stage as Stage) !== 'error') {
            state.stage = 'done';
            yield { type: 'stage_change', data: { newStage: state.stage, message: "Collaboration cycle complete." } };
        }
        yield { type: 'pipeline_finish', data: { finalState: { projectFiles: state.projectFiles, requiredPackages: state.requiredPackages } } };

    } catch (error: any) {
        console.error("[Pipeline] Unhandled Top-Level Error:", error);
        // This catch is for errors outside the main while loop, e.g., in initial setup or refineStage if not caught internally
        state.lastError = `Critical pipeline error: ${error.message}`;
        state.stage = 'error'; // Ensure stage is set to error
        yield { type: 'pipeline_error', data: { message: state.lastError } };
        yield { type: 'pipeline_finish', data: { finalState: { projectFiles: state.projectFiles, requiredPackages: state.requiredPackages } } };
    }
}