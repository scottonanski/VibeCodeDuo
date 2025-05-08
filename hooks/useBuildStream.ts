// hooks/useBuildStream.ts

import { useEffect, useReducer, useRef, useCallback } from "react";
import type {
  PipelineEvent,
  PipelineEventDataMap,
} from "@/lib/orchestration/stages/types";

import { useFileStore } from '@/stores/fileStore';


// Message type for the build stream
interface BuildStreamMessage {
  sender: string;
  content: string;
  isDone?: boolean;
  parsedReview?: {
    status: string;
    key_issues: string[];
    next_action_for_w1: string;
  };
}


// State type for the build stream
interface BuildStreamState {
  messages: BuildStreamMessage[];
  projectFiles: Record<string, string>;
  pipelineStage: string | null;
  statusMessage: string | null;
  refinedPrompt: string | null;
  error: string | null;
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
  | { type: "UPDATE_FILE"; payload: { filename: string; content: string } }
  | { type: "SET_STAGE"; payload: string }
  | { type: "SET_STATUS"; payload: string }
  | { type: "SET_PROMPT"; payload: string }
  | { type: "SET_ERROR"; payload: string }
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
            { sender: worker, content: chunk, isDone: false },
          ],
        };
      }
    }
    case "MARK_ASSISTANT_DONE": {
      const { worker } = action.payload;
      const lastIdx = state.messages.findLastIndex(
        (msg) => msg.sender === worker && !msg.isDone
      );
      if (lastIdx !== -1) {
        const newMessages = [...state.messages];
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          isDone: true,
        };
        return { ...state, messages: newMessages };
      }
      return state;
    }
    case "UPDATE_FILE":
      return {
        ...state,
        projectFiles: {
          ...state.projectFiles,
          [action.payload.filename]: action.payload.content,
        },
      };
    case "SET_STAGE":
      return { ...state, pipelineStage: action.payload };
    case "SET_STATUS":
      return { ...state, statusMessage: action.payload };
    case "SET_PROMPT":
      return { ...state, refinedPrompt: action.payload };
    case "SET_ERROR":
      return { ...state, error: action.payload };
    case "SET_FINISHED":
      return { ...state, isFinished: true };
    case "RESET":
      return initialState;
      case "ATTACH_PARSED_REVIEW": {
        const lastIdx = [...state.messages]
          .reverse()
          .findIndex((msg) => msg.sender === "worker2");
      
        if (lastIdx === -1) return state;
      
        const trueIdx = state.messages.length - 1 - lastIdx;
        const newMessages = [...state.messages];
        newMessages[trueIdx] = {
          ...newMessages[trueIdx],
          parsedReview: action.payload.parsed,
        };
      
        console.log("✅ Attached parsedReview to Worker 2 message:", newMessages[trueIdx]);
      
        return { ...state, messages: newMessages };
      }

      case "ADD_INSTALL_COMMAND":
        return {
          ...state,
          requiredInstalls: [...state.requiredInstalls, action.payload.command],
        };
  
      case "SET_INSTALL_SUMMARY":
        return {
          ...state,
          requiredInstalls: action.payload.commands,
        };
  
      
    default:
      return state;

  }
}

export function useBuildStream(isSendingRef: React.MutableRefObject<boolean>) {
  const [state, dispatch] = useReducer(buildStreamReducer, initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (payload: any) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    dispatch({ type: "RESET" });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });
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
          try {
            parsed = { type: eventType, data: JSON.parse(eventData) } as PipelineEvent;
          } catch { }
          if (!parsed) continue;
          switch (parsed.type) {
            case "install_command_found":
              dispatch({
                type: "ADD_INSTALL_COMMAND",
                payload: { command: parsed.data.command },
              });
              break;

            case "install_summary":
              dispatch({
                type: "SET_INSTALL_SUMMARY",
                payload: { commands: parsed.data.commands },
              });
              break;

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
              case "file_create":
                useFileStore.getState().createFileOrFolder(parsed.data.filename, "file", parsed.data.content);
                break;
              
              case "file_update":
                useFileStore.getState().updateFileContent(parsed.data.filename, parsed.data.content);
                dispatch({ type: "UPDATE_FILE", payload: parsed.data }); // optional but keeps old reducer state in sync
                break;
              
            case "assistant_chunk":
              dispatch({ type: "APPEND_ASSISTANT_CHUNK", payload: { worker: parsed.data.worker, chunk: parsed.data.chunk } });
              break;
            case "assistant_done":
              dispatch({ type: "MARK_ASSISTANT_DONE", payload: { worker: parsed.data.worker } });
              break;
            case "pipeline_error":
              dispatch({ type: "SET_ERROR", payload: parsed.data.message });
              break;
            case "pipeline_finish":
              dispatch({ type: "SET_FINISHED" });
              break;
              case "review_result":
                dispatch({ type: "ATTACH_PARSED_REVIEW", payload: { parsed: parsed.data } });
                break;
              
          }
        }
      }
    } catch (error: any) {
      dispatch({ type: "SET_ERROR", payload: error.message || "Unknown error" });
    }
  }, []);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  useEffect(() => () => stopStream(), [stopStream]);

  return {
    ...state,
    startStream,
    stopStream,
  };
}
