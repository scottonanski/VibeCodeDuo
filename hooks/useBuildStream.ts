// hooks/useBuildStream.ts
import React, { useEffect, useReducer, useRef, useCallback } from "react"; // useMemo removed as it's not needed
import type {
  PipelineEvent,
  AssistantMessageCompleteData,
  AiChatMessage,
  PipelineEventDataMap
} from "@/lib/orchestration/stages/types";
import { useFileStore } from '@/stores/fileStore';

const generateUniqueId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;

export interface BuildStreamMessage {
  id: string;
  sender: string;
  content: string;
  isDone?: boolean;
  parsedReview?: {
    status: string;
    key_issues: string[];
    next_action_for_w1: string;
  };
  hasCodeArtifact?: boolean;
  error?: string;
  turn?: number;
}

interface BuildStreamState {
  messages: BuildStreamMessage[];
  projectFiles: Record<string, string>;
  pipelineStage: string | null;
  statusMessage: string | null;
  refinedPrompt: string | null;
  error: string | null;
  isFinished: boolean;
  requiredInstalls: string[];
  debateSummaryText: string | null;
  debateFullTranscript: AiChatMessage[];
  debateAgreedPlan: string | null;
  debateOptions: string[] | null;
  debateRequiresResolution: boolean | null;
  shouldResetFiles?: boolean; // Flag for effect-based reset
}

const initialState: BuildStreamState = {
  messages: [],
  projectFiles: {},
  pipelineStage: null,
  statusMessage: null,
  refinedPrompt: null,
  error: null,
  isFinished: false,
  requiredInstalls: [],
  debateSummaryText: null,
  debateFullTranscript: [],
  debateAgreedPlan: null,
  debateOptions: null,
  debateRequiresResolution: null,
  shouldResetFiles: false, // Initialize the flag
};

type Action =
  | { type: "APPEND_ASSISTANT_CHUNK"; payload: { worker: string; chunk: string } }
  | { type: "MARK_ASSISTANT_DONE"; payload: { worker: string } }
  | { type: "PROCESS_ASSISTANT_MESSAGE_COMPLETE"; payload: AssistantMessageCompleteData }
  | { type: "UPDATE_FILE"; payload: { filename: string; content: string } }
  | { type: "SET_STAGE"; payload: string }
  | { type: "SET_STATUS"; payload: string }
  | { type: "SET_PROMPT"; payload: string }
  | { type: "SET_ERROR"; payload: string }
  | { type: "SET_MESSAGE_ERROR"; payload: { messageId: string; errorMessage: string } }
  | { type: "SET_FINISHED" }
  | { type: "RESET" }
  | { type: "FILES_RESET_DONE" } // New action to clear the flag
  | { type: "ATTACH_PARSED_REVIEW"; payload: { parsed: NonNullable<BuildStreamMessage['parsedReview']> } }
  | { type: "ADD_INSTALL_COMMAND"; payload: { command: string } }
  | { type: "SET_INSTALL_SUMMARY"; payload: { commands: string[] } }
  | { type: "PROCESS_DEBATE_AGENT_CHUNK"; payload: PipelineEventDataMap['debate_agent_chunk'] }
  | { type: "PROCESS_DEBATE_AGENT_MESSAGE_COMPLETE"; payload: PipelineEventDataMap['debate_agent_message_complete'] }
  | { type: "PROCESS_DEBATE_SUMMARY_CHUNK"; payload: { agent: 'summarizer', chunk: string } }
  | { type: "PROCESS_DEBATE_RESULT_SUMMARY"; payload: PipelineEventDataMap['debate_result_summary'] & { fullTranscript?: AiChatMessage[] } };

function buildStreamReducer(state: BuildStreamState, action: Action): BuildStreamState {
  switch (action.type) {
    case "APPEND_ASSISTANT_CHUNK": {
      const { worker, chunk } = action.payload;
      const lastIdx = state.messages.findLastIndex(
        (msg) => msg.sender === worker && !msg.isDone
      );
      if (lastIdx !== -1) {
        const newMessages = [...state.messages];
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          content: newMessages[lastIdx].content + chunk,
        };
        return { ...state, messages: newMessages };
      } else {
        return {
          ...state,
          messages: [
            ...state.messages,
            {
              id: generateUniqueId(),
              sender: worker,
              content: chunk,
              isDone: false,
              hasCodeArtifact: false,
            },
          ],
        };
      }
    }
    case "MARK_ASSISTANT_DONE": {
      return state;
    }
    case "PROCESS_ASSISTANT_MESSAGE_COMPLETE": {
        const { worker, fullText, codeExtracted } = action.payload;
        const lastIdx = state.messages.findLastIndex(
            (msg) => msg.sender === worker
        );

        if (lastIdx !== -1) {
            const newMessages = [...state.messages];
            newMessages[lastIdx] = {
                ...newMessages[lastIdx],
                content: fullText,
                isDone: true,
                hasCodeArtifact: codeExtracted,
            };
            return { ...state, messages: newMessages };
        } else {
            return {
                ...state,
                messages: [
                    ...state.messages,
                    {
                        id: generateUniqueId(),
                        sender: worker,
                        content: fullText,
                        isDone: true,
                        hasCodeArtifact: codeExtracted,
                    },
                ],
            };
        }
    }
    case "SET_ERROR":
      return { ...state, error: action.payload, isFinished: true, pipelineStage: "Error" };
    case "SET_MESSAGE_ERROR": {
        const { messageId, errorMessage } = action.payload;
        return {
            ...state,
            messages: state.messages.map((msg) =>
                msg.id === messageId ? { ...msg, error: errorMessage, isDone: true } : msg
            ),
        };
    }
    case "RESET":
      return { ...initialState, shouldResetFiles: true }; // Keep other initial state fields, set flag
    case "FILES_RESET_DONE": // New case to clear the flag
      return { ...state, shouldResetFiles: false };
    case "ATTACH_PARSED_REVIEW": {
        const lastWorker2MsgIndex = state.messages.findLastIndex(
            (msg) => msg.sender === "w2" && msg.isDone
        );
        if (lastWorker2MsgIndex === -1) return state;
        const newMessages = [...state.messages];
        newMessages[lastWorker2MsgIndex] = {
            ...newMessages[lastWorker2MsgIndex],
            parsedReview: action.payload.parsed,
        };
        return { ...state, messages: newMessages };
    }
    case "UPDATE_FILE":
      return { ...state, projectFiles: { ...state.projectFiles, [action.payload.filename]: action.payload.content, }, };
    case "SET_STAGE":
      return { ...state, pipelineStage: action.payload };
    case "SET_STATUS":
      return { ...state, statusMessage: action.payload };
    case "SET_PROMPT":
    //   console.log('[buildStreamReducer] SET_PROMPT - Before update:', { currentPrompt: state.refinedPrompt });
    //   console.log('[buildStreamReducer] SET_PROMPT - New value:', action.payload);
      const updatedState = { ...state, refinedPrompt: action.payload };
    //   console.log('[buildStreamReducer] SET_PROMPT - After update:', { updatedPrompt: updatedState.refinedPrompt });
      return updatedState;
    case "SET_FINISHED":
      return { ...state, isFinished: true };
    case "ADD_INSTALL_COMMAND":
      if (!state.requiredInstalls.includes(action.payload.command)) {
        return { ...state, requiredInstalls: [...state.requiredInstalls, action.payload.command], };
      }
      return state;
    case "SET_INSTALL_SUMMARY":
      return { ...state, requiredInstalls: action.payload.commands, };
    case "PROCESS_DEBATE_AGENT_CHUNK": {
      const { agent, chunk } = action.payload;
      const lastIdx = state.messages.findLastIndex(
        (msg) => msg.sender === agent && !msg.isDone
      );
      if (lastIdx !== -1) {
        const newMessages = [...state.messages];
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          content: newMessages[lastIdx].content + chunk,
        };
        return { ...state, messages: newMessages };
      } else {
        return {
          ...state,
          messages: [
            ...state.messages,
            {
              id: generateUniqueId(),
              sender: agent,
              content: chunk,
              isDone: false,
              turn: undefined,
            },
          ],
        };
      }
    }
    case "PROCESS_DEBATE_AGENT_MESSAGE_COMPLETE": {
      const { agent, fullText, turn } = action.payload;
      const lastIdx = state.messages.findLastIndex(
        (msg) => msg.sender === agent
      );
      if (lastIdx !== -1) {
        const newMessages = [...state.messages];
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          content: fullText,
          isDone: true,
          turn: turn,
        };
        return { ...state, messages: newMessages };
      } else {
        return {
          ...state,
          messages: [
            ...state.messages,
            {
              id: generateUniqueId(),
              sender: agent,
              content: fullText,
              isDone: true,
              turn: turn,
            },
          ],
        };
      }
    }
    case "PROCESS_DEBATE_SUMMARY_CHUNK": {
      const { agent, chunk } = action.payload;
      const lastIdx = state.messages.findLastIndex(
        (msg) => msg.sender === agent && !msg.isDone
      );
      if (lastIdx !== -1) {
        const newMessages = [...state.messages];
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          content: newMessages[lastIdx].content + chunk,
        };
        return { ...state, messages: newMessages };
      } else {
        return {
          ...state,
          messages: [
            ...state.messages,
            {
              id: generateUniqueId(),
              sender: agent,
              content: chunk,
              isDone: false,
            },
          ],
        };
      }
    }
    case "PROCESS_DEBATE_RESULT_SUMMARY": {
    //   console.log('[buildStreamReducer] PROCESS_DEBATE_RESULT_SUMMARY - Before update:', {
    //     currentSummary: state.debateSummaryText,
    //     currentPlan: state.debateAgreedPlan
    //   });
    //   console.log('[buildStreamReducer] PROCESS_DEBATE_RESULT_SUMMARY payload:', action.payload);
      const { summaryText, agreedPlan, options, requiresResolution, fullTranscript } = action.payload;
      const lastSummarizerIdx = state.messages.findLastIndex(
        (msg) => msg.sender === 'summarizer'
      );
      let newMessages = [...state.messages];
      if (lastSummarizerIdx !== -1) {
        newMessages[lastSummarizerIdx] = {
          ...newMessages[lastSummarizerIdx],
          content: summaryText,
          isDone: true,
        };
      } else {
        newMessages.push({
          id: generateUniqueId(),
          sender: 'summarizer',
          content: summaryText,
          isDone: true,
        });
      }
      return {
        ...state,
        messages: newMessages,
        debateSummaryText: summaryText,
        debateAgreedPlan: agreedPlan || null,
        debateOptions: options || null,
        debateRequiresResolution: requiresResolution,
        debateFullTranscript: fullTranscript || [],
      };
    }
    default:
      return state;
  }
}

export function useBuildStream(pageLevelIsSendingRef: React.MutableRefObject<boolean>) {
  const [state, dispatch] = useReducer(buildStreamReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Effect for resetting files (this pattern is generally okay)
  useEffect(() => {
    if (state.shouldResetFiles) {
      console.log('[useBuildStream] Resetting file store via effect');
      useFileStore.getState().resetStore();
      dispatch({ type: "FILES_RESET_DONE" });
    }
  }, [state.shouldResetFiles]); // Only depends on the flag

  // Logging effect - simplified to reduce potential issues
  const prevStateRef = useRef<BuildStreamState>(initialState);
  useEffect(() => {
    const hasRefinedPromptChanged = state.refinedPrompt !== prevStateRef.current.refinedPrompt;
    const hasDebateSummaryChanged = state.debateSummaryText !== prevStateRef.current.debateSummaryText;
    const hasPlanChanged = state.debateAgreedPlan !== prevStateRef.current.debateAgreedPlan;
    
    if (hasRefinedPromptChanged || hasDebateSummaryChanged || hasPlanChanged) {
      console.log('[useBuildStream] Important state updated:', {
        refinedPromptLength: state.refinedPrompt?.length || 0,
        debateSummaryLength: state.debateSummaryText?.length || 0, 
        planLength: state.debateAgreedPlan?.length || 0,
        timestamp: Date.now()
      });
      prevStateRef.current = {...state};
    }
  }, [state.refinedPrompt, state.debateSummaryText, state.debateAgreedPlan]);
  // `dispatch` is stable, `pageLevelIsSendingRef` is stable (it's a ref object)
  const prepareForNewStream = useCallback(() => {
    dispatch({ type: "RESET" });
    // Let startStream manage pageLevelIsSendingRef.current
  }, []);

  const startStream = useCallback(async (payload: any) => {
    // 1. Abort any existing stream AND clear its ref immediately
    if (abortControllerRef.current) {
      console.log('[useBuildStream] startStream: Aborting previous stream.');
      abortControllerRef.current.abort();
    }
    // 2. Create a new controller for THIS stream attempt
    const currentStreamAbortController = new AbortController();
    abortControllerRef.current = currentStreamAbortController;

    // 3. Reset state and signal start
    prepareForNewStream();
    pageLevelIsSendingRef.current = true;
    dispatch({ type: 'SET_STAGE', payload: 'initiating_stream' }); // Optional: an early stage update

    try {
      console.log('[useBuildStream] startStream: Fetching /api/chat');
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: currentStreamAbortController.signal,
      });

      if (currentStreamAbortController.signal.aborted) {
        console.log('[useBuildStream] startStream: Fetch aborted before response processing.');
        throw new DOMException('Aborted by user or new stream', 'AbortError');
      }

      if (!response.ok) {
        let errorData;
        try { errorData = await response.json(); } catch (e) { errorData = await response.text(); }
        const errorMessage = errorData?.error || (typeof errorData === 'string' ? errorData : response.statusText);
        throw new Error(`API request failed: ${errorMessage}`);
      }

      if (!response.body) throw new Error("No response body");
      console.log('[useBuildStream] startStream: Stream connected, reading data.');

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";

      while (true) {
        if (currentStreamAbortController.signal.aborted) {
          console.log('[useBuildStream] startStream: Reading loop aborted.');
          break;
        }
        const { done, value } = await reader.read();
        if (done) {
          console.log('[useBuildStream] startStream: Stream finished (reader done).');
          break;
        }
        buffer += value;
        let sep;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          if (currentStreamAbortController.signal.aborted) break;
          const messageBlock = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          if (!messageBlock.trim()) continue;
          if (currentStreamAbortController.signal.aborted) break;
          let eventType: string | null = null;
          let eventData = "";
          for (const line of messageBlock.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) eventData += line.slice(5).trim();
          }
          if (!eventType) continue;
          let parsed: PipelineEvent | null = null;
          try {
            parsed = { type: eventType, data: JSON.parse(eventData || '{}') } as PipelineEvent;
          } catch (e) {
            console.error("[useBuildStream] Failed to parse event data:", eventData, "Error:", e);
            continue;
          }
          if (!parsed) continue;
          if (currentStreamAbortController.signal.aborted) break;
          switch (parsed.type) {
            case "pipeline_start": break;
            case "stage_change":
              dispatch({ type: "SET_STAGE", payload: parsed.data.newStage });
              if (parsed.data.message) dispatch({ type: "SET_STATUS", payload: parsed.data.message });
              break;
            case "status_update":
              dispatch({ type: "SET_STATUS", payload: parsed.data.message });
              break;
            case "prompt_refined":
              dispatch({ type: "SET_PROMPT", payload: parsed.data.refinedPrompt });
              break;
            case "folder_create":
              useFileStore.getState().createFileOrFolder(parsed.data.path, "folder");
              break;
            case "file_create":
              useFileStore.getState().createFileOrFolder(parsed.data.path, "file", parsed.data.content);
              dispatch({ type: "UPDATE_FILE", payload: { filename: parsed.data.path, content: parsed.data.content } });
              break;
            case "file_update":
              useFileStore.getState().updateFileContent(parsed.data.filename, parsed.data.content);
              dispatch({ type: "UPDATE_FILE", payload: parsed.data });
              break;
            case "assistant_chunk":
              dispatch({ type: "APPEND_ASSISTANT_CHUNK", payload: { worker: parsed.data.worker as string, chunk: parsed.data.chunk } });
              break;
            case "assistant_done":
              dispatch({ type: "MARK_ASSISTANT_DONE", payload: { worker: parsed.data.worker as string } });
              break;
            case "assistant_message_complete":
              dispatch({ type: "PROCESS_ASSISTANT_MESSAGE_COMPLETE", payload: parsed.data as AssistantMessageCompleteData });
              break;
            case "pipeline_error":
              dispatch({ type: "SET_ERROR", payload: parsed.data.message });
              break;
            case "pipeline_finish":
              dispatch({ type: "SET_FINISHED" });
              break;
            case "review_result":
              dispatch({ type: "ATTACH_PARSED_REVIEW", payload: { parsed: parsed.data as NonNullable<BuildStreamMessage['parsedReview']> } });
              break;
            case "install_command_found":
              dispatch({ type: "ADD_INSTALL_COMMAND", payload: { command: parsed.data.command }});
              break;
            case "install_summary":
              dispatch({ type: "SET_INSTALL_SUMMARY", payload: { commands: parsed.data.commands }});
              break;
            case "debate_agent_chunk":
              dispatch({ type: "PROCESS_DEBATE_AGENT_CHUNK", payload: parsed.data });
              break;
            case "debate_agent_message_complete":
              dispatch({ type: "PROCESS_DEBATE_AGENT_MESSAGE_COMPLETE", payload: parsed.data });
              break;
            case "debate_summary_chunk":
              dispatch({ type: "PROCESS_DEBATE_SUMMARY_CHUNK", payload: parsed.data });
              break;
            case "debate_result_summary":
              dispatch({
                type: "PROCESS_DEBATE_RESULT_SUMMARY",
                payload: parsed.data as PipelineEventDataMap['debate_result_summary'] & { fullTranscript?: AiChatMessage[] }
              });
              break;
            default:
              break;
          }
        }
        if (currentStreamAbortController.signal.aborted && sep === undefined) break;
      }
    } catch (error: any) {
      if (currentStreamAbortController.signal.aborted || error.name === 'AbortError') {
        console.log('[useBuildStream] startStream: Stream operation aborted.', error.message);
        if (abortControllerRef.current === currentStreamAbortController) {
          dispatch({ type: "SET_ERROR", payload: 'Stream interrupted.' });
        }
      } else {
        console.error('[useBuildStream] startStream: Stream error:', error);
        if (abortControllerRef.current === currentStreamAbortController) {
          dispatch({ type: "SET_ERROR", payload: error.message || "Unknown stream error" });
        }
      }
    } finally {
      console.log('[useBuildStream] startStream: Finally block executing.');
      if (abortControllerRef.current === currentStreamAbortController) {
        pageLevelIsSendingRef.current = false;
        abortControllerRef.current = null;
        console.log('[useBuildStream] startStream: Active stream instance concluded. pageLevelIsSendingRef set to false, abortControllerRef cleared.');
      } else {
        console.log('[useBuildStream] startStream: Old stream instance finally block, but a newer stream is active. Refs not changed by this instance.');
      }
    }
  }, [prepareForNewStream]);

  const stopStream = useCallback(() => {
    console.log('[useBuildStream] stopStream CALLED. Current abortControllerRef:', abortControllerRef.current);
    console.trace('[useBuildStream] stopStream trace');
    if (abortControllerRef.current) {
      console.log('[useBuildStream] stopStream: Aborting current stream.');
      abortControllerRef.current.abort();
    } else {
      console.log('[useBuildStream] stopStream: No active stream to stop.');
      pageLevelIsSendingRef.current = false;
    }
  }, []);

  useEffect(() => {
    return () => {
      const controllerToCleanUp = abortControllerRef.current;
      console.log('[useBuildStream] Unmount cleanup effect RUNNING. Controller to clean:', controllerToCleanUp);
      console.trace('[useBuildStream] Unmount cleanup trace');
      if (controllerToCleanUp) {
        controllerToCleanUp.abort();
      }
      pageLevelIsSendingRef.current = false;
      abortControllerRef.current = null;
    };
  }, []);

  // isStreaming is now purely derived from state and the ref
  // pageLevelIsSendingRef.current gives an immediate view of intent to stream or active stream.
  const isStreaming = pageLevelIsSendingRef.current && !state.isFinished && !state.error;

  return {
    messages: state.messages,
    projectFiles: state.projectFiles,
    requiredInstalls: state.requiredInstalls,
    pipelineStage: state.pipelineStage,
    statusMessage: state.statusMessage,
    refinedPrompt: state.refinedPrompt,
    error: state.error,
    isFinished: state.isFinished,
    debateSummaryText: state.debateSummaryText,
    debateFullTranscript: state.debateFullTranscript,
    debateAgreedPlan: state.debateAgreedPlan,
    debateOptions: state.debateOptions,
    debateRequiresResolution: state.debateRequiresResolution,
    startStream,
    stopStream,
    isStreaming,
  };
}

// ======================================================================================
// FILE EXPLANATION: hooks/useBuildStream.ts
// ======================================================================================
//
// This file defines a custom React hook, `useBuildStream`, responsible for managing
// the client-side state and logic related to the AI collaboration pipeline's output.
// It fetches data streamed from the `/api/chat` endpoint (which runs the
// `collaborationPipeline`), processes incoming Server-Sent Events (SSEs), and updates
// the UI state accordingly.
//
// Core Functionalities:
//
// 1. State Management (`BuildStreamState` and `buildStreamReducer`):
//    - Defines `BuildStreamState`, which holds all relevant data for the UI:
//      - `messages`: An array of `BuildStreamMessage` objects representing the chat-like
//        interaction with various AI agents (user, refiner, debaters, summarizer,
//        coder, reviewer). Each message has an `id`, `sender`, `content`, `isDone` status,
//        and potentially `parsedReview` or `error` details.
//      - `projectFiles`: A record of files generated by the scaffold and codegen stages.
//      - `pipelineStage`: The current stage of the backend pipeline (e.g., 'refining_prompt',
//        'debating_plan', 'coding_turn').
//      - `statusMessage`: General status updates from the pipeline.
//      - `refinedPrompt`: The prompt after refinement by the refiner AI.
//      - `error`: Global error messages from the pipeline.
//      - `isFinished`: Boolean indicating if the pipeline has completed.
//      - `requiredInstalls`: List of package installation commands.
//      - Debate-specific state: `debateSummaryText`, `debateFullTranscript` (the raw AI
//        chat messages from the debate), `debateAgreedPlan`, `debateOptions`, and
//        `debateRequiresResolution` to store the outcome of the debate stage.
//    - Uses a `useReducer` hook with `buildStreamReducer` to manage state transitions
//      based on dispatched `Action` objects. Each action corresponds to a type of
//      `PipelineEvent` received from the backend or a UI-initiated operation (like RESET).
//    - The reducer contains logic for:
//      - Appending chunks to existing messages for a live-typing effect.
//      - Marking messages as complete and updating their full content.
//      - Updating file content in `projectFiles`.
//      - Setting various status indicators (`pipelineStage`, `statusMessage`, `error`).
//      - Handling new debate-related events:
//        - `PROCESS_DEBATE_AGENT_CHUNK`: Appends chunks to Debater A/B messages.
//        - `PROCESS_DEBATE_AGENT_MESSAGE_COMPLETE`: Finalizes Debater A/B messages.
//        - `PROCESS_DEBATE_SUMMARY_CHUNK`: Appends chunks to the Summarizer message.
//        - `PROCESS_DEBATE_RESULT_SUMMARY`: Finalizes the Summarizer message and populates
//          the dedicated debate outcome fields in the state.
//
// 2. Stream Handling (`startStream` function):
//    - Initiates a `fetch` request to `/api/chat` with the user's prompt and AI settings.
//    - Handles the Server-Sent Events (SSE) stream from the response.
//    - Parses each event block (lines starting with `event:` and `data:`).
//    - Converts the JSON data from each event into a `PipelineEvent` object.
//    - Dispatches corresponding `Action`s to the `buildStreamReducer` based on the
//      `PipelineEvent.type`. This is where backend events drive frontend state changes.
//    - Manages an `AbortController` to allow stream cancellation (`stopStream`).
//    - Includes error handling for API requests and stream processing.
//
// 3. Utility Functions:
//    - `generateUniqueId`: Creates unique IDs for `BuildStreamMessage` objects,
//      essential for React list rendering and targeted updates.
//    - `prepareForNewStream`: Resets the state to `initialState` before a new stream begins.
//    - `stopStream`: Aborts the ongoing `fetch` request.
//
// 4. Lifecycle Management (`useEffect`):
//    - Ensures that any ongoing stream is aborted when the component using the hook unmounts.
//
// 5. Exposed Values:
//    - The hook returns an object containing:
//      - All fields from `BuildStreamState` (e.g., `messages`, `pipelineStage`,
//        `debateSummaryText`, `error`, `isFinished`).
//      - The `startStream` function to initiate the process.
//      - The `stopStream` function to cancel it.
//      - `isStreaming`: A boolean derived from state indicating if a stream is active.
//
// Integration with Zustand (`useFileStore`):
// - It interacts with a Zustand store (`useFileStore`) to update the global file tree
//   representation when `folder_create`, `file_create`, or `file_update` events are received.
//
// Purpose in the Application:
// `useBuildStream` serves as the central client-side orchestrator for the build process.
// It decouples the UI components (like `BuildInterface`) from the direct handling of
// SSEs and complex state update logic, providing a clean interface for displaying
// real-time progress and results from the AI pipeline. The addition of debate-specific
// actions and state fields allows the UI to represent this new planning phase effectively.
//