import { useEffect, useReducer, useRef, useCallback, useState } from "react";

// Toggle for verbose debug logging
const DEBUG = true;
const debugLog = (...args: any[]) => {
  // if (DEBUG) console.log(...args);
};

// Define the message type tracked internally by the hook/reducer
export type StreamMessage = {
  id: string;
  sender: 'worker1' | 'worker2';
  content: string;
  isComplete: boolean;
  error?: string;
};

// Reducer actions
type Action =
  | { type: 'APPEND_CHUNK'; payload: { sender: 'worker1' | 'worker2'; content: string } }
  | { type: 'MARK_COMPLETE'; payload: { sender: 'worker1' | 'worker2' } }
  | { type: 'MARK_ERROR'; payload: { sender: 'worker1' | 'worker2'; error: string } }
  | { type: 'RESET' };

// Reducer function
const messageReducer = (state: StreamMessage[], action: Action): StreamMessage[] => {
  switch (action.type) {
    case 'APPEND_CHUNK': {
      debugLog('[useChatStream] APPEND_CHUNK', action.payload);
      const { sender, content } = action.payload;
      const lastMessageIndex = state.findLastIndex((msg) => msg.sender === sender);

      if (
        lastMessageIndex !== -1 &&
        !state[lastMessageIndex].isComplete &&
        !state[lastMessageIndex].error
      ) {
        return state.map((msg, index) => {
          if (index === lastMessageIndex) {
            const separator =
              msg.content.length > 0 &&
              !/\s$/.test(msg.content) &&
              !/^[\s.,!?;:]/.test(content)
                ? ' '
                : '';
            return { ...msg, content: msg.content + separator + content };
          } else {
            return msg;
          }
        });
      } else {
        return [
          ...state,
          { id: crypto.randomUUID(), sender, content, isComplete: false },
        ];
      }
    }
    case 'MARK_COMPLETE': {
      const { sender } = action.payload;
      const lastMessageIndex = state.findLastIndex(msg => msg.sender === sender);
      if (lastMessageIndex !== -1) {
        return state.map((msg, index) =>
          index === lastMessageIndex
            ? {
                ...msg,
                isComplete: true,
                content: msg.content.replace(/<think>.*?<\/think>/gis, '').trim(),
              }
            : msg
        );
      }
      return state;
    }
    case 'MARK_ERROR': {
      const { sender, error } = action.payload;
      const lastMessageIndex = state.findLastIndex(msg => msg.sender === sender);
      if (lastMessageIndex !== -1) {
        return state.map((msg, index) =>
          index === lastMessageIndex
            ? { ...msg, isComplete: true, error }
            : msg
        );
      } else {
        return [
          ...state,
          { id: crypto.randomUUID(), sender, content: "", isComplete: true, error },
        ];
      }
    }
    case 'RESET':
      return [];
    default:
      return state;
  }
};

export function useChatStream(isSendingRef: React.MutableRefObject<boolean>) {
  const [messages, dispatch] = useReducer(messageReducer, []);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  const setStreamingState = useCallback((streaming: boolean) => {
    setIsStreaming(streaming);
    if (!streaming) {
      isSendingRef.current = false;
    }
  }, [isSendingRef]);

  const startStream = useCallback(async (payload: any) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      debugLog("Aborted previous fetch request.");
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    dispatch({ type: 'RESET' });
    setStreamingState(true);

    try {
      debugLog("Starting fetch stream with payload:", payload);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
      }

      if (!response.body) throw new Error('Response body is null');

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      debugLog("[useChatStream] Starting to read from stream...");

      while (true) {
        const { done, value } = await reader.read();
        if (value) debugLog("[useChatStream] Raw chunk received:", JSON.stringify(value));
        if (done) {
          debugLog("[useChatStream] Stream reader marked as done.");
          if (buffer.trim()) {
            debugLog("[useChatStream] Remaining unprocessed buffer:", JSON.stringify(buffer));
          }
          break;
        }

        buffer += value;

        let separatorIndex;
        while ((separatorIndex = buffer.indexOf('\n\n')) >= 0) {
          const messageBlock = buffer.substring(0, separatorIndex);
          buffer = buffer.substring(separatorIndex + 2);

          if (!messageBlock.trim()) continue;

          const eventLines = messageBlock.split('\n');
          let eventType: string | null = null;
          let eventData = '';

          for (const line of eventLines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              eventType = trimmed.substring('event:'.length).trim();
            } else if (trimmed.startsWith('data:')) {
              eventData += trimmed.substring('data:'.length).trim();
            }
          }

          debugLog(`[useChatStream] Parsed - Event: ${eventType}, Data: ${JSON.stringify(eventData)}`);

          if (eventType) {
            if (eventType === 'w1-chunk' || eventType === 'w2-chunk') {
              const sender = eventType === 'w1-chunk' ? 'worker1' : 'worker2';
              debugLog(`[useChatStream] APPEND_CHUNK from ${sender}:`, eventData);
              dispatch({ type: 'APPEND_CHUNK', payload: { sender, content: eventData } });
            } else if (eventType === 'w1-done' || eventType === 'w2-done') {
              const sender = eventType === 'w1-done' ? 'worker1' : 'worker2';
              debugLog(`[useChatStream] MARK_COMPLETE from ${sender}`);
              dispatch({ type: 'MARK_COMPLETE', payload: { sender } });
            } else if (eventType === 'w1-error' || eventType === 'w2-error') {
              const sender = eventType === 'w1-error' ? 'worker1' : 'worker2';
              debugLog(`[useChatStream] MARK_ERROR from ${sender}:`, eventData);
              dispatch({ type: 'MARK_ERROR', payload: { sender, error: eventData || 'Unknown stream error' } });
            } else {
              debugLog(`[useChatStream] Unknown event type: ${eventType}`);
            }
          } else if (eventData) {
            debugLog("[useChatStream] No event type; treating as default message:", eventData);
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        debugLog("Fetch aborted by user.");
        messages.forEach(msg => {
          if (!msg.isComplete && !msg.error) {
            debugLog(`[useChatStream] Aborted message ${msg.id} from ${msg.sender}`);
            dispatch({ type: 'MARK_ERROR', payload: { sender: msg.sender, error: 'Interrupted by user' } });
          }
        });
      } else {
        debugLog("Error in fetch stream:", error);
        messages.forEach(msg => {
          if (!msg.isComplete && !msg.error) {
            debugLog(`[useChatStream] Error in message ${msg.id} from ${msg.sender}: ${error.message}`);
            dispatch({ type: 'MARK_ERROR', payload: { sender: msg.sender, error: error.message || 'Unknown fetch error' } });
          }
        });
        if (messages.length === 0) {
          debugLog("[useChatStream] Dispatching general fetch error");
        }
      }
    } finally {
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      setStreamingState(false);
      debugLog("[useChatStream] Stream cleanup complete");
    }
  }, [setStreamingState, messages]);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      debugLog("Stream stop requested via stopStream()");
      abortControllerRef.current.abort();
      setStreamingState(false);
      abortControllerRef.current = null;
    }
  }, [setStreamingState]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        debugLog("Aborting fetch request on component unmount.");
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { messages, startStream, stopStream, isStreaming };
}
