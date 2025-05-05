// hooks/useChatStream.ts
import { useEffect, useReducer, useRef, useCallback, useState } from "react";

// Define the message type tracked internally by the hook/reducer
export type StreamMessage = {
  id: string;
  sender: 'worker1' | 'worker2';
  content: string;
  isComplete: boolean; // Track completion state
  error?: string;     // Track errors
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
      const { sender, content } = action.payload;
      // Find the index of the last message from this specific sender
      const lastMessageIndex = state.findLastIndex(
        (msg) => msg.sender === sender
      );

      // Check if that message exists and is not yet complete or errored
      if (
        lastMessageIndex !== -1 &&
        !state[lastMessageIndex].isComplete &&
        !state[lastMessageIndex].error
      ) {
        // If yes, update the content of that specific message
        return state.map((msg, index) => {
          if (index === lastMessageIndex) {
            // Smartly add a space: only if msg.content is not empty,
            // doesn't end with a space, and the new content doesn't
            // start with punctuation/space.
            const separator = 
              msg.content.length > 0 && 
              !/\s$/.test(msg.content) && // Doesn't end with space
              !/^[\s.,!?;:]/.test(content) // Doesn't start with space/punctuation
                ? ' '
                : '';
            return { ...msg, content: msg.content + separator + content }; 
          } else {
            return msg;
          }
        });
      } else {
        // Otherwise, start a new message entry for this sender
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
              index === lastMessageIndex ? { 
                ...msg, 
                isComplete: true, 
                content: msg.content.replace(/<think>.*?<\/think>/gis, '').trim() 
              } : msg
            );
        }
        return state; // No matching message found to mark complete
    }
    case 'MARK_ERROR': {
        const { sender, error } = action.payload;
        const lastMessageIndex = state.findLastIndex(msg => msg.sender === sender);
         if (lastMessageIndex !== -1) {
            return state.map((msg, index) =>
              index === lastMessageIndex ? { ...msg, isComplete: true, error: error } : msg // Mark complete on error too
            );
        } else {
            // If no previous message from this sender, create an error message
             return [
                ...state,
                { id: crypto.randomUUID(), sender, content: "", isComplete: true, error: error },
             ];
        }
    }
    case 'RESET':
      return [];
    default:
      return state;
  }
};


// SSE Line Parser (simple implementation)
function processSSELine(line: string): { event: string; data: string } | null {
    if (line.startsWith("event:")) {
        const event = line.substring("event:".length).trim();
        // Assume data follows on the next line (simple case)
        return { event, data: "" }; // Placeholder, data set by next line
    } else if (line.startsWith("data:")) {
        const data = line.substring("data:".length).trim();
        // This assumes data line directly follows event line or is the only line
        return { event: "message", data }; // Default event type if none specified
    }
    return null; // Ignore comments, empty lines, etc.
}


// The Hook
export function useChatStream(isSendingRef: React.MutableRefObject<boolean>) {
  const [messages, dispatch] = useReducer(messageReducer, []);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);

  // Internal helper to set streaming state and reset the ref
  const setStreamingState = useCallback((streaming: boolean) => {
      setIsStreaming(streaming);
      if (!streaming) {
          // Reset the sending ref when streaming stops
          isSendingRef.current = false;
      }
  }, [isSendingRef]); // Dependency on the ref object


  // Function to start the stream using fetch
  const startStream = useCallback(async (payload: any) => {
    // Abort previous fetch request if still ongoing
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log("Aborted previous fetch request.");
    }

    // Create a new AbortController for this request
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Clear previous messages when starting a new stream cycle
    dispatch({ type: 'RESET' });
    setStreamingState(true); // Use helper

    try {
      console.log("Starting fetch stream with payload:", payload);
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Process the stream
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let currentSender: 'worker1' | 'worker2' | null = null;
      let currentEvent: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("Fetch stream processing finished.");
          break;
        }

        buffer += value;
        const lines = buffer.split('\n\n');

        // Process all complete messages except the last partial one
        for (let i = 0; i < lines.length - 1; i++) {
            const messageBlock = lines[i];
            const eventLines = messageBlock.split('\n');
            let eventType = 'message';
            let eventData = '';

            for (const line of eventLines) {
                if (line.startsWith('event:')) {
                    eventType = line.substring('event:'.length).trim();
                } else if (line.startsWith('data:')) {
                    eventData += line.substring('data:'.length).trim();
                }
            }

            // Handle custom events or message data
            if (eventType === 'w1-chunk' || eventType === 'w2-chunk') {
                currentSender = eventType === 'w1-chunk' ? 'worker1' : 'worker2';
                dispatch({ type: 'APPEND_CHUNK', payload: { sender: currentSender, content: eventData } });
            } else if (eventType === 'w1-done' || eventType === 'w2-done') {
                currentSender = eventType === 'w1-done' ? 'worker1' : 'worker2';
                dispatch({ type: 'MARK_COMPLETE', payload: { sender: currentSender } });
            } else if (eventType === 'w1-error' || eventType === 'w2-error') {
                currentSender = eventType === 'w1-error' ? 'worker1' : 'worker2';
                dispatch({ type: 'MARK_ERROR', payload: { sender: currentSender, error: eventData || 'Unknown stream error' } });
            }
        }

        // Keep the last partial message in the buffer
        buffer = lines[lines.length - 1];
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log("Fetch aborted by user.");
        messages.forEach(msg => {
            if (!msg.isComplete && !msg.error) {
                dispatch({type: 'MARK_ERROR', payload: { sender: msg.sender, error: 'Interrupted by user'}});
            }
        });
      } else {
        console.error("Error in fetch stream:", error);
        messages.forEach(msg => {
            if (!msg.isComplete && !msg.error) {
                dispatch({type: 'MARK_ERROR', payload: { sender: msg.sender, error: error.message || 'Unknown fetch error'}});
            }
        });
      }
    } finally {
       if (abortControllerRef.current === abortController) {
           abortControllerRef.current = null;
       }
       setStreamingState(false); // Use helper
    }
  }, [setStreamingState]); // Use setStreamingState in dependency array

  // Function to manually abort the stream
  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      console.log("Stream stop requested via stopStream().");
      abortControllerRef.current.abort();
      setStreamingState(false); // Use helper
      abortControllerRef.current = null;
    }
  }, [setStreamingState]); // Use setStreamingState in dependency array

  // Cleanup function to abort if component unmounts mid-stream
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log("Aborting fetch request on component unmount.");
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return { messages, startStream, stopStream, isStreaming };
}
