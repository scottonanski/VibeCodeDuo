// lib/orchestration/stages/types.ts

export type AiChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
};

export type Stage =
  | 'initial'
  | 'refining_prompt'
  | 'debating_plan' // Stubbed, for future use
  | 'scaffolding_project' // For the scaffold stage
  | 'installing_deps'
  | 'coding_turn'
  | 'reviewing_turn'
  | 'processing_turn' // Generic processing state if needed
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
  currentWorker: 'w1' | 'w2' | null;
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

// Worker types for pipeline-level status updates
export type PipelineWorker = 'w1' | 'w2' | 'refiner' | 'system';

// --- NEW: Data for assistant_message_complete event ---
export interface AssistantMessageCompleteData {
  worker: 'w1' | 'w2' | 'refiner'; // Which worker's message is complete
  fullText: string;               // The final, full textual content of the AI's message
  codeExtracted: boolean;         // True if code was extracted and applied from this message
}
// --- END NEW ---

// 🔧 EVENT DATA MAPS - For events yielded by the main collaborationPipeline to the frontend/consumer
export interface PipelineEventDataMap {
  pipeline_start: { initialState: Pick<CollaborationState, 'initialPrompt' | 'maxTurns'> };
  stage_change: { newStage: Stage; message?: string };
  prompt_refined: { refinedPrompt: string };
  file_create: { path: string; content: string }; // Yielded by pipeline when scaffoldStage produces it
  folder_create: { path: string };               // Yielded by pipeline when scaffoldStage produces it
  file_update: { filename: string; content: string }; // Yielded by pipeline when codegenStage produces it
  status_update: { message: string; worker?: PipelineWorker }; // Worker types for pipeline-level status
  assistant_chunk: { worker: 'w1' | 'w2' | 'refiner'; chunk: string }; // If pipeline re-yields chunks
  assistant_done: { worker: 'w1' | 'w2' | 'refiner' };  // If pipeline re-yields done signals
  assistant_message_complete: AssistantMessageCompleteData; // <<< NEW EVENT
  pipeline_error: { message: string };
  pipeline_finish: { finalState: Pick<CollaborationState, 'projectFiles' | 'requiredPackages'> };
  review_result: { // This is yielded by the pipeline after processing reviewStage's internal output
    status: "APPROVED" | "REVISION_NEEDED" | "ERROR" | "UNKNOWN"; // Specific statuses from pipeline logic
    key_issues: string[];
    next_action_for_w1: string;
  };
  install_command_found: { command: string }; // Yielded by pipeline from installStage
  install_summary: { commands: string[] };   // Yielded by pipeline from installStage
}

// Discriminated union for events the collaborationPipeline yields
export type PipelineEvent = {
  [K in keyof PipelineEventDataMap]: { type: K; data: PipelineEventDataMap[K] }
}[keyof PipelineEventDataMap];


// --- Worker and Stage Specific Types ---

export interface WorkerConfig {
  provider: 'openai' | 'ollama';
  model: string;
  apiKey?: string; // API key is optional at this level, stages will check/throw if required
}

export interface PipelineParams {
  prompt: string;
  refinerConfig: WorkerConfig;
  worker1Config: WorkerConfig;
  worker2Config: WorkerConfig;
  projectType?: string;
  filename?: string; // Target filename for initial coding, if applicable
  maxTurns?: number;
}

// --- Individual Stage Parameter Types ---

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
  projectFiles: Record<string, string>; // For context
  worker1Response: string; // Full response from Worker 1's coding turn
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

// 🔧 STAGE EVENTS (internal to individual stage logic)
// These are the events that an individual stage like codegenStage, reviewStage, scaffoldStage, etc., might yield.
// The collaborationPipeline will consume these and may re-yield them (possibly transformed) as PipelineEvents.

// Worker types for stage-internal status updates. These must be assignable to PipelineWorker if re-yielded directly.
export type StageInternalWorker = 'w1' | 'w2' | 'refiner' | 'system';

export type StageEventDataMap = {
  // Codegen Stage specific events
  'codegen-chunk': { content: string };
  'codegen-code-chunk': { content: string }; // If distinct from general chunks
  'codegen-complete': {
    content: string; // Often the raw LLM response if not parsed into code directly by stage
    fullText: string; // Guaranteed full text
    messages: AiChatMessage[]; // Messages from this stage's LLM call to add to history
    finalCode?: string; // The extracted code, if the stage parses it
  };

  // Review Stage specific events
  'review-chunk': { content: string };
  'review-complete': {
    fullText: string; // The full textual response from the review LLM
    messages: AiChatMessage[]; // Messages to add to conversation history from review LLM context
  };
  'review_result_internal': { // Internal event from reviewStage before pipeline processes it
    status: string; // Raw status string from LLM (e.g., "APPROVED", "REVISION_NEEDED")
    key_issues: string[];
    next_action_for_w1: string;
  };

  // File operations that a stage might emit (e.g., scaffoldStage)
  'file_create': { path: string; content: string };
  'folder_create': { path: string };

  // General events that any stage might emit
  'status_update': { message: string; worker: StageInternalWorker };

  // Install Stage specific events
  'install_command': { command: string };
  'install_analysis_complete': { commands: string[] }; // Summarizes all commands found
  'install_no_actions_needed': {}; // If no packages need installation
};

// Discriminated union for events that individual stages yield
export type StageEvent = {
  [K in keyof StageEventDataMap]: { type: K; data: StageEventDataMap[K] }
}[keyof StageEventDataMap];