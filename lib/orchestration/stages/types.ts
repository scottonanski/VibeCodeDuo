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

export interface PipelineEventDataMap {
  pipeline_start: { initialState: Pick<CollaborationState, 'initialPrompt' | 'maxTurns'> };
  stage_change: { newStage: Stage; message?: string };
  prompt_refined: { refinedPrompt: string };
  package_proposed: { packageName: string };
  file_proposed: { filename: string };
  file_create: { filename: string; content: string };
  file_update: { filename: string; content: string };
  status_update: { message: string; worker?: 'w1' | 'w2' | 'refiner' | 'system' };
  assistant_chunk: { worker: 'w1' | 'w2' | 'refiner'; chunk: string };
  assistant_done: { worker: 'w1' | 'w2' | 'refiner' };
  pipeline_error: { message: string };
  pipeline_finish: { finalState: Pick<CollaborationState, 'projectFiles' | 'requiredPackages'> };
  review_result: {
    status: string;
    key_issues: string[];
    next_action_for_w1: string;
  };

  // 🆕 New install stage events
  install_command_found: { command: string };
  install_summary: { commands: string[] };
}

// Discriminated union for PipelineEvent
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


// Events yielded by individual stages
export type StageEventDataMap = {
  'codegen-chunk': { content: string };
  'codegen-code-chunk': { content: string };
  'codegen-complete': {
    content: string;
    fullText: string;
    messages: AiChatMessage[];
    finalCode?: string;
  };

  'review-chunk': { content: string };
  'review-complete': {
    fullText: string;
    messages: AiChatMessage[];
  };

  'file_update': { filename: string; content: string };
  'assistant_chunk': { worker: 'w1' | 'w2' | 'refiner'; chunk: string };
  'assistant_done': { worker: 'w1' | 'w2' | 'refiner' };

  // 🆕 Install stage
  'install_command': { command: string };
  'install_analysis_complete': { commands: string[] };
  'install_no_actions_needed': {};
};

export type StageEvent =
  | {
      [K in keyof StageEventDataMap]: { type: K; data: StageEventDataMap[K] }
    }[keyof StageEventDataMap]
  | {
      type: "review_result";
      data: {
        status: string;
        key_issues: string[];
        next_action_for_w1: string;
      };
    };
