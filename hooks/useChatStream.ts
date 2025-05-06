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
      console.log('[useChatStream] APPEND_CHUNK', action.payload);
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

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      console.log("[useChatStream] Starting to read from stream...");

      // --- Updated Stream Processing Loop ---
      while (true) {
        const { done, value } = await reader.read();

        // Log raw chunk received
        if (value) {
            console.log("[useChatStream] Raw chunk received:", JSON.stringify(value));
        }

        if (done) {
          console.log("[useChatStream] Stream reader marked as done.");
          // Final check on buffer in case the stream ended without \n\n
          if (buffer.trim()) {
              console.warn("[useChatStream] Stream done but buffer has remaining unprocessed content:", JSON.stringify(buffer));
              // Optional: You could try one last parse attempt on the remaining buffer here
              // processMessageBlock(buffer); // You'd need to extract the parsing logic into a function
          }
          break; // Exit the loop
        }

        // Append new data to the buffer
        buffer += value;

        // Process buffer searching for complete SSE messages (\n\n separator)
        let separatorIndex;
        while ((separatorIndex = buffer.indexOf('\n\n')) >= 0) {
            const messageBlock = buffer.substring(0, separatorIndex); // Extract the message block
            buffer = buffer.substring(separatorIndex + 2); // Remove the block and separator from buffer

            // *** Log entry into block processing ***
            console.log("[useChatStream] Extracted message block for processing:", JSON.stringify(messageBlock));

            if (!messageBlock.trim()) {
                console.log("[useChatStream] Skipping empty block.");
                continue; // Skip empty blocks (e.g., if input was just \n\n)
            }

            // --- Parse the individual message block ---
            const eventLines = messageBlock.split('\n');
            let eventType: string | null = null;
            let eventData = '';

            for (const line of eventLines) {
                 const trimmedLine = line.trim(); // Trim whitespace
                if (trimmedLine.startsWith('event:')) {
                    eventType = trimmedLine.substring('event:'.length).trim();
                } else if (trimmedLine.startsWith('data:')) {
                    // Simple concatenation for data lines within a block
                    eventData += trimmedLine.substring('data:'.length).trim();
                     // Note: Real multi-line data might need more careful handling if lines don't start with 'data:'
                }
                // Ignore comments (lines starting with ':') and other lines like 'id:'
            }
            // --- End parsing block ---

            console.log(`[useChatStream] Parsed - Event: ${eventType}, Data: ${JSON.stringify(eventData)}`);

            // --- Dispatch based on parsed event ---
            if (eventType) {
                 if (eventType === 'w1-chunk' || eventType === 'w2-chunk') {
                    const sender = eventType === 'w1-chunk' ? 'worker1' : 'worker2';
                     console.log(`[useChatStream] Dispatching APPEND_CHUNK for ${sender} with data: ${JSON.stringify(eventData)}`); // Log before dispatch
                    dispatch({ type: 'APPEND_CHUNK', payload: { sender, content: eventData } });
                } else if (eventType === 'w1-done' || eventType === 'w2-done') {
                    const sender = eventType === 'w1-done' ? 'worker1' : 'worker2';
                     console.log(`[useChatStream] Dispatching MARK_COMPLETE for ${sender}`); // Log before dispatch
                    dispatch({ type: 'MARK_COMPLETE', payload: { sender } });
                } else if (eventType === 'w1-error' || eventType === 'w2-error') {
                     const sender = eventType === 'w1-error' ? 'worker1' : 'worker2';
                     console.log(`[useChatStream] Dispatching MARK_ERROR for ${sender} with error: ${JSON.stringify(eventData)}`); // Log before dispatch
                    dispatch({ type: 'MARK_ERROR', payload: { sender, error: eventData || 'Unknown stream error' } });
                } else {
                    console.warn(`[useChatStream] Received unknown event type: ${eventType}`);
                }
            } else if (eventData) {
                // Handle messages that only have 'data:' lines (implicitly 'message' event)
                console.warn("[useChatStream] Received data without specific event type, treating as generic message:", eventData);
                // Decide how to handle this. Maybe dispatch to a default worker or ignore?
                // Example: dispatch({ type: 'APPEND_CHUNK', payload: { sender: 'worker1', content: eventData } });
            } else {
                 console.log("[useChatStream] Parsed block resulted in no eventType and no eventData. Block was:", JSON.stringify(messageBlock));
            }
            // --- End dispatch ---

        } // End while loop processing buffer content
      } // End while(true) reading stream
      // --- End of Updated Stream Processing Loop ---

      console.log("[useChatStream] Exited stream reading loop.");

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log("Fetch aborted by user.");
        // Mark any non-complete messages as interrupted
        messages.forEach(msg => { // Use the 'messages' state captured at the start of useCallback
            if (!msg.isComplete && !msg.error) {
                 console.log(`[useChatStream] Marking message ${msg.id} from ${msg.sender} as interrupted.`);
                 // Dispatch might cause issues if component unmounted, safer to handle in UI maybe
                dispatch({type: 'MARK_ERROR', payload: { sender: msg.sender, error: 'Interrupted by user'}});
            }
        });
      } else {
        console.error("Error in fetch stream:", error);
        // Mark all non-complete messages with the fetch error
        messages.forEach(msg => { // Use the 'messages' state
            if (!msg.isComplete && !msg.error) {
                console.log(`[useChatStream] Marking message ${msg.id} from ${msg.sender} as error: ${error.message}`);
                dispatch({type: 'MARK_ERROR', payload: { sender: msg.sender, error: error.message || 'Unknown fetch error'}});
            }
        });
        // If no messages existed yet, maybe add a general error message?
        if (messages.length === 0) {
            // You could potentially dispatch a generic error message here if needed
             console.log("[useChatStream] Dispatching general fetch error message.");
            // dispatch({ type: 'MARK_ERROR', payload: { sender: 'worker1', error: `Fetch Error: ${error.message}` }});
        }
      }
    } finally {
       if (abortControllerRef.current === abortController) {
           abortControllerRef.current = null;
       }
       setStreamingState(false); // Use helper to set streaming false and reset isSendingRef
       console.log("[useChatStream] Stream processing finally block. isStreaming:", isStreaming); // isStreaming state might be stale here
    }
  }, [setStreamingState, messages]); // Add 'messages' to dependency array for error handling logic


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
