// lib/orchestration/collaborationPipeline.ts

import {
    type AiChatMessage,
    type CollaborationState,
    type PipelineEvent,
    type PipelineParams,
    type StageEvent, // Assuming StageEvent from types.ts covers events from individual stages
    type Stage
} from './stages/types';
import { refineStage } from './stages/refineStage';
import { codegenStage } from './stages/codegenStage';
import { reviewStage } from './stages/reviewStage';
import { installStage } from './stages/installStage'; // <<< ENSURE THIS IMPORT IS PRESENT
import { extractCodeFromMarkdown } from '@/lib/utils/markdownParser';
import { parseReviewOutput } from '@/lib/utils/jsonParser'; // Assuming this is your correct path

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
    params: PipelineParams
): AsyncGenerator<PipelineEvent, void> {

    // console.log('[Pipeline Debug] Initializing. Refiner config apiKey:', params.refinerConfig.apiKey ? params.refinerConfig.apiKey.substring(0, 10) + '...' : 'undefined');
    // console.log('[Pipeline Debug] Worker 1 config apiKey:', params.worker1Config.apiKey ? params.worker1Config.apiKey.substring(0, 10) + '...' : 'undefined');
    // console.log('[Pipeline Debug] Worker 2 config apiKey:', params.worker2Config.apiKey ? params.worker2Config.apiKey.substring(0, 10) + '...' : 'undefined');

    const state: CollaborationState = {
        stage: 'initial',
        initialPrompt: params.prompt,
        refinedPrompt: '',
        currentTurn: 0,
        maxTurns: params.maxTurns ?? 6,
        projectFiles: {},
        requiredPackages: [],
        conversationHistory: [],
        currentWorker: 'w1', // Default to w1, refine stage will occur before first w1 turn if needed
        lastError: null,
        projectType: params.projectType,
        filename: params.filename,
        // Initialize missing properties
        revisionCountByFile: {},
        approvedFiles: [],
        pendingInstalls: [],
        // MAX_REVISIONS_PER_FILE: 3, // Example if you want to set a default
    };

    try {
        yield { type: 'pipeline_start', data: { initialState: { initialPrompt: state.initialPrompt, maxTurns: state.maxTurns } } };

        // --- REFINE STAGE ---
        state.stage = 'refining_prompt';
        yield { type: 'stage_change', data: { newStage: state.stage } };
        yield { type: 'status_update', data: { message: `🧠 Refining prompt...`, worker: 'refiner' } };

        let refineResult;
        try {
            refineResult = await refineStage(state.initialPrompt, params.refinerConfig);
            state.refinedPrompt = refineResult.refinedPrompt;
            state.conversationHistory.push(...refineResult.messages);
        } catch (error: any) {
            state.lastError = `Refine stage failed: ${error.message}`;
            state.stage = 'error'; // Set stage to error
            yield { type: 'pipeline_error', data: { message: state.lastError } };
            return; // Terminate pipeline
        }

        yield { type: 'prompt_refined', data: { refinedPrompt: state.refinedPrompt } };
        yield { type: 'status_update', data: { message: '✅ Refined prompt accepted. Starting collaboration turns...' } };

        let lastWorker1FullTextResponse = ""; // <<< CORRECTLY DECLARED HERE

        // --- CODING & REVIEW LOOP ---
        while (state.currentTurn < state.maxTurns && (state.stage as Stage) !== 'done' && (state.stage as Stage) !== 'error') {
            const currentFilename = state.filename || 'app/page.tsx';

            if (state.currentWorker === 'w1') {
                state.stage = 'coding_turn';
                yield { type: 'stage_change', data: { newStage: state.stage, message: `Turn ${state.currentTurn + 1} (Worker 1 Coding)` } };
                yield { type: 'status_update', data: { message: `🛠️ Worker 1 coding ${currentFilename}...`, worker: 'w1' } };

                let currentFileContent = state.projectFiles[currentFilename] || "";
                let tempAccumulatedW1Response = ""; // Scoped to W1 turn

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
                        } else if (step.type === 'codegen-code-chunk') { // If codegenStage yields specific code chunks
                            state.projectFiles[currentFilename] = (state.projectFiles[currentFilename] || "") + step.data.content;
                            tempAccumulatedW1Response += step.data.content;
                            yield { type: 'file_update', data: { filename: currentFilename, content: state.projectFiles[currentFilename] } };
                            yield { type: 'assistant_chunk', data: { worker: 'w1', chunk: step.data.content } };
                        } else if (step.type === 'codegen-complete') {
                            // Ensure tempAccumulatedW1Response has the full text if step.data.fullText isn't primary
                            lastWorker1FullTextResponse = step.data.fullText || tempAccumulatedW1Response; // <<< CORRECTLY ASSIGNED HERE
                            
                            const extractedCode = extractCodeFromMarkdown(lastWorker1FullTextResponse, 'tsx'); // or more generic language detection
                            if (extractedCode) {
                                state.projectFiles[currentFilename] = extractedCode;
                            } else if (lastWorker1FullTextResponse.trim()) { // Fallback if no code block but has content
                                console.warn(`[Pipeline] No .tsx code block found in Worker 1's response for ${currentFilename}. Using full response.`);
                                state.projectFiles[currentFilename] = lastWorker1FullTextResponse;
                            } else {
                                console.warn(`[Pipeline] Worker 1 returned empty response for ${currentFilename}.`);
                                // Optionally, do not update file if response is empty, or keep old content
                            }
                            // Always yield file_update if there's a change or new content
                            if (state.projectFiles[currentFilename] !== currentFileContent || !currentFileContent && state.projectFiles[currentFilename]) {
                                yield { type: 'file_update', data: { filename: currentFilename, content: state.projectFiles[currentFilename] } };
                            }
                            state.conversationHistory.push(...(step.data.messages || [])); // Add messages from codegen stage context
                        }
                    }
                    // Add the final accumulated response to history if not already done by codegen-complete messages
                    if (!state.conversationHistory.find(m => m.role === 'assistant' && m.name === 'w1' && m.content === lastWorker1FullTextResponse)) {
                         state.conversationHistory.push({ role: 'assistant', name: 'w1', content: lastWorker1FullTextResponse });
                    }
                    yield { type: 'assistant_done', data: { worker: 'w1' } };
                    yield { type: 'status_update', data: { message: '✅ Worker 1 finished coding.', worker: 'w1' } };
                    state.currentWorker = 'w2';

                } catch (error: any) {
                    state.lastError = `Worker 1 (Codegen) turn failed: ${error.message}`;
                    state.stage = 'error'; // Set stage to error
                    yield { type: 'pipeline_error', data: { message: state.lastError } };
                    return; // Terminate pipeline
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
                        worker1Response: lastWorker1FullTextResponse, // <<< CORRECTLY USED HERE
                        workerConfig: params.worker2Config,
                        projectType: state.projectType,
                    })) {
                        if (step.type === 'review-chunk') {
                            fullReviewTextW2 += step.data.content;
                            yield { type: 'assistant_chunk', data: { worker: 'w2', chunk: step.data.content } };
                        } else if (step.type === 'review-complete') {
                            fullReviewTextW2 = step.data.fullText || fullReviewTextW2; // Ensure full text is captured
                        }
                    }
                    state.conversationHistory.push({ role: 'assistant', name: 'w2', content: fullReviewTextW2 });
                    yield { type: 'assistant_done', data: { worker: 'w2' } };

                    // console.log("--- Worker 2 Raw Review Output START ---");
                    // console.log(fullReviewTextW2);
                    // console.log("--- Worker 2 Raw Review Output END ---");

                    const parsedReview = parseReviewOutput(fullReviewTextW2);
                    state.conversationHistory.push({ role: 'system', name: 'review_parser', content: `Parsed Review: Status - ${parsedReview.status}, Action - ${parsedReview.next_action_for_w1}, Issues - ${parsedReview.key_issues.join('; ')}` });
                    yield { type: 'status_update', data: { message: `Review Outcome: ${parsedReview.status}. Action for W1: ${parsedReview.next_action_for_w1}`, worker: 'system' } };

                    if (parsedReview.status === "APPROVED") {
                        yield { type: 'status_update', data: { message: `🎉 Worker 2 approved changes for ${currentFilename}.`, worker: 'system' } };
                        
                        // --- INSTALL STAGE ---
                        state.stage = 'installing_deps'; 
                        yield { type: 'stage_change', data: { newStage: state.stage } };
                        // installStage itself can yield an initial status update if desired.

                        try {
                            for await (const installStep of installStage({
                                conversationHistory: getTruncatedHistory(state.conversationHistory, state.refinedPrompt),
                                projectFiles: state.projectFiles,
                                workerConfig: params.worker1Config, 
                                refinedPrompt: state.refinedPrompt,
                                projectType: state.projectType,
                            })) {
                                if (installStep.type === 'install_command') {
                                    if (!state.requiredPackages.includes(installStep.data.command)) {
                                        state.requiredPackages.push(installStep.data.command);
                                    }
                                    yield { type: 'install_command_found', data: { command: installStep.data.command } };
                                } else if (installStep.type === 'install_analysis_complete') {
                                    yield { type: 'install_summary', data: { commands: installStep.data.commands } };
                                } else if (installStep.type === 'install_no_actions_needed') {
                                    yield { type: 'status_update', data: { message: '✅ No new package installations identified.', worker: 'system' } };
                                }
                            }
                        } catch (error: any) { 
                            state.lastError = `Install stage failed: ${error.message}`;
                            // Don't set state.stage = 'error' here if we want the pipeline to continue
                            yield { type: 'pipeline_error', data: { message: state.lastError } }; // Report error
                            console.warn(`[Pipeline] Install stage failed: ${state.lastError}. Continuing to next turn.`);
                            // If install stage fails, we still proceed to the next turn.
                        }
                        // --- END INSTALL STAGE ---

                        state.currentTurn++; 
                        state.currentWorker = 'w1'; 
                        if (state.currentTurn >= state.maxTurns) {
                            state.stage = 'done';
                        } else {
                            state.stage = 'coding_turn'; 
                        }

                    } else if (parsedReview.status === "REVISION_NEEDED" || parsedReview.status === "NEEDS_CLARIFICATION") {
                        yield { type: 'status_update', data: { message: `⚠️ Worker 2 requests revisions/clarification for ${currentFilename}. Worker 1 to address.`, worker: 'system' } };
                        state.currentWorker = 'w1'; 
                        state.stage = 'coding_turn';
                    } else { // UNKNOWN or ERROR_PARSING_JSON or ERROR_NO_JSON_FOUND
                        state.lastError = `Worker 2 review parsing error or unknown status: ${parsedReview.status} - ${(parsedReview as any).next_action_for_w1 || 'No action specified'}`;
                        state.stage = 'error'; // Set stage to error for unhandled review status
                        yield { type: 'pipeline_error', data: { message: state.lastError } };
                        return; // Terminate pipeline
                    }

                } catch (error: any) {
                    state.lastError = `Worker 2 (Review) turn failed: ${error.message}`;
                    state.stage = 'error'; // Set stage to error
                    yield { type: 'pipeline_error', data: { message: state.lastError } };
                    return; // Terminate pipeline
                }
            }
        } // End while loop

        // If loop finished due to maxTurns but not explicitly set to 'done' or 'error'
        if ((state.stage as Stage) !== 'error' && (state.stage as Stage) !== 'done') {
            state.stage = 'done';
        }
        // Yield final stage change only if it makes sense (e.g., if it became 'done')
        if (state.stage === 'done') {
            yield { type: 'stage_change', data: { newStage: state.stage, message: "Collaboration cycle complete." } };
        }
        
        yield { type: 'pipeline_finish', data: { finalState: { projectFiles: state.projectFiles, requiredPackages: state.requiredPackages } } };

    } catch (error: any) {
        console.error("[Pipeline] Unhandled Top-Level Error:", error);
        state.lastError = `Critical pipeline error: ${error.message}`;
        state.stage = 'error'; 
        yield { type: 'pipeline_error', data: { message: state.lastError } };
        yield { type: 'pipeline_finish', data: { finalState: { projectFiles: state.projectFiles, requiredPackages: state.requiredPackages } } }; // Ensure final state is sent even on top-level error
    }
}