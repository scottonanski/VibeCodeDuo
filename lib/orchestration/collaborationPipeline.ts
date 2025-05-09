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
import { installStage } from './stages/installStage';
import { extractCodeFromMarkdown } from '@/lib/utils/markdownParser';
import { parseReviewOutput } from '@/lib/utils/jsonParser'; // Assuming this is your correct path
import { scaffoldStage } from './stages/scaffoldStage';  // <<< scaffoldStage is imported


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
        filename: params.filename,
        revisionCountByFile: {},
        approvedFiles: [],
        pendingInstalls: [],
    };

    try {
        yield { type: 'pipeline_start', data: { initialState: { initialPrompt: state.initialPrompt, maxTurns: state.maxTurns } } };

        // --- SCAFFOLD STAGE ---
        state.stage = 'scaffolding_project'; // <<< SCOTT: Verify 'scaffolding_project' matches your Stage type in types.ts. Adjust if needed (e.g., to 'scaffolding').
        yield { type: 'stage_change', data: { newStage: state.stage } };
        yield { type: 'status_update', data: { message: `📁 Generating project scaffold...`, worker: 'system' } };

        try {
            for await (const step of scaffoldStage({
                refinedPrompt: state.initialPrompt, // Using initialPrompt for scaffolding before refinement
                workerConfig: params.refinerConfig // Using refiner's config for scaffold LLM, adjust if needed
            })) {
                if (step.type === 'folder_create') {
                    yield { type: 'folder_create', data: step.data };
                } else if (step.type === 'file_create') {
                    state.projectFiles[step.data.path] = step.data.content; // Keep pipeline state in sync
                    yield { type: 'file_create', data: step.data };
                } else if (step.type === 'status_update') {
                    yield step; // Re-yield status updates from the stage
                }
                // Add other StageEvent types if scaffoldStage emits them
            }
            yield { type: 'status_update', data: { message: `✅ Scaffold stage completed successfully.`, worker: 'system' } };
        } catch (error: any) {
            state.lastError = `Scaffold stage failed: ${error.message}`;
            state.stage = 'error';
            yield { type: 'pipeline_error', data: { message: state.lastError } };
            return; // Terminate pipeline if scaffold stage critically fails
        }
        // --- END SCAFFOLD STAGE ---

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
            state.stage = 'error';
            yield { type: 'pipeline_error', data: { message: state.lastError } };
            return;
        }

        yield { type: 'prompt_refined', data: { refinedPrompt: state.refinedPrompt } };
        yield { type: 'status_update', data: { message: '✅ Refined prompt accepted. Starting collaboration turns...' } };

        let lastWorker1FullTextResponse = "";

        // --- CODING & REVIEW LOOP ---
        while (state.currentTurn < state.maxTurns && (state.stage as Stage) !== 'done' && (state.stage as Stage) !== 'error') {
            const currentFilename = state.filename || 'app/page.tsx'; // Default filename if not specified

            if (state.currentWorker === 'w1') {
                state.stage = 'coding_turn';
                yield { type: 'stage_change', data: { newStage: state.stage, message: `Turn ${state.currentTurn + 1} (Worker 1 Coding)` } };
                yield { type: 'status_update', data: { message: `🛠️ Worker 1 coding ${currentFilename}...`, worker: 'w1' } };

                let currentFileContent = state.projectFiles[currentFilename] || "";
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
                        } else if (step.type === 'codegen-code-chunk') {
                            state.projectFiles[currentFilename] = (state.projectFiles[currentFilename] || "") + step.data.content;
                            tempAccumulatedW1Response += step.data.content; // Ensure this is also accumulated
                            yield { type: 'file_update', data: { filename: currentFilename, content: state.projectFiles[currentFilename] } };
                            yield { type: 'assistant_chunk', data: { worker: 'w1', chunk: step.data.content } }; // Send code chunk as assistant chunk too
                        } else if (step.type === 'codegen-complete') {
                            lastWorker1FullTextResponse = step.data.fullText || tempAccumulatedW1Response;
                            
                            const extractedCode = extractCodeFromMarkdown(lastWorker1FullTextResponse, 'tsx');
                            if (extractedCode) {
                                state.projectFiles[currentFilename] = extractedCode;
                            } else if (lastWorker1FullTextResponse.trim()) {
                                console.warn(`[Pipeline] No .tsx code block found in Worker 1's response for ${currentFilename}. Using full response.`);
                                state.projectFiles[currentFilename] = lastWorker1FullTextResponse;
                            } else {
                                console.warn(`[Pipeline] Worker 1 returned empty response for ${currentFilename}.`);
                            }
                            if (state.projectFiles[currentFilename] !== currentFileContent || (!currentFileContent && state.projectFiles[currentFilename])) {
                                yield { type: 'file_update', data: { filename: currentFilename, content: state.projectFiles[currentFilename] } };
                            }
                            state.conversationHistory.push(...(step.data.messages || []));
                        }
                    }
                    if (!state.conversationHistory.find(m => m.role === 'assistant' && m.name === 'w1' && m.content === lastWorker1FullTextResponse)) {
                         state.conversationHistory.push({ role: 'assistant', name: 'w1', content: lastWorker1FullTextResponse });
                    }
                    yield { type: 'assistant_done', data: { worker: 'w1' } };
                    yield { type: 'status_update', data: { message: '✅ Worker 1 finished coding.', worker: 'w1' } };
                    state.currentWorker = 'w2';

                } catch (error: any) {
                    state.lastError = `Worker 1 (Codegen) turn failed: ${error.message}`;
                    state.stage = 'error';
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

                    const parsedReview = parseReviewOutput(fullReviewTextW2);
                    state.conversationHistory.push({ role: 'system', name: 'review_parser', content: `Parsed Review: Status - ${parsedReview.status}, Action - ${parsedReview.next_action_for_w1}, Issues - ${parsedReview.key_issues.join('; ')}` });
                    yield { type: 'status_update', data: { message: `Review Outcome: ${parsedReview.status}. Action for W1: ${parsedReview.next_action_for_w1}`, worker: 'system' } };

                    if (parsedReview.status === "APPROVED") {
                        yield { type: 'status_update', data: { message: `🎉 Worker 2 approved changes for ${currentFilename}.`, worker: 'system' } };
                        
                        state.stage = 'installing_deps'; 
                        yield { type: 'stage_change', data: { newStage: state.stage } };

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
                            yield { type: 'pipeline_error', data: { message: state.lastError } };
                            console.warn(`[Pipeline] Install stage failed: ${state.lastError}. Continuing to next turn.`);
                        }

                        state.currentTurn++; 
                        state.currentWorker = 'w1'; 
                        if (state.currentTurn >= state.maxTurns) {
                            state.stage = 'done';
                        } else {
                            state.stage = 'coding_turn'; 
                        }

                    } else if (parsedReview.status === "REVISION_NEEDED" || parsedReview.status === "NEEDS_CLARIFICATION") { // Handle NEEDS_CLARIFICATION if it's a possible status
                        yield { type: 'status_update', data: { message: `⚠️ Worker 2 requests revisions/clarification for ${currentFilename}. Worker 1 to address.`, worker: 'system' } };
                        state.currentWorker = 'w1'; 
                        state.stage = 'coding_turn';
                    } else { 
                        state.lastError = `Worker 2 review parsing error or unknown status: ${parsedReview.status} - ${(parsedReview as any).next_action_for_w1 || 'No action specified'}`;
                        state.stage = 'error';
                        yield { type: 'pipeline_error', data: { message: state.lastError } };
                        return;
                    }

                } catch (error: any) {
                    state.lastError = `Worker 2 (Review) turn failed: ${error.message}`;
                    state.stage = 'error';
                    yield { type: 'pipeline_error', data: { message: state.lastError } };
                    return;
                }
            }
        }

        if ((state.stage as Stage) !== 'error' && (state.stage as Stage) !== 'done') {
            state.stage = 'done';
        }
        if (state.stage === 'done') {
            yield { type: 'stage_change', data: { newStage: state.stage, message: "Collaboration cycle complete." } };
        }
        
        yield { type: 'pipeline_finish', data: { finalState: { projectFiles: state.projectFiles, requiredPackages: state.requiredPackages } } };

    } catch (error: any) {
        console.error("[Pipeline] Unhandled Top-Level Error:", error);
        state.lastError = `Critical pipeline error: ${error.message}`;
        state.stage = 'error'; 
        yield { type: 'pipeline_error', data: { message: state.lastError } };
        yield { type: 'pipeline_finish', data: { finalState: { projectFiles: state.projectFiles, requiredPackages: state.requiredPackages } } };
    }
}