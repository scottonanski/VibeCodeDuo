// lib/orchestration/collaborationPipeline.ts

import {
    type AiChatMessage,
    type CollaborationState,
    type PipelineEvent,
    type PipelineParams,
    type Stage,
    // type AssistantMessageCompleteData // Already imported via types
} from './stages/types';
import { refineStage } from './stages/refineStage';
import { debateStage } from './stages/debateStage'; // <<< IMPORTED
import { scaffoldStage } from './stages/scaffoldStage';
import { codegenStage } from './stages/codegenStage';
import { reviewStage } from './stages/reviewStage';
import { installStage } from './stages/installStage';
import { extractCodeFromMarkdown } from '@/lib/utils/markdownParser';
import { parseReviewOutput } from '@/lib/utils/jsonParser';


// Helper: Sliding window for conversation history
function getTruncatedHistory(history: AiChatMessage[], refinedPrompt: string): AiChatMessage[] {
    const result: typeof history = [];
    if (history.length > 0 && history[0]?.role === 'system') { // Keep initial system prompt if any
        // This helper isn't strictly designed for multiple system prompts.
        // For now, let's assume the first message could be a general system prompt.
        // Specific stages (like debate) inject their own system prompts.
    }
    // Try to include the refined prompt message if it exists distinctly
    const refinedPromptMsg = history.find(m => m.role === 'assistant' && m.name === 'refiner' && typeof m.content === 'string' && m.content.includes(refinedPrompt));
    if (refinedPromptMsg && !result.includes(refinedPromptMsg)) {
        result.push(refinedPromptMsg);
    }
    const lastN = 6; // Keep last N messages
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

    // Variables to store debate results
    let agreedPlanFromDebate: string | undefined = undefined;
    // let debateOptions: string[] | undefined = undefined; // For future use if frontend needs them directly from pipeline state
    // let debateRequiresResolution: boolean | undefined = undefined; // For future use
    // let fullDebateTranscript: AiChatMessage[] = []; // For future use

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
            // Add refiner's messages to conversation history
            // refineResult.messages includes the system prompt for refiner, user prompt, and assistant response
            state.conversationHistory.push(...refineResult.messages);

            // Yield completion for refiner explicitly
            yield {
                type: 'assistant_message_complete',
                data: {
                    worker: 'refiner',
                    fullText: state.refinedPrompt,
                    codeExtracted: false, // Refiner doesn't extract code
                }
            };
        } catch (error: any) {
            state.lastError = `Refine stage failed: ${error.message}`;
            state.stage = 'error';
            yield { type: 'pipeline_error', data: { message: state.lastError } };
            return;
        }
        yield { type: 'prompt_refined', data: { refinedPrompt: state.refinedPrompt } };
        yield { type: 'status_update', data: { message: '✅ Refined prompt generated. Proceeding to debate plan...' } };

        // --- DEBATE STAGE ---
        state.stage = 'debating_plan';
        yield { type: 'stage_change', data: { newStage: state.stage } };
        yield { type: 'status_update', data: { message: `🎙️ Initiating debate to finalize the plan...`, worker: 'system' } };

        try {
            // Use a snapshot of conversation history *before* the debate for the debate stage's initial context
            // The debate stage itself will manage its internal debate transcript.
            const debateInitialHistory = [...state.conversationHistory];

            for await (const debateEvent of debateStage({
                refinedPrompt: state.refinedPrompt,
                conversationHistory: debateInitialHistory, // Pass pre-debate history
                debaterAConfig: params.worker1Config, // Debater A uses W1 config
                debaterBConfig: params.worker2Config, // Debater B uses W2 config
                summarizerConfig: params.refinerConfig, // Summarizer uses Refiner config (or params.worker1Config as fallback if needed)
                // maxTurnsPerAgent can be configured if desired, defaults in debateStage
            })) {
                // Re-yield events from debateStage as PipelineEvents
                if (debateEvent.type === 'status_update') {
                    yield { type: 'status_update', data: { message: debateEvent.data.message, worker: debateEvent.data.worker || 'system' } };
                } else if (debateEvent.type === 'debate_agent_chunk') {
                    yield { type: 'debate_agent_chunk', data: debateEvent.data };
                } else if (debateEvent.type === 'debate_agent_message_complete') {
                    yield { type: 'debate_agent_message_complete', data: debateEvent.data };
                    // Add debater's full message to overall conversation history
                    state.conversationHistory.push({
                        role: 'assistant',
                        name: debateEvent.data.agent,
                        content: debateEvent.data.fullText,
                    });
                } else if (debateEvent.type === 'debate_summary_chunk') {
                    yield { type: 'debate_summary_chunk', data: { agent: 'summarizer', chunk: debateEvent.data.chunk } };
                } else if (debateEvent.type === 'debate_result_summary') {
                    // Capture results locally
                    agreedPlanFromDebate = debateEvent.data.agreedPlan;
                    // debateOptions = debateEvent.data.options; // Store if needed by frontend later
                    // debateRequiresResolution = debateEvent.data.requiresResolution; // Store if needed
                    // fullDebateTranscript = debateEvent.data.fullTranscript; // Store if needed

                    // Yield the event as defined in PipelineEventDataMap
                    yield {
                        type: 'debate_result_summary',
                        data: {
                            summaryText: debateEvent.data.summaryText,
                            agreedPlan: debateEvent.data.agreedPlan,
                            options: debateEvent.data.options,
                            requiresResolution: debateEvent.data.requiresResolution ?? true, // Ensure boolean
                            fullTranscript: debateEvent.data.fullTranscript,
                        }
                    };
                    // Add summarizer's message to overall conversation history
                    state.conversationHistory.push({
                        role: 'assistant',
                        name: 'summarizer',
                        content: debateEvent.data.summaryText,
                    });
                }
            }
            yield { type: 'status_update', data: { message: `✅ Debate concluded. Proceeding to scaffold project.`, worker: 'system' } };
        } catch (error: any) {
            state.lastError = `Debate stage failed: ${error.message}`;
            state.stage = 'error';
            yield { type: 'pipeline_error', data: { message: state.lastError } };
            return;
        }
        // --- END DEBATE STAGE ---

        // --- SCAFFOLD STAGE ---
        state.stage = 'scaffolding_project';
        yield { type: 'stage_change', data: { newStage: state.stage } };
        const scaffoldInputPrompt = agreedPlanFromDebate || state.refinedPrompt;
        yield { type: 'status_update', data: { message: `📁 Generating project scaffold based on: "${scaffoldInputPrompt.substring(0, 70)}..."`, worker: 'system' } };

        try {
            for await (const scaffoldStep of scaffoldStage({
                // Use agreed plan from debate, fallback to refined prompt
                refinedPrompt: scaffoldInputPrompt,
                workerConfig: params.refinerConfig // Can use refiner or a dedicated scaffold LLM config
            })) {
                // scaffoldStage currently yields these directly as StageEvents
                // which match PipelineEvent types
                if (scaffoldStep.type === 'folder_create') {
                    // Frontend will handle folder creation display. Pipeline doesn't store folders in state.projectFiles.
                    yield { type: 'folder_create', data: scaffoldStep.data };
                } else if (scaffoldStep.type === 'file_create') {
                    state.projectFiles[scaffoldStep.data.path] = scaffoldStep.data.content;
                    yield { type: 'file_create', data: scaffoldStep.data };
                } else if (scaffoldStep.type === 'status_update') {
                    yield { type: 'status_update', data: { message: scaffoldStep.data.message, worker: scaffoldStep.data.worker || 'system' } };
                }
                // If scaffoldStage were to emit 'scaffold_chunk' or 'scaffold_complete' as per types.ts StageEventDataMap,
                // the pipeline would handle them here.
                // e.g., if (scaffoldStep.type === 'scaffold_chunk') {
                //   yield { type: 'assistant_chunk', data: { worker: 'w1', chunk: scaffoldStep.data.chunk } };
                // }
            }
            yield { type: 'status_update', data: { message: `✅ Scaffold stage completed successfully.`, worker: 'system' } };
        } catch (error: any) {
            state.lastError = `Scaffold stage failed: ${error.message}`;
            state.stage = 'error';
            yield { type: 'pipeline_error', data: { message: state.lastError } };
            return;
        }
        // --- END SCAFFOLD STAGE ---

        let lastWorker1FullTextResponse = "";

        // --- CODING & REVIEW LOOP ---
        yield { type: 'status_update', data: { message: '⚙️ Starting main coding & review cycles...' } };

        while (state.currentTurn < state.maxTurns && (state.stage as Stage) !== 'done' && (state.stage as Stage) !== 'error') {
            const currentFilename = state.filename || 'app/page.tsx'; // Default or primary file

            if (state.currentWorker === 'w1') {
                state.stage = 'coding_turn';
                yield { type: 'stage_change', data: { newStage: state.stage, message: `Turn ${state.currentTurn + 1} (Worker 1 Coding)` } };
                yield { type: 'status_update', data: { message: `🛠️ Worker 1 coding ${currentFilename}...`, worker: 'w1' } };

                let currentFileContent = state.projectFiles[currentFilename] || "";
                // If file doesn't exist from scaffold, currentFileContent will be empty.
                // codegenStage should handle creating it or be told it's a new file.

                let tempAccumulatedW1Response = "";
                let codeWasExtractedAndApplied = false;

                try {
                    const codegenHistory = getTruncatedHistory(state.conversationHistory, state.refinedPrompt);
                    // The refinedPrompt for codegen stage should be the overall guiding prompt for the task,
                    // which could be state.refinedPrompt or potentially the agreedPlanFromDebate if it's more specific
                    // For now, using state.refinedPrompt as the main task context.
                    const taskPromptForCodegen = agreedPlanFromDebate || state.refinedPrompt;

                    for await (const step of codegenStage({
                        filename: currentFilename,
                        refinedPrompt: taskPromptForCodegen,
                        conversationHistory: codegenHistory,
                        currentCode: currentFileContent,
                        workerConfig: params.worker1Config,
                        projectType: state.projectType,
                    })) {
                        if (step.type === 'codegen-chunk') {
                            tempAccumulatedW1Response += step.data.content;
                            yield { type: 'assistant_chunk', data: { worker: 'w1', chunk: step.data.content } };
                        } else if (step.type === 'codegen-code-chunk') {
                            // This event type is less common if full code comes in codegen-complete
                            tempAccumulatedW1Response += step.data.content;
                            yield { type: 'assistant_chunk', data: { worker: 'w1', chunk: step.data.content } };
                        } else if (step.type === 'codegen-complete') {
                            lastWorker1FullTextResponse = step.data.fullText || tempAccumulatedW1Response;
                            const previousContent = state.projectFiles[currentFilename];

                            if (step.data.finalCode !== undefined) {
                                if (previousContent !== step.data.finalCode || !state.projectFiles.hasOwnProperty(currentFilename)) {
                                    state.projectFiles[currentFilename] = step.data.finalCode;
                                    codeWasExtractedAndApplied = true;
                                }
                            } else {
                                const extractedCode = extractCodeFromMarkdown(lastWorker1FullTextResponse);
                                if (extractedCode) {
                                    if (previousContent !== extractedCode || !state.projectFiles.hasOwnProperty(currentFilename)) {
                                        state.projectFiles[currentFilename] = extractedCode;
                                        codeWasExtractedAndApplied = true;
                                    }
                                } else {
                                     console.warn(`[Pipeline] No code block in W1 response for ${currentFilename}, and no explicit finalCode. File not updated unless it's a new file and full response is treated as code.`);
                                     // Policy: If it's a new file and there's some response (even without ```), use it.
                                     if (!state.projectFiles.hasOwnProperty(currentFilename) && lastWorker1FullTextResponse.trim()) {
                                        state.projectFiles[currentFilename] = lastWorker1FullTextResponse.trim();
                                        codeWasExtractedAndApplied = true;
                                        console.log(`[Pipeline] New file ${currentFilename} created with full W1 response as content.`);
                                     }
                                }
                            }

                            if (codeWasExtractedAndApplied) {
                                yield { type: 'file_update', data: { filename: currentFilename, content: state.projectFiles[currentFilename] } };
                            }
                            // Add W1's messages from its stage to history (if stage provides them)
                            if (step.data.messages && step.data.messages.length > 0) {
                                state.conversationHistory.push(...step.data.messages);
                            } else { // Fallback: add the full response if not already part of messages
                                if (!state.conversationHistory.find(m => m.role === 'assistant' && m.name === 'w1' && m.content === lastWorker1FullTextResponse)) {
                                    state.conversationHistory.push({ role: 'assistant', name: 'w1', content: lastWorker1FullTextResponse });
                                }
                            }
                        }
                    }
                    // Ensure the full response for this turn is added to history if not already by the stage
                    if (!state.conversationHistory.find(m => m.role === 'assistant' && m.name === 'w1' && m.content === lastWorker1FullTextResponse) && lastWorker1FullTextResponse) {
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
                    const reviewHistory = getTruncatedHistory(state.conversationHistory, state.refinedPrompt);
                    const taskPromptForReview = agreedPlanFromDebate || state.refinedPrompt;

                    for await (const step of reviewStage({
                        filename: currentFilename,
                        refinedPrompt: taskPromptForReview,
                        conversationHistory: reviewHistory,
                        projectFiles: state.projectFiles, // Pass all known files for context
                        worker1Response: lastWorker1FullTextResponse,
                        workerConfig: params.worker2Config,
                        projectType: state.projectType,
                    })) {
                        if (step.type === 'review-chunk') {
                            tempAccumulatedW2Response += step.data.content;
                            yield { type: 'assistant_chunk', data: { worker: 'w2', chunk: step.data.content } };
                        } else if (step.type === 'review-complete') {
                            fullReviewTextW2 = step.data.fullText || tempAccumulatedW2Response;
                            // Add W2's messages from its stage to history (if stage provides them)
                            if (step.data.messages && step.data.messages.length > 0) {
                                state.conversationHistory.push(...step.data.messages);
                            } else { // Fallback
                                if (!state.conversationHistory.find(m => m.role === 'assistant' && m.name === 'w2' && m.content === fullReviewTextW2) && fullReviewTextW2) {
                                    state.conversationHistory.push({ role: 'assistant', name: 'w2', content: fullReviewTextW2 });
                                }
                            }
                        }
                    }
                    // Ensure the full response for this turn is added to history if not already by the stage
                    if (!state.conversationHistory.find(m => m.role === 'assistant' && m.name === 'w2' && m.content === fullReviewTextW2) && fullReviewTextW2) {
                        state.conversationHistory.push({ role: 'assistant', name: 'w2', content: fullReviewTextW2 });
                    }

                    yield { type: 'assistant_done', data: { worker: 'w2' } };
                    yield {
                        type: 'assistant_message_complete',
                        data: {
                            worker: 'w2',
                            fullText: fullReviewTextW2,
                            codeExtracted: false
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
                        state.approvedFiles.push(currentFilename);

                        state.stage = 'installing_deps';
                        yield { type: 'stage_change', data: { newStage: state.stage } };
                        yield { type: 'status_update', data: { message: `📦 Analyzing dependencies for installation...`, worker: 'system' } };

                        try {
                            const installHistory = getTruncatedHistory(state.conversationHistory, state.refinedPrompt);
                            const taskPromptForInstall = agreedPlanFromDebate || state.refinedPrompt;

                            for await (const installStep of installStage({
                                conversationHistory: installHistory,
                                projectFiles: state.projectFiles,
                                workerConfig: params.worker1Config, // Or a dedicated installer LLM
                                refinedPrompt: taskPromptForInstall,
                                projectType: state.projectType,
                            })) {
                                if (installStep.type === 'install_command') {
                                    if (!state.requiredPackages.includes(installStep.data.command)) {
                                        state.requiredPackages.push(installStep.data.command);
                                    }
                                    yield { type: 'install_command_found', data: { command: installStep.data.command } };
                                } else if (installStep.type === 'install_analysis_complete') {
                                    // Update state.requiredPackages with the definitive list from analysis
                                    state.requiredPackages = installStep.data.commands;
                                    yield { type: 'install_summary', data: { commands: installStep.data.commands } };
                                } else if (installStep.type === 'install_no_actions_needed') {
                                    yield { type: 'status_update', data: { message: '✅ No new package installations identified.', worker: 'system' } };
                                } else if (installStep.type === 'status_update') {
                                    yield { type: 'status_update', data: { message: installStep.data.message, worker: installStep.data.worker || 'system' }};
                                }
                            }
                             yield { type: 'status_update', data: { message: `✅ Dependency analysis complete.`, worker: 'system' } };
                        } catch (error: any) {
                            state.lastError = `Install stage failed: ${error.message}`;
                            yield { type: 'pipeline_error', data: { message: state.lastError + " (Non-critical, continuing)" } };
                            console.warn(`[Pipeline] Install stage failed: ${state.lastError}. Continuing.`);
                        }

                        state.currentTurn++;
                        if (state.currentTurn >= state.maxTurns) {
                            state.stage = 'done';
                            yield { type: 'status_update', data: { message: `🏁 Max turns reached. Project cycle complete.` } };
                        } else {
                            // Policy decision: After approval, do we pick a new file or just end?
                            // For now, assume one file per full pipeline run through W1/W2.
                            // To work on multiple files, pipeline needs more sophisticated file management.
                            // For this iteration, let's consider the main task for `filename` done.
                            state.stage = 'done'; // Or 'select_next_file_or_task' if implementing multi-file
                            yield { type: 'status_update', data: { message: `🏁 Approved file ${currentFilename} processed. Concluding cycle for this file.` } };
                        }

                    } else if (parsedReview.status === "REVISION_NEEDED" || parsedReview.status === "NEEDS_CLARIFICATION") {
                        yield { type: 'status_update', data: { message: `⚠️ Worker 2 requests revisions/clarification for ${currentFilename}. Worker 1 to address.`, worker: 'system' } };
                        state.currentWorker = 'w1'; // Back to W1 for revisions
                        state.stage = 'coding_turn'; // Ready for next coding turn on the same file
                        state.currentTurn++; // Consume a turn for the review/request cycle
                         if (state.currentTurn >= state.maxTurns) {
                            state.stage = 'done';
                            yield { type: 'status_update', data: { message: `🏁 Max turns reached during revision. Project cycle complete.` } };
                        }
                    } else { // ERROR or UNKNOWN status from review
                        state.lastError = `Worker 2 review parsing error or unhandled status: ${parsedReview.status}`;
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
        } // End of while loop (coding/review turns)

        if ((state.stage as Stage) !== 'error' && (state.stage as Stage) !== 'done') {
            state.stage = 'done'; // Mark as done if maxTurns reached or loop exited cleanly
        }
        if (state.stage === 'done') {
            yield { type: 'stage_change', data: { newStage: state.stage, message: "✅ Collaboration pipeline finished successfully." } };
        }

        yield { type: 'pipeline_finish', data: { finalState: { projectFiles: state.projectFiles, requiredPackages: state.requiredPackages } } };

    } catch (error: any) {
        console.error("[Pipeline] Unhandled Top-Level Error:", error);
        state.lastError = `Critical pipeline error: ${error.message}`;
        state.stage = 'error'; // Ensure stage is error
        // Yield error first, then finish
        yield { type: 'pipeline_error', data: { message: state.lastError } };
        yield { type: 'pipeline_finish', data: { finalState: { projectFiles: state.projectFiles, requiredPackages: state.requiredPackages } } };
    }
}

// ======================================================================================
// FILE EXPLANATION: lib/orchestration/collaborationPipeline.ts
// ======================================================================================
//
// This file defines the main `collaborationPipeline`, an asynchronous generator function
// that orchestrates the entire multi-stage AI-driven software development process.
// It manages state, sequences different AI stages (refinement, debate, scaffolding,
// coding, review, installation), and yields `PipelineEvent`s that the frontend
// consumes to display progress and results.
//
// Core Responsibilities:
//
// 1. State Management:
//    - Initializes and maintains a `CollaborationState` object (`state`) throughout
//      the pipeline's execution. This state includes:
//      - `initialPrompt`, `refinedPrompt`, `agreedPlanFromDebate`.
//      - `currentTurn`, `maxTurns` for the coding/review loop.
//      - `projectFiles`: A record of generated file paths and their content.
//      - `requiredPackages`: A list of npm/yarn packages identified for installation.
//      - `conversationHistory`: A log of AI and user messages.
//      - `currentWorker`, `stage`, `lastError`, etc.
//
// 2. Stage Orchestration & Sequencing:
//    The pipeline executes stages in a specific order:
//    a. `pipeline_start`: Initial event.
//    b. `refineStage`: Takes the user's raw prompt and refines it into a more
//       actionable task description. The `refinedPrompt` and refiner's messages
//       are stored in the state.
//    c. `debateStage`: (New) Takes the `refinedPrompt` and facilitates a debate
//       between Debater A (Worker 1 config) and Debater B (Worker 2 config),
//       summarized by a Summarizer (Refiner config).
//       - It passes existing worker configurations to the debate agents.
//       - Captures the `agreedPlanFromDebate`, `options`, `requiresResolution`,
//         and `summaryText`.
//       - Adds debate messages (from debaters and summarizer) to `conversationHistory`.
//    d. `scaffoldStage`: Generates an initial project file and folder structure.
//       - Takes the `agreedPlanFromDebate` (or `refinedPrompt` as fallback) as input.
//       - Uses `refinerConfig` for the scaffolding LLM.
//       - Populates `state.projectFiles` with scaffolded files.
//    e. Coding & Review Loop (`codegenStage` -> `reviewStage` -> `installStage`):
//       - Iterates for a defined number of `maxTurns` or until a file is approved.
//       - `codegenStage` (Worker 1): Generates or modifies code for a specific file
//         (`state.filename`) based on the `agreedPlanFromDebate` (or `refinedPrompt`)
//         and `conversationHistory`. Updates `state.projectFiles`.
//       - `reviewStage` (Worker 2): Reviews the code generated by Worker 1, providing
//         feedback (approve/revise).
//       - `installStage`: If code is approved, this stage analyzes project files
//         and conversation history to identify necessary package installations.
//         Updates `state.requiredPackages`.
//       - The loop continues (W1 revises based on W2 feedback) or moves to completion.
//
// 3. Event Emission:
//    - As an asynchronous generator, it `yield`s `PipelineEvent` objects. These events
//      signal various occurrences to the frontend:
//      - `pipeline_start`, `pipeline_finish`, `pipeline_error`.
//      - `stage_change`: Indicates transitions between stages.
//      - `status_update`: Provides textual updates on ongoing processes.
//      - `prompt_refined`: When the prompt refinement is complete.
//      - `debate_agent_chunk`, `debate_agent_message_complete`, `debate_summary_chunk`,
//        `debate_result_summary`: For live updates from the debate stage.
//      - `file_create`, `file_update`, `folder_create`: For file system changes.
//      - `assistant_chunk`, `assistant_done`, `assistant_message_complete`: For
//        live output from coding (W1) and review (W2) agents.
//      - `review_result`: Contains the outcome of Worker 2's review.
//      - `install_command_found`, `install_summary`: For dependency installation info.
//
// 4. Parameter Handling:
//    - Accepts `PipelineParams` which include:
//      - The initial user `prompt`.
//      - `WorkerConfig` objects for `refinerConfig`, `worker1Config`, `worker2Config`.
//        These configs specify the LLM provider, model, and API key.
//      - Optional parameters like `projectType`, `filename`, `maxTurns`.
//    - It is responsible for passing the correct configurations to each stage.
//      Notably, `worker1Config`, `worker2Config`, and `refinerConfig` are reused for
//      the `debateStage` agents (Debater A, Debater B, Summarizer respectively).
//
// 5. Conversation History Management:
//    - Appends messages from `refineStage`, `debateStage` (debaters & summarizer),
//      `codegenStage`, and `reviewStage` to `state.conversationHistory`.
//    - Uses a `getTruncatedHistory` helper to provide a relevant, condensed view
//      of the history to AI agents in later turns, preventing overly long contexts.
//
// 6. Error Handling:
//    - Includes `try...catch` blocks for each major stage and a top-level `try...catch`
//      for the entire pipeline.
//    - If an error occurs, it sets `state.lastError` and `state.stage` to 'error',
//      yields a `pipeline_error` event, and typically terminates the pipeline.
//
// Dependencies:
// - Individual stage modules (`refineStage`, `debateStage`, `scaffoldStage`, etc.).
// - Utility functions (`extractCodeFromMarkdown`, `parseReviewOutput`).
// - Type definitions from `./stages/types.ts`.
//
// Key Design Decisions Reflected:
// - Upfront Planning: The `debateStage` is positioned early to allow for plan
//   refinement before significant coding effort.
// - Configuration Re-use: Existing worker configurations are leveraged for the
//   debate agents, avoiding new UI settings for this phase.
// - Event-Driven UI: The pipeline's generator nature allows the UI to react
//   incrementally to progress and data.
//