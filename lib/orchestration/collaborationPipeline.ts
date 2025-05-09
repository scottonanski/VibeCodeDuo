// lib/orchestration/collaborationPipeline.ts

import {
    type AiChatMessage,
    type CollaborationState,
    type PipelineEvent,
    type PipelineParams,
    // type StageEvent, // Not directly used here, specific stage events are handled by stages
    type Stage,
    type AssistantMessageCompleteData
} from './stages/types';
import { refineStage } from './stages/refineStage';
import { codegenStage } from './stages/codegenStage';
import { reviewStage } from './stages/reviewStage';
import { installStage } from './stages/installStage';
import { extractCodeFromMarkdown } from '@/lib/utils/markdownParser';
import { parseReviewOutput } from '@/lib/utils/jsonParser';
import { scaffoldStage } from './stages/scaffoldStage';


// Helper: Sliding window for conversation history
function getTruncatedHistory(history: AiChatMessage[], refinedPrompt: string): AiChatMessage[] {
    const result: typeof history = [];
    if (history.length > 0) result.push(history[0]);
    const refinedPromptMsg = history.find(m => typeof m.content === 'string' && m.content.includes(refinedPrompt));
    if (refinedPromptMsg && !result.includes(refinedPromptMsg)) result.push(refinedPromptMsg);
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
        currentWorker: 'w1', // Start with w1
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
        state.stage = 'scaffolding_project';
        yield { type: 'stage_change', data: { newStage: state.stage } };
        yield { type: 'status_update', data: { message: `📁 Generating project scaffold...`, worker: 'system' } };

        try {
            for await (const step of scaffoldStage({
                refinedPrompt: state.initialPrompt, // Use initial prompt for initial scaffold
                workerConfig: params.refinerConfig // Can use refiner or a dedicated scaffold LLM config
            })) {
                if (step.type === 'folder_create') {
                    yield { type: 'folder_create', data: step.data };
                } else if (step.type === 'file_create') {
                    state.projectFiles[step.data.path] = step.data.content;
                    yield { type: 'file_create', data: step.data };
                } else if (step.type === 'status_update') {
                    yield step;
                }
            }
            yield { type: 'status_update', data: { message: `✅ Scaffold stage completed successfully.`, worker: 'system' } };
        } catch (error: any) {
            state.lastError = `Scaffold stage failed: ${error.message}`;
            state.stage = 'error';
            yield { type: 'pipeline_error', data: { message: state.lastError } };
            return;
        }
        // --- END SCAFFOLD STAGE ---

        // --- REFINE STAGE ---
        state.stage = 'refining_prompt';
        yield { type: 'stage_change', data: { newStage: state.stage } };
        yield { type: 'status_update', data: { message: `🧠 Refining prompt...`, worker: 'refiner' } };

        let refineResult;
        try {
            // Assuming refineStage now also might use streaming and yield its own assistant_chunk/done/complete
            // For simplicity, if refineStage is a single async call:
            refineResult = await refineStage(state.initialPrompt, params.refinerConfig);
            state.refinedPrompt = refineResult.refinedPrompt;
            // If refineStage itself manages conversation history internally and returns messages:
            state.conversationHistory.push(...refineResult.messages);
            // If refineStage streams and pipeline needs to show it:
            // yield { type: 'assistant_message_complete', data: { worker: 'refiner', fullText: refineResult.refinedPrompt, codeExtracted: false } };

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
            const currentFilename = state.filename || 'app/page.tsx';

            if (state.currentWorker === 'w1') {
                state.stage = 'coding_turn';
                yield { type: 'stage_change', data: { newStage: state.stage, message: `Turn ${state.currentTurn + 1} (Worker 1 Coding)` } };
                yield { type: 'status_update', data: { message: `🛠️ Worker 1 coding ${currentFilename}...`, worker: 'w1' } };

                let currentFileContent = state.projectFiles[currentFilename] || "";
                let tempAccumulatedW1Response = "";
                let codeWasExtractedAndApplied = false;

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
                            // This is a direct code chunk, implies it should be part of the file
                            // The pipeline should decide how to apply it (append, replace segment, etc.)
                            // For now, let's assume it replaces if it's the only content, or appends if not.
                            // A more sophisticated approach might involve diffing or markers.
                            // state.projectFiles[currentFilename] = (state.projectFiles[currentFilename] || "") + step.data.content;
                            // The codegenStage should ideally provide the full final code in codegen-complete.
                            // For now, let's treat codegen-code-chunk similar to codegen-chunk for accumulation
                            // and rely on codegen-complete for the final file content.
                            tempAccumulatedW1Response += step.data.content; // Accumulate for full text
                            // Yielding as assistant_chunk is good for live typing effect.
                            yield { type: 'assistant_chunk', data: { worker: 'w1', chunk: step.data.content } };
                            // If codegen-code-chunk implies immediate file update:
                            // state.projectFiles[currentFilename] = step.data.finalCode || state.projectFiles[currentFilename]; // If finalCode is provided
                            // yield { type: 'file_update', data: { filename: currentFilename, content: state.projectFiles[currentFilename] } };
                        } else if (step.type === 'codegen-complete') {
                            lastWorker1FullTextResponse = step.data.fullText || tempAccumulatedW1Response;
                            const previousContent = state.projectFiles[currentFilename];

                            if (step.data.finalCode !== undefined) { // Prefer explicit finalCode from stage
                                if (previousContent !== step.data.finalCode) {
                                    state.projectFiles[currentFilename] = step.data.finalCode;
                                    codeWasExtractedAndApplied = true;
                                }
                            } else { // Fallback to extracting from fullText
                                const extractedCode = extractCodeFromMarkdown(lastWorker1FullTextResponse); // Generic extraction
                                if (extractedCode) {
                                    if (previousContent !== extractedCode) {
                                        state.projectFiles[currentFilename] = extractedCode;
                                        codeWasExtractedAndApplied = true;
                                    }
                                } else if (lastWorker1FullTextResponse.trim() && !previousContent) {
                                    // If no code block, but there's response and file is empty,
                                    // consider if full response should be the file content.
                                    // This is a policy decision. For now, only explicit code blocks update files.
                                    console.warn(`[Pipeline] No code block in W1 response for ${currentFilename}, and no explicit finalCode. File not updated from full text unless policy changes.`);
                                }
                            }

                            if (codeWasExtractedAndApplied) {
                                yield { type: 'file_update', data: { filename: currentFilename, content: state.projectFiles[currentFilename] } };
                            }
                            state.conversationHistory.push(...(step.data.messages || [])); // Add messages from stage to history
                        }
                    }
                    // Ensure the full response for this turn is added to history if not already by the stage
                    if (!state.conversationHistory.find(m => m.role === 'assistant' && m.name === 'w1' && m.content === lastWorker1FullTextResponse)) {
                         state.conversationHistory.push({ role: 'assistant', name: 'w1', content: lastWorker1FullTextResponse });
                    }

                    yield { type: 'assistant_done', data: { worker: 'w1' } };
                    yield {
                        type: 'assistant_message_complete',
                        data: {
                            worker: 'w1',
                            fullText: lastWorker1FullTextResponse,
                            codeExtracted: codeWasExtractedAndApplied
                        }
                    };
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
                let tempAccumulatedW2Response = "";

                try {
                    for await (const step of reviewStage({
                        filename: currentFilename,
                        refinedPrompt: state.refinedPrompt,
                        conversationHistory: getTruncatedHistory(state.conversationHistory, state.refinedPrompt),
                        projectFiles: state.projectFiles,
                        worker1Response: lastWorker1FullTextResponse, // Pass W1's full text for context
                        workerConfig: params.worker2Config,
                        projectType: state.projectType,
                    })) {
                        if (step.type === 'review-chunk') {
                            tempAccumulatedW2Response += step.data.content;
                            yield { type: 'assistant_chunk', data: { worker: 'w2', chunk: step.data.content } };
                        } else if (step.type === 'review-complete') {
                            fullReviewTextW2 = step.data.fullText || tempAccumulatedW2Response;
                            state.conversationHistory.push(...(step.data.messages || []));
                        }
                    }
                    if (!state.conversationHistory.find(m => m.role === 'assistant' && m.name === 'w2' && m.content === fullReviewTextW2) && fullReviewTextW2) {
                        state.conversationHistory.push({ role: 'assistant', name: 'w2', content: fullReviewTextW2 });
                    }

                    yield { type: 'assistant_done', data: { worker: 'w2' } };
                    yield {
                        type: 'assistant_message_complete',
                        data: {
                            worker: 'w2',
                            fullText: fullReviewTextW2,
                            codeExtracted: false // Reviews don't modify files directly
                        }
                    };

                    const parsedReview = parseReviewOutput(fullReviewTextW2);
                    yield { type: 'status_update', data: { message: `Review Outcome: ${parsedReview.status}. Action for W1: ${parsedReview.next_action_for_w1}`, worker: 'system' } };

                    yield {
                        type: 'review_result',
                        data: {
                            status: parsedReview.status as "APPROVED" | "REVISION_NEEDED" | "ERROR" | "UNKNOWN",
                            key_issues: parsedReview.key_issues,
                            next_action_for_w1: parsedReview.next_action_for_w1,
                        }
                    };

                    if (parsedReview.status === "APPROVED") {
                        yield { type: 'status_update', data: { message: `🎉 Worker 2 approved changes for ${currentFilename}.`, worker: 'system' } };
                        state.approvedFiles.push(currentFilename); // Mark file as approved

                        state.stage = 'installing_deps';
                        yield { type: 'stage_change', data: { newStage: state.stage } };

                        try {
                            for await (const installStep of installStage({
                                conversationHistory: getTruncatedHistory(state.conversationHistory, state.refinedPrompt),
                                projectFiles: state.projectFiles, // Pass current project files
                                workerConfig: params.worker1Config, // Or a dedicated installer LLM config
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
                            // Non-critical, log and continue to next turn or finish.
                            yield { type: 'pipeline_error', data: { message: state.lastError + " (Non-critical, continuing)" } };
                            console.warn(`[Pipeline] Install stage failed: ${state.lastError}. Continuing.`);
                        }

                        state.currentTurn++;
                        if (state.currentTurn >= state.maxTurns) {
                            state.stage = 'done';
                        } else {
                            state.currentWorker = 'w1';
                            state.stage = 'coding_turn'; // Ready for next coding turn
                        }

                    } else if (parsedReview.status === "REVISION_NEEDED" || parsedReview.status === "NEEDS_CLARIFICATION") {
                        yield { type: 'status_update', data: { message: `⚠️ Worker 2 requests revisions/clarification for ${currentFilename}. Worker 1 to address.`, worker: 'system' } };
                        state.currentWorker = 'w1';
                        state.stage = 'coding_turn';
                    } else {
                        state.lastError = `Worker 2 review parsing error or unknown status: ${parsedReview.status} - ${(parsedReview as any).next_action_for_w1 || 'No action specified'}`;
                        state.stage = 'error';
                        yield { type: 'pipeline_error', data: { message: state.lastError } };
                        return; // Critical error in review parsing
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
            state.stage = 'done'; // Mark as done if maxTurns reached or loop exited cleanly
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
        // Corrected: Adhere to the Pick type for finalState
        yield { type: 'pipeline_finish', data: { finalState: { projectFiles: state.projectFiles, requiredPackages: state.requiredPackages } } };
    }
}