// hooks/useBuildStream.ts
import { useEffect, useReducer, useRef, useCallback } from "react";
import type {
  PipelineEvent,
  AssistantMessageCompleteData
} from "@/lib/orchestration/stages/types";
import { useFileStore } from '@/stores/fileStore';

// Helper to generate a simple unique ID
const generateUniqueId = (): string => `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;

export interface BuildStreamMessage {
  id: string; // <<< ADDED for unique identification
  sender: string; 
  content: string;
  isDone?: boolean;
  parsedReview?: { 
    status: string;
    key_issues: string[];
    next_action_for_w1: string;
  };
  hasCodeArtifact?: boolean;
  error?: string; // <<< ADDED for per-message errors (optional)
}

interface BuildStreamState {
  messages: BuildStreamMessage[];
  projectFiles: Record<string, string>; 
  pipelineStage: string | null;
  statusMessage: string | null;
  refinedPrompt: string | null;
  error: string | null; // This is the global pipeline error
  isFinished: boolean;
  requiredInstalls: string[];
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
};

type Action =
  | { type: "APPEND_ASSISTANT_CHUNK"; payload: { worker: string; chunk: string } }
  | { type: "MARK_ASSISTANT_DONE"; payload: { worker: string } }
  | { type: "PROCESS_ASSISTANT_MESSAGE_COMPLETE"; payload: AssistantMessageCompleteData }
  | { type: "UPDATE_FILE"; payload: { filename: string; content: string } }
  | { type: "SET_STAGE"; payload: string }
  | { type: "SET_STATUS"; payload: string }
  | { type: "SET_PROMPT"; payload: string }
  | { type: "SET_ERROR"; payload: string } // For global pipeline error
  | { type: "SET_MESSAGE_ERROR"; payload: { messageId: string; errorMessage: string } } // For per-message error
  | { type: "SET_FINISHED" }
  | { type: "RESET" }
  | { type: "ATTACH_PARSED_REVIEW"; payload: { parsed: BuildStreamMessage["parsedReview"] } }
  | { type: "ADD_INSTALL_COMMAND"; payload: { command: string } }
  | { type: "SET_INSTALL_SUMMARY"; payload: { commands: string[] } };

function buildStreamReducer(state: BuildStreamState, action: Action): BuildStreamState {
  switch (action.type) {
    case "APPEND_ASSISTANT_CHUNK": {
      const { worker, chunk } = action.payload;
      const lastIdx = state.messages.findLastIndex(
        (msg: BuildStreamMessage) => msg.sender === worker && !msg.isDone
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
              id: generateUniqueId(), // <<< ASSIGN ID
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
      const { worker } = action.payload;
      console.log(`[BuildStreamReducer] MARK_ASSISTANT_DONE received for ${worker}. Waiting for PROCESS_ASSISTANT_MESSAGE_COMPLETE.`);
      return state; 
    }
    case "PROCESS_ASSISTANT_MESSAGE_COMPLETE": {
        const { worker, fullText, codeExtracted } = action.payload;
        const lastIdx = state.messages.findLastIndex(
            (msg: BuildStreamMessage) => msg.sender === worker 
        );

        if (lastIdx !== -1) {
            const newMessages = [...state.messages];
            const updatedMessage: BuildStreamMessage = { // Ensure type
                ...newMessages[lastIdx], 
                content: fullText, 
                isDone: true,      
                hasCodeArtifact: codeExtracted, 
                error: newMessages[lastIdx].error // Preserve existing error if any
            };
            newMessages[lastIdx] = updatedMessage;
            return { ...state, messages: newMessages };
        } else {
            const newMessage: BuildStreamMessage = { 
                id: generateUniqueId(), // <<< ASSIGN ID
                sender: worker,
                content: fullText,
                isDone: true,
                hasCodeArtifact: codeExtracted,
            };
            console.warn(`[BuildStreamReducer] Created new message for ${worker} (no prior chunks):`, { ...newMessage, content: newMessage.content.substring(0,100)+"..."});
            return {
                ...state,
                messages: [...state.messages, newMessage],
            };
        }
    }
    case "SET_ERROR": // Global pipeline error
      return { ...state, error: action.payload, isFinished: true }; // Mark finished on global error
    case "SET_MESSAGE_ERROR": { // Per-message error
        const { messageId, errorMessage } = action.payload;
        return {
            ...state,
            messages: state.messages.map((msg: BuildStreamMessage) => 
                msg.id === messageId ? { ...msg, error: errorMessage, isDone: true } : msg
            ),
        };
    }
    case "RESET":
      useFileStore.getState().resetStore();
      return initialState;
    case "ATTACH_PARSED_REVIEW": {
        const lastWorker2MsgIndex = state.messages.findLastIndex(
            (msg: BuildStreamMessage) => msg.sender === "w2"
        );

        if (lastWorker2MsgIndex === -1) return state;

        const newMessages = [...state.messages];
        newMessages[lastWorker2MsgIndex] = {
            ...newMessages[lastWorker2MsgIndex], 
            parsedReview: action.payload.parsed,
        };
        return { ...state, messages: newMessages };
    }
    // ... other cases like UPDATE_FILE, SET_STAGE, etc. remain unchanged ...
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
    default:
      return state;
  }
}

export function useBuildStream(isSendingRef: React.MutableRefObject<boolean>) {
  const [state, dispatch] = useReducer(buildStreamReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const prepareForNewStream = useCallback(() => {
    dispatch({ type: "RESET" });
    if (isSendingRef.current) { // Check if ref is not null before accessing .current
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
        console.error("API Error Response:", errorData);
        const errorMessage = errorData?.error || (typeof errorData === 'string' ? errorData : response.statusText);
        throw new Error(`API request failed with status ${response.status}: ${errorMessage}`);
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
            else if (line.startsWith("data:")) eventData += line.slice(5).trim();
          }

          if (!eventType) continue;
          let parsed: PipelineEvent | null = null;
          try { parsed = { type: eventType, data: JSON.parse(eventData || '{}') } as PipelineEvent; } 
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
              dispatch({ type: "APPEND_ASSISTANT_CHUNK", payload: { worker: parsed.data.worker, chunk: parsed.data.chunk } });
              break;
            case "assistant_done":
              dispatch({ type: "MARK_ASSISTANT_DONE", payload: { worker: parsed.data.worker } });
              break;
            case "assistant_message_complete":
                dispatch({ type: "PROCESS_ASSISTANT_MESSAGE_COMPLETE", payload: parsed.data });
                break;
            case "pipeline_error": // This is for global pipeline errors
              dispatch({ type: "SET_ERROR", payload: parsed.data.message });
              break;
            case "pipeline_finish":
              dispatch({ type: "SET_FINISHED" });
              if (isSendingRef.current) isSendingRef.current = false;
              break;
            case "review_result":
              if ('status' in parsed.data && 'key_issues' in parsed.data && 'next_action_for_w1' in parsed.data) {
                 dispatch({ type: "ATTACH_PARSED_REVIEW", payload: { parsed: parsed.data as NonNullable<BuildStreamMessage['parsedReview']> } });
              }
              break;
            case "install_command_found":
              dispatch({ type: "ADD_INSTALL_COMMAND", payload: { command: parsed.data.command }});
              break;
            case "install_summary":
              dispatch({ type: "SET_INSTALL_SUMMARY", payload: { commands: parsed.data.commands }});
              break;
            default:
              console.warn("[useBuildStream] Unhandled event type:", (parsed as any).type, parsed);
              break;
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted by user.');
        // Optionally set a specific per-message error if you have a way to identify the active message
        dispatch({ type: "SET_ERROR", payload: 'Interrupted by user' }); // Sets global error
      } else {
        console.error("Error in build stream:", error);
        dispatch({ type: "SET_ERROR", payload: error.message || "Unknown stream error" });
      }
      // dispatch({ type: "SET_FINISHED" }); // SET_ERROR now also sets isFinished
      if (isSendingRef.current) isSendingRef.current = false;
    } finally {
        if (abortControllerRef.current && abortControllerRef.current.signal === abortController.signal) {
             abortControllerRef.current = null;
        }
    }
  }, [prepareForNewStream, isSendingRef]);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
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
    isStreaming: !state.isFinished && state.pipelineStage !== null && !state.error, // Global error check
  };
}