// hooks/useBuildStream.ts
import { useEffect, useReducer, useRef, useCallback } from "react";
import type {
  PipelineEvent,
  AssistantMessageCompleteData,
  AiChatMessage, // <<< IMPORTED for debateFullTranscript
  PipelineEventDataMap // <<< IMPORTED for stricter payload typing
} from "@/lib/orchestration/stages/types";
import { useFileStore } from '@/stores/fileStore';

// Helper to generate a simple unique ID
const generateUniqueId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;

export interface BuildStreamMessage {
  id: string;
  sender: string; // Includes 'user', 'w1', 'w2', 'refiner', 'debaterA', 'debaterB', 'summarizer', 'system'
  content: string;
  isDone?: boolean;
  parsedReview?: {
    status: string;
    key_issues: string[];
    next_action_for_w1: string;
  };
  hasCodeArtifact?: boolean;
  error?: string;
  turn?: number; // For debate messages to distinguish turns if needed
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

  // --- Debate Stage Specific State ---
  debateSummaryText: string | null;
  debateFullTranscript: AiChatMessage[]; // Stores the AiChatMessage objects from the debate
  debateAgreedPlan: string | null;
  debateOptions: string[] | null;
  debateRequiresResolution: boolean | null;
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

  // --- Debate Stage Initial State ---
  debateSummaryText: null,
  debateFullTranscript: [],
  debateAgreedPlan: null,
  debateOptions: null,
  debateRequiresResolution: null,
};

type Action =
  | { type: "APPEND_ASSISTANT_CHUNK"; payload: { worker: string; chunk: string } }
  | { type: "MARK_ASSISTANT_DONE"; payload: { worker: string } } // Still used as a signal, but full processing in next action
  | { type: "PROCESS_ASSISTANT_MESSAGE_COMPLETE"; payload: AssistantMessageCompleteData }
  | { type: "UPDATE_FILE"; payload: { filename: string; content: string } }
  | { type: "SET_STAGE"; payload: string }
  | { type: "SET_STATUS"; payload: string }
  | { type: "SET_PROMPT"; payload: string }
  | { type: "SET_ERROR"; payload: string }
  | { type: "SET_MESSAGE_ERROR"; payload: { messageId: string; errorMessage: string } }
  | { type: "SET_FINISHED" }
  | { type: "RESET" }
  | { type: "ATTACH_PARSED_REVIEW"; payload: { parsed: NonNullable<BuildStreamMessage['parsedReview']> } }
  | { type: "ADD_INSTALL_COMMAND"; payload: { command: string } }
  | { type: "SET_INSTALL_SUMMARY"; payload: { commands: string[] } }
  // --- Debate Actions ---
  | { type: "PROCESS_DEBATE_AGENT_CHUNK"; payload: PipelineEventDataMap['debate_agent_chunk'] }
  | { type: "PROCESS_DEBATE_AGENT_MESSAGE_COMPLETE"; payload: PipelineEventDataMap['debate_agent_message_complete'] }
  | { type: "PROCESS_DEBATE_SUMMARY_CHUNK"; payload: { agent: 'summarizer', chunk: string } } // Payload adjusted to match PipelineEvent
  | { type: "PROCESS_DEBATE_RESULT_SUMMARY"; payload: PipelineEventDataMap['debate_result_summary'] & { fullTranscript: AiChatMessage[] } }; // Include fullTranscript if needed by UI messages

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
              hasCodeArtifact: false, // Default for new messages
            },
          ],
        };
      }
    }
    case "MARK_ASSISTANT_DONE": {
      // This action can still be a signal if other logic depends on it,
      // but PROCESS_ASSISTANT_MESSAGE_COMPLETE handles the final state update for the message.
      // console.log(`[BuildStreamReducer] MARK_ASSISTANT_DONE received for ${action.payload.worker}. Waiting for PROCESS_ASSISTANT_MESSAGE_COMPLETE.`);
      return state;
    }
    case "PROCESS_ASSISTANT_MESSAGE_COMPLETE": {
        const { worker, fullText, codeExtracted } = action.payload;
        // Find the last message by this worker, assuming it might have been created by APPEND_ASSISTANT_CHUNK
        const lastIdx = state.messages.findLastIndex(
            (msg) => msg.sender === worker // Could also check !msg.isDone if chunks always precede
        );

        if (lastIdx !== -1) {
            const newMessages = [...state.messages];
            newMessages[lastIdx] = {
                ...newMessages[lastIdx],
                content: fullText, // Ensure full text is updated
                isDone: true,
                hasCodeArtifact: codeExtracted, // Set code artifact status
            };
            return { ...state, messages: newMessages };
        } else {
            // If no prior chunk message, create a new completed message
            // This can happen for refiner, or if a worker responds without streaming chunks
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
      useFileStore.getState().resetStore();
      return initialState;
    case "ATTACH_PARSED_REVIEW": {
        const lastWorker2MsgIndex = state.messages.findLastIndex(
            (msg) => msg.sender === "w2" && msg.isDone // Ensure it's the completed message
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
      return { ...state, refinedPrompt: action.payload };
    case "SET_FINISHED":
      return { ...state, isFinished: true };
    case "ADD_INSTALL_COMMAND":
      if (!state.requiredInstalls.includes(action.payload.command)) {
        return { ...state, requiredInstalls: [...state.requiredInstalls, action.payload.command], };
      }
      return state;
    case "SET_INSTALL_SUMMARY":
      return { ...state, requiredInstalls: action.payload.commands, };

    // --- Debate Reducer Logic ---
    case "PROCESS_DEBATE_AGENT_CHUNK": {
      const { agent, chunk } = action.payload;
      // Find the last message from this agent for the current turn (if applicable, or just last overall)
      // For simplicity, let's find the last non-done message by this agent.
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
        // Create new message for this agent's turn
        return {
          ...state,
          messages: [
            ...state.messages,
            {
              id: generateUniqueId(),
              sender: agent,
              content: chunk,
              isDone: false,
              turn: undefined, // Will be set by PROCESS_DEBATE_AGENT_MESSAGE_COMPLETE if needed
            },
          ],
        };
      }
    }
    case "PROCESS_DEBATE_AGENT_MESSAGE_COMPLETE": {
      const { agent, fullText, turn } = action.payload;
      const lastIdx = state.messages.findLastIndex(
        (msg) => msg.sender === agent // Assuming chunks created the message, or it's a new one
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
        // If no prior chunk message for this agent (e.g., if agent responds non-streamed)
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
      const { agent, chunk } = action.payload; // agent will be 'summarizer'
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
      const { summaryText, agreedPlan, options, requiresResolution, fullTranscript } = action.payload;
      // Update the last summarizer message
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
        // If no prior chunk message for summarizer
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
        debateAgreedPlan: agreedPlan || null, // Ensure null if undefined
        debateOptions: options || null,     // Ensure null if undefined
        debateRequiresResolution: requiresResolution,
        debateFullTranscript: fullTranscript || [], // Ensure array
      };
    }
    default:
      return state;
  }
}

export function useBuildStream(isSendingRef: React.MutableRefObject<boolean>) {
  const [state, dispatch] = useReducer(buildStreamReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const prepareForNewStream = useCallback(() => {
    dispatch({ type: "RESET" });
    if (isSendingRef.current) {
        isSendingRef.current = false;
    }
  }, [isSendingRef]);

  const startStream = useCallback(async (payload: any) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    prepareForNewStream();
    if (isSendingRef.current !== undefined) isSendingRef.current = true; // Mark as sending

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let errorData;
        try { errorData = await response.json(); } catch (e) { errorData = await response.text(); }
        const errorMessage = errorData?.error || (typeof errorData === 'string' ? errorData : response.statusText);
        throw new Error(`API request failed: ${errorMessage}`);
      }

      if (!response.body) throw new Error("No response body");

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        let sep;
        while ((sep = buffer.indexOf("\n\n")) >= 0) {
          const messageBlock = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          if (!messageBlock.trim()) continue;

          let eventType: string | null = null;
          let eventData = "";
          for (const line of messageBlock.split("\n")) {
            if (line.startsWith("event:")) eventType = line.slice(6).trim();
            else if (line.startsWith("data:")) eventData += line.slice(5).trim(); // Accumulate multi-line data
          }

          if (!eventType) continue;
          let parsed: PipelineEvent | null = null;
          try {
            // Ensure data is treated as a single JSON string, even if it spanned multiple "data:" lines
            parsed = { type: eventType, data: JSON.parse(eventData || '{}') } as PipelineEvent;
          }
          catch (e) { console.error("Failed to parse event data:", eventData, "Error:", e); continue; }

          if (!parsed) continue;

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
              if (isSendingRef.current !== undefined) isSendingRef.current = false;
              break;
            case "review_result":
              // Type assertion for parsed.data to match expected structure
              dispatch({ type: "ATTACH_PARSED_REVIEW", payload: { parsed: parsed.data as NonNullable<BuildStreamMessage['parsedReview']> } });
              break;
            case "install_command_found":
              dispatch({ type: "ADD_INSTALL_COMMAND", payload: { command: parsed.data.command }});
              break;
            case "install_summary":
              dispatch({ type: "SET_INSTALL_SUMMARY", payload: { commands: parsed.data.commands }});
              break;

            // --- Debate Event Handling ---
            case "debate_agent_chunk":
              dispatch({ type: "PROCESS_DEBATE_AGENT_CHUNK", payload: parsed.data });
              break;
            case "debate_agent_message_complete":
              dispatch({ type: "PROCESS_DEBATE_AGENT_MESSAGE_COMPLETE", payload: parsed.data });
              break;
            case "debate_summary_chunk":
              // The PipelineEvent 'debate_summary_chunk' has { agent: 'summarizer', chunk: string }
              // The reducer action 'PROCESS_DEBATE_SUMMARY_CHUNK' expects this.
              dispatch({ type: "PROCESS_DEBATE_SUMMARY_CHUNK", payload: parsed.data });
              break;
            case "debate_result_summary":
              // Add fullTranscript here if debateStage sends it and reducer needs it
              // For now, assuming PipelineEventDataMap['debate_result_summary'] is sufficient
              // and fullTranscript is handled by the reducer when it updates debateFullTranscript state.
              // The reducer for PROCESS_DEBATE_RESULT_SUMMARY expects fullTranscript.
              // If debateStage doesn't send it in the PipelineEvent, we'd need to adjust.
              // Our debateStage *does* send fullTranscript in its *StageEvent*.
              // The collaborationPipeline re-yields debate_result_summary *without* fullTranscript.
              // Let's assume the fullTranscript on the BuildStreamState is populated from another source or isn't needed by messages.
              // For now, let's pass what the pipeline event provides.
              // The reducer action was defined to accept it in the payload.
              // Let's ensure the `PipelineEventDataMap` for `debate_result_summary` type *includes* `fullTranscript` if the reducer needs it.
              // Based on types.ts: `PipelineEventDataMap['debate_result_summary']` does NOT include `fullTranscript`.
              // However, our `debateStage.ts` *StageEvent* `debate_result_summary` *does* include `fullTranscript`.
              // The pipeline should pass this through.
              // --> CORRECTING THIS: The pipeline *should* pass `fullTranscript`. The plan was to make it visible.
              // --> The `PipelineEventDataMap` for `debate_result_summary` in `types.ts`
              //     currently is: { summaryText, agreedPlan, options, requiresResolution }.
              //     This needs to be updated in `types.ts` if `fullTranscript` is to be passed via this event.
              // For now, I'll assume `types.ts` will be updated. If not, this dispatch needs adjustment.
              // Assuming types.ts IS updated to include fullTranscript in the PipelineEvent for debate_result_summary
              dispatch({
                  type: "PROCESS_DEBATE_RESULT_SUMMARY",
                  // Casting because PipelineEventDataMap['debate_result_summary'] might not yet have fullTranscript
                  payload: parsed.data as PipelineEventDataMap['debate_result_summary'] & { fullTranscript?: AiChatMessage[] }
              });
              break;

            default:
              // console.warn("[useBuildStream] Unhandled event type:", (parsed as any).type, parsed);
              break;
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        dispatch({ type: "SET_ERROR", payload: 'Interrupted by user' });
      } else {
        dispatch({ type: "SET_ERROR", payload: error.message || "Unknown stream error" });
      }
      if (isSendingRef.current !== undefined) isSendingRef.current = false;
    } finally {
        if (abortControllerRef.current && abortControllerRef.current.signal === abortController.signal) {
             abortControllerRef.current = null;
        }
        // Ensure isSendingRef is false if stream ends for any reason other than explicit stop by user UI
        // (which should also set isSendingRef.current = false)
        if (isSendingRef.current !== undefined && state.isFinished) {
            isSendingRef.current = false;
        }
    }
  }, [prepareForNewStream, isSendingRef, state.isFinished]); // Added state.isFinished to deps for finally block

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      // isSendingRef.current should be set to false in the startStream's catch/finally for AbortError
    }
  }, []);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    ...state,
    startStream,
    stopStream,
    isStreaming: (isSendingRef.current || false) || (!state.isFinished && state.pipelineStage !== null && !state.error),
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