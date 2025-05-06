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
| 'scaffolding'
| 'installing_deps'
| 'coding_turn'
| 'reviewing_turn'
| 'processing_turn'
| 'error'
| 'done';

export interface CollaborationState {
stage: Stage;
initialPrompt: string;
refinedPrompt: string; // No longer null, initialized as empty string
currentTurn: number;
maxTurns: number;
projectFiles: Record<string, string>;
requiredPackages: string[];
conversationHistory: AiChatMessage[];
currentWorker: 'w1' | 'w2' | null;
lastError: string | null;
projectType?: string; // Added from PipelineParams
filename?: string; // Added from PipelineParams, current target file
}

export type PipelineEventDataMap = {
pipeline_start: { initialState: Pick<CollaborationState, 'initialPrompt' | 'maxTurns'> };
stage_change: { newStage: Stage; message?: string };
prompt_refined: { refinedPrompt: string };
package_proposed: { packageName: string }; // For future use
file_proposed: { filename: string };      // For future use with scaffoldStage
file_create: { filename: string; content: string }; // More specific than file_update initially
file_update: { filename: string; content: string };
status_update: { message: string; worker?: 'w1' | 'w2' | 'refiner' | 'system' };
assistant_chunk: { worker: 'w1' | 'w2' | 'refiner'; chunk: string };
assistant_done: { worker: 'w1' | 'w2' | 'refiner' };
pipeline_error: { message: string };
pipeline_finish: { finalState: Pick<CollaborationState, 'projectFiles' | 'requiredPackages'> };
// Add more specific events as needed
};

// Discriminated union for PipelineEvent
export type PipelineEvent = {
[K in keyof PipelineEventDataMap]: { type: K; data: PipelineEventDataMap[K] }
}[keyof PipelineEventDataMap];


// Configuration for AI workers and refiner
export interface WorkerConfig {
  provider: 'openai' | 'ollama';
  model: string;
  apiKey?: string;
  // ollamaBasePath?: string; // if you plan to use it for Ollama via config
}

// Input parameters for the main pipeline function
export interface PipelineParams {
  prompt: string;
  refinerConfig: WorkerConfig;
  worker1Config: WorkerConfig;
  worker2Config: WorkerConfig;
  projectType?: string;
  filename?: string; // Current target filename for codegen/review
  maxTurns?: number;
}

// Specific parameters for each stage function
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
  projectFiles: Record<string, string>; // Entire project context
  worker1Response: string; // Full textual response of Worker 1's last turn
  workerConfig: WorkerConfig;
  projectType?: string;
}

// Events yielded by individual stages (can be more specific)
export type StageEventDataMap = {
  'codegen-chunk': { content: string };
  'codegen-code-chunk': { content: string }; // If you want to differentiate text vs code
  'codegen-complete': { content: string; fullText: string; messages: AiChatMessage[]; finalCode?: string };
  'review-chunk': { content: string };
  'review-complete': { fullText: string; messages: AiChatMessage[]; }; // fullText will be the JSON
  // Add other stage-specific events if needed
};

export type StageEvent = {
[K in keyof StageEventDataMap]: { type: K; data: StageEventDataMap[K] }
}[keyof StageEventDataMap];