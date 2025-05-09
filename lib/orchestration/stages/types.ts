// lib/orchestration/stages/types.ts

export type AiChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
};

export type Stage =
  | 'initial'
  | 'refining_prompt'
  | 'debating_plan'
  | 'scaffolding_project'
  | 'installing_deps'
  | 'coding_turn'
  | 'reviewing_turn'
  | 'processing_turn'
  | 'error'
  | 'done';

export interface ScaffoldStageParams {
  refinedPrompt: string;
  workerConfig: WorkerConfig;
}

export interface CollaborationState {
  stage: Stage;
  initialPrompt: string;
  refinedPrompt: string;
  currentTurn: number;
  maxTurns: number;
  projectFiles: Record<string, string>;
  requiredPackages: string[];
  conversationHistory: AiChatMessage[];
  currentWorker: PipelineWorker;
  lastError: string | null;
  projectType?: string;
  filename?: string;
  currentPlan?: {
    files: string[];
    goals: string;
    dependencies: string[];
  };
  revisionCountByFile: Record<string, number>;
  approvedFiles: string[];
  pendingInstalls: string[];
  MAX_REVISIONS_PER_FILE?: number;
  needsReplan?: boolean;
}

export type PipelineWorker = 'w1' | 'w2' | 'refiner' | 'debaterA' | 'debaterB' | 'summarizer' | 'system' | null;

export interface AssistantMessageCompleteData {
  worker: 'w1' | 'w2' | 'debaterA' | 'debaterB' | 'summarizer' | 'refiner';
  fullText: string;
  codeExtracted: boolean;
}

export interface CodeFile {
  path: string;
  content: string;
  status?: 'created' | 'updated' | 'unchanged' | 'deleted';
}

export interface PipelineEventDataMap {
  pipeline_start: { initialState: Pick<CollaborationState, 'initialPrompt' | 'maxTurns'> };
  stage_change: { newStage: Stage; message?: string };
  prompt_refined: { refinedPrompt: string };
  file_create: { path: string; content: string };
  folder_create: { path: string };
  file_update: { filename: string; content: string };
  status_update: { message: string; worker?: PipelineWorker };
  assistant_chunk: { worker: PipelineWorker; chunk: string };
  assistant_done: { worker: PipelineWorker };
  assistant_message_complete: AssistantMessageCompleteData;
  pipeline_error: { message: string };
  pipeline_finish: { finalState: Pick<CollaborationState, 'projectFiles' | 'requiredPackages'> };
  review_result: {
    status: "APPROVED" | "REVISION_NEEDED" | "ERROR" | "UNKNOWN";
    key_issues: string[];
    next_action_for_w1: string;
  };
  install_command_found: { command: string };
  install_summary: { commands: string[] };

  // --- Debate Stage Events ---
  debate_agent_chunk: { agent: 'debaterA' | 'debaterB'; chunk: string };
  debate_agent_message_complete: { agent: 'debaterA' | 'debaterB'; fullText: string; turn: number };
  debate_summary_chunk: { agent: 'summarizer'; chunk: string };
  debate_result_summary: {
    summaryText: string;
    agreedPlan?: string;
    options?: string[];
    requiresResolution: boolean;
    fullTranscript: AiChatMessage[]; // <<< THIS LINE IS ADDED/CONFIRMED
  };

  // --- Scaffold Stage Events ---
  scaffold_result: { // This type was defined but not explicitly used by scaffoldStage/pipeline for yielding PipelineEvents
    files: CodeFile[];
    summary: string;
    projectFiles: Record<string, string>;
  };
}

export type PipelineEvent = {
  [K in keyof PipelineEventDataMap]: { type: K; data: PipelineEventDataMap[K] }
}[keyof PipelineEventDataMap];

export interface WorkerConfig {
  provider: 'openai' | 'ollama';
  model: string;
  apiKey?: string;
}

export interface PipelineParams {
  prompt: string;
  refinerConfig: WorkerConfig;
  worker1Config: WorkerConfig;
  worker2Config: WorkerConfig;
  debaterAConfig?: WorkerConfig; // Already optional, correct
  debaterBConfig?: WorkerConfig; // Already optional, correct
  summarizerConfig?: WorkerConfig; // Already optional, correct
  projectType?: string;
  filename?: string;
  maxTurns?: number;
}

export interface RefineStageParams {
  initialPrompt: string;
  refinerConfig: WorkerConfig;
}

export interface CodegenStageParams {
  filename: string;
  refinedPrompt: string;
  conversationHistory: AiChatMessage[];
  currentCode: string;
  workerConfig: WorkerConfig;
  projectType?: string;
}

export interface ReviewStageParams {
  filename: string;
  refinedPrompt: string;
  conversationHistory: AiChatMessage[];
  projectFiles: Record<string, string>;
  worker1Response: string;
  workerConfig: WorkerConfig;
  projectType?: string;
}

export interface InstallStageParams {
  conversationHistory: AiChatMessage[];
  projectFiles: Record<string, string>;
  workerConfig: WorkerConfig;
  refinedPrompt: string;
  projectType?: string;
}

export interface DebateStageParams {
  refinedPrompt: string;
  conversationHistory: AiChatMessage[];
  debaterAConfig: WorkerConfig;
  debaterBConfig: WorkerConfig;
  summarizerConfig: WorkerConfig;
  maxTurnsPerAgent?: number;
  allowTieBreaker?: boolean; // This was in the plan but not used in debateStage.ts; can be removed or implemented later.
}

export type StageInternalWorker = 'w1' | 'w2' | 'refiner' | 'system'; // Keep as is

export type StageEventDataMap = {
  'codegen-chunk': { content: string };
  'codegen-code-chunk': { content: string };
  'codegen-complete': {
    content: string; // Typically the extracted code
    fullText: string; // The full response from the LLM
    messages: AiChatMessage[]; // The messages sent to and received from the LLM for this stage
    finalCode?: string; // Explicit final code if different from extracted 'content'
  };
  'review-chunk': { content: string };
  'review-complete': {
    fullText: string;
    messages: AiChatMessage[];
  };
  'review_result_internal': { // This seems like an internal detail, not directly a pipeline event.
    status: string;
    key_issues: string[];
    next_action_for_w1: string;
  };
  'file_create': { path: string; content: string }; // Matches PipelineEvent
  'folder_create': { path: string }; // Matches PipelineEvent
  'status_update': { message: string; worker: StageInternalWorker }; // Worker type is more constrained here
  'install_command': { command: string };
  'install_analysis_complete': { commands: string[] };
  'install_no_actions_needed': {};

  // --- Debate stage internal (StageEvent) ---
  'debate_agent_chunk': { agent: 'debaterA' | 'debaterB'; chunk: string }; // Matches PipelineEvent
  'debate_agent_message_complete': { agent: 'debaterA' | 'debaterB'; fullText: string; turn: number }; // Matches PipelineEvent
  'debate_summary_chunk': { chunk: string }; // PipelineEvent adds 'agent: "summarizer"'
  'debate_result_summary': { // This is for the StageEvent yielded by debateStage.ts
    summaryText: string;
    fullTranscript: AiChatMessage[]; // Correctly has fullTranscript
    agreedPlan?: string;
    options?: string[];
    requiresResolution?: boolean; // Made optional to align with how it's set in debateStage (defaults to true if not parsed)
  };

  // --- Scaffold stage internal (StageEvent) ---
  // These are fine as internal stage events. The pipeline currently handles file/folder_create directly.
  'scaffold_chunk': { chunk: string };
  'scaffold_complete': {
    files: CodeFile[];
    summary: string;
    messages: AiChatMessage[];
    projectFiles: Record<string, string>;
  };
};

export type StageEvent = {
  [K in keyof StageEventDataMap]: { type: K; data: StageEventDataMap[K] }
}[keyof StageEventDataMap];

// ======================================================================================
// FILE EXPLANATION: lib/orchestration/stages/types.ts
// ======================================================================================
//
// This TypeScript file serves as the central repository for type definitions used
// throughout the VibeCodeDuo AI collaboration pipeline, particularly for defining the
// structure of data passed between stages, events communicated to the frontend,
// and configuration objects.
//
// Key Type Categories Defined:
//
// 1. Core Data Structures:
//    - `AiChatMessage`: Defines the structure for messages exchanged with AI models,
//      including `role` (user, assistant, system, tool), `content`, and optional `name`.
//    - `Stage`: An enumeration of all possible stages the pipeline can be in (e.g.,
//      'refining_prompt', 'debating_plan', 'coding_turn').
//    - `CollaborationState`: A comprehensive interface describing the overall state
//      of the pipeline at any given time. It includes prompts, turn counts, project
//      files, conversation history, current worker, errors, etc.
//    - `PipelineWorker`: A type defining the possible "senders" or workers in the
//      pipeline, including AI agents ('w1', 'w2', 'refiner', 'debaterA', 'debaterB',
//      'summarizer') and 'system'.
//    - `CodeFile`: Represents a file within the generated project, with `path` and `content`.
//    - `WorkerConfig`: Defines the configuration for an AI worker/model, including
//      `provider` (openai, ollama), `model` name, and optional `apiKey`.
//
// 2. Pipeline Parameters:
//    - `PipelineParams`: Specifies the input parameters required to start the
//      `collaborationPipeline`. This includes the initial `prompt`, configurations for
//      the refiner, worker1, and worker2, and optional configurations for debate agents
//      (which default to using worker1/worker2/refiner configs).
//
// 3. Stage-Specific Parameters:
//    - Interfaces like `ScaffoldStageParams`, `RefineStageParams`, `CodegenStageParams`,
//      `ReviewStageParams`, `InstallStageParams`, and `DebateStageParams` define the
//      specific inputs required by each individual stage function.
//
// 4. Pipeline Events (`PipelineEventDataMap` and `PipelineEvent`):
//    - `PipelineEventDataMap`: A crucial mapped type that defines the structure of data (`data`
//      payload) associated with each type of event that the `collaborationPipeline`
//      can yield to the frontend. The keys of this map are event type strings (e.g.,
//      'pipeline_start', 'file_create', 'assistant_chunk', 'debate_result_summary').
//    - `PipelineEvent`: A discriminated union type created from `PipelineEventDataMap`.
//      An object of this type will have a `type` property (one of the event type strings)
//      and a `data` property whose structure matches the definition in
//      `PipelineEventDataMap` for that specific `type`. These are the events the
//      frontend (`useBuildStream`) directly consumes.
//    - Includes definitions for new debate-related pipeline events:
//      - `debate_agent_chunk`
//      - `debate_agent_message_complete`
//      - `debate_summary_chunk`
//      - `debate_result_summary` (updated to include `fullTranscript`)
//
// 5. Stage-Internal Events (`StageEventDataMap` and `StageEvent`):
//    - `StageEventDataMap`: Similar to `PipelineEventDataMap`, but defines the events
//      that individual stage functions (like `codegenStage` or `debateStage`) yield
//      *internally* to the `collaborationPipeline`.
//    - `StageEvent`: A discriminated union type for these internal stage events.
//    - The `collaborationPipeline` consumes these `StageEvent`s and often transforms or
//      re-yields them as `PipelineEvent`s. Sometimes the structure is identical,
//      sometimes it's adapted (e.g., `debate_summary_chunk` from `StageEvent` gets an
//      `agent: 'summarizer'` field when it becomes a `PipelineEvent`).
//    - The `debate_result_summary` in `StageEventDataMap` correctly includes
//      `fullTranscript`, which `debateStage.ts` yields.
//
// 6. Miscellaneous Types:
//    - `AssistantMessageCompleteData`: Defines the payload for the
//      `assistant_message_complete` event.
//    - `StageInternalWorker`: A more restricted set of worker types for status updates
//      originating from within a stage's internal logic.
//
// Purpose and Importance:
// - Type Safety: Provides strong typing across the backend orchestration and for the
//   data contract with the frontend, reducing runtime errors and improving developer
//   experience.
// - Clarity: Acts as a clear specification for the data structures and events involved
//   in the pipeline.
// - Maintainability: Centralizing type definitions makes it easier to understand and
//   modify the pipeline's data flow.
// - Frontend-Backend Contract: `PipelineEventDataMap` is particularly vital as it defines
//   the precise "language" spoken between the server-side pipeline and the client-side
//   UI via Server-Sent Events. Any changes here must be coordinated.
//
// Recent Changes (for Debate Stage):
// - Added `debaterA`, `debaterB`, `summarizer` to `PipelineWorker`.
// - Added `debating_plan` to `Stage`.
// - Added `debaterAConfig`, `debaterBConfig`, `summarizerConfig` (as optional) to `PipelineParams`.
// - Defined `DebateStageParams`.
// - Added new event types and their data structures to `PipelineEventDataMap` and
//   `StageEventDataMap` for the debate stage.
// - **Crucially, updated `PipelineEventDataMap['debate_result_summary']` to include
//   `fullTranscript: AiChatMessage[];` to ensure the full debate transcript can be
//   passed to and processed by the frontend.**
//