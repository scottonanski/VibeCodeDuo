// components/chat-interface.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { SendHorizontalIcon, SquareIcon, AlertTriangleIcon } from 'lucide-react'; // Import Stop/Error icons
import type { StreamMessage } from '@/hooks/useChatStream'; // Use type-only import
import { useChatStream } from '@/hooks/useChatStream';
import { Settings } from "@/components/ui/settings-panel";

// Define the UI message type
export type Message = {
    id: string;         // From StreamMessage (or unique for user msgs)
    sender: 'user' | 'worker1' | 'worker2'; // Explicitly include 'user'
    content: string;
    isComplete: boolean; // True for user, updated for AI
    error?: string;     // Undefined for user, set for AI errors
    uiId: string;       // Unique stable UI key
    timestamp: number;  // Display timestamp
};

interface ChatInterfaceProps {
  settings: Settings;
}

export function ChatInterface({ settings }: ChatInterfaceProps) {
  // State for the full conversation history displayed in the UI
  const [conversation, setConversation] = useState<Message[]>([]);
  // State for the input field
  const [input, setInput] = useState('');
  // Ref for scrolling
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  // Ref to prevent double submission
  const isSendingRef = useRef(false);

  // Use the updated hook, destructure new values
  // Pass the ref down to the hook
   const { messages: streamMessages, startStream, stopStream, isStreaming } = useChatStream(isSendingRef);

  // Map StreamMessage[] to Message[] for UI compatibility
  const mappedStreamMessages: Message[] = streamMessages.map(sm => ({
    id: sm.id,
    uiId: sm.id,
    sender: sm.sender,
    content: sm.content,
    isComplete: sm.isComplete,
    error: sm.error,
    timestamp: Date.now(), // Use a real timestamp if available
  }));

  // --- Effect to merge stream messages into the UI conversation state ---
    useEffect(() => {
        if (streamMessages.length > 0) {
            // console.log('[ChatInterface] useEffect triggered by streamMessages change. New streamMessages:', JSON.stringify(streamMessages));
        }
    setConversation(prevConversation => {
        // Create a map of the latest stream messages by their ID (sender in this case)
        const streamMsgMap = new Map(streamMessages.map(sm => [sm.id, sm]));

        // Create a map of the previous UI conversation by UI ID
        const prevUiMap = new Map(prevConversation.map(msg => [msg.uiId, msg]));

        // Build the new conversation state
        const newConversation: Message[] = [];

        // Iterate over previous UI messages to update or keep them
        prevConversation.forEach(prevUiMsg => {
            if (prevUiMsg.sender === 'user') {
                // Always keep user messages
                newConversation.push(prevUiMsg);
            } else if (streamMsgMap.has(prevUiMsg.id)) {
                // If it's an AI message present in the latest stream state, update it
                const correspondingStreamMsg = streamMsgMap.get(prevUiMsg.id)!;
                newConversation.push({
                    ...correspondingStreamMsg,
                    uiId: prevUiMsg.uiId, // Keep the original stable UI ID
                    timestamp: prevUiMsg.timestamp, // Keep the original timestamp
                });
                // Remove from map so we don't add it again later
                streamMsgMap.delete(prevUiMsg.id);
            }
            // If an AI message was in prevConversation but not in streamMsgMap (e.g., after RESET), it's implicitly dropped
        });

        // Add any *new* AI messages from the stream state (shouldn't happen often with current RESET logic, but handles edge cases)
        streamMsgMap.forEach(newStreamMsg => {
            newConversation.push({
                ...newStreamMsg,
                uiId: newStreamMsg.id, // Use stream ID as initial UI ID
                timestamp: Date.now(), // Assign timestamp when first seen
            });
        });

        // Sort the final array by timestamp to maintain order
        newConversation.sort((a, b) => a.timestamp - b.timestamp);

        // Only update state if the result is actually different (simple string compare for now)
        // This prevents unnecessary re-renders if the stream updates didn't change UI-relevant data
        if (JSON.stringify(newConversation) !== JSON.stringify(prevConversation)) {
            return newConversation;
        }
        return prevConversation;
    });

}, [streamMessages]); // Dependency: only the stream messages array identity


  // --- Scroll to bottom when conversation updates ---
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector<HTMLDivElement>(':scope > div');
      if (scrollViewport) {
        setTimeout(() => {
           scrollViewport.scrollTop = scrollViewport.scrollHeight;
        }, 50); // Add a small delay to ensure DOM has updated
      }
    }
  }, [conversation]); // Scroll whenever the UI conversation changes

  // --- Function to handle sending a message ---
  const handleSendMessage = useCallback(async () => {
    // Check both the streaming state AND the sending ref
    if (isSendingRef.current || isStreaming) {
        console.log('Send message prevented: already sending or streaming.');
        return;
    }

    const trimmedInput = input.trim();
    // No need to check isStreaming again here, but check trimmedInput
    if (trimmedInput === '') return;

    isSendingRef.current = true; // Set flag immediately

    try {
        const userMessage: Message = {
            id: crypto.randomUUID(), // Internal ID for user message logic
            uiId: crypto.randomUUID(), // Unique key ID for React
            sender: 'user',
            content: trimmedInput,
            isComplete: true,
            error: undefined, // User messages don't have stream errors
            timestamp: Date.now(),
        };

        // Prepare the new conversation state *before* setting it
        const updatedConversation = [...conversation, userMessage].sort((a, b) => a.timestamp - b.timestamp);

        // Set the state
        setConversation(updatedConversation);
        setInput(''); // Clear input field

        // --- Map the *updated* conversation to the API format ---
        const apiMessages = updatedConversation.map(msg => ({
            role: msg.sender === 'user' ? 'user' : ('assistant' as 'user' | 'assistant'), // Map workers to assistant role
            content: msg.content
        })).filter(msg => msg.content); // Filter out any potential empty messages

        // Define worker settings (Using models from Memory)
        const payload = {
            messages: apiMessages,
            worker1: { provider: settings.provider, model: settings.worker1Model },
            worker2: { provider: settings.provider, model: settings.worker2Model },
        };

        // Trigger the stream
        console.log("ChatInterface: Calling startStream with", apiMessages.length, "messages.");
        startStream(payload);

    } catch (error) {
        console.error("Error in handleSendMessage:", error);
        // Potentially display an error to the user here
        // Reset the flag here ONLY if startStream itself threw synchronously
        // (unlikely with the current setup, but safer)
        isSendingRef.current = false;
    }
    // REMOVED finally block: Resetting is now handled by the hook
    // finally {
    //     isSendingRef.current = false;
    // }

  }, [input, conversation, startStream, isStreaming, settings]); // Include necessary dependencies

  // --- Function to get Avatar and Style details based on message ---
  const getMessageStyle = (message: Message) => {
    const styles = {
      avatarInitial: '?',
      avatarColor: 'bg-gray-400 text-white',
      bubbleClass: 'bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700', // Default AI bubble
      alignment: 'justify-start',
      tooltip: 'Unknown',
    };

    switch (message.sender) {
      case 'user':
        styles.avatarInitial = 'U';
        styles.avatarColor = 'bg-blue-600 text-white';
        styles.bubbleClass = 'bg-blue-500 text-white dark:bg-blue-600'; // User bubble
        styles.alignment = 'justify-end';
        styles.tooltip = 'User';
        break;
      case 'worker1':
        styles.avatarInitial = 'W1';
        styles.avatarColor = 'bg-green-600 text-white';
        styles.tooltip = 'Worker 1 (llama3.2:3b)';
        break;
      case 'worker2':
        styles.avatarInitial = 'W2';
        styles.avatarColor = 'bg-purple-600 text-white';
        styles.tooltip = 'Worker 2 (gemma3:1b)';
        break;
    }

    // Add error styling if message has an error
    if (message.error) {
        // More prominent error style: red border and slightly tinted background
        styles.bubbleClass = cn(styles.bubbleClass, 'border-2 border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20');
    }

    return styles;
  };

  return (
    <div className="flex flex-col h-full dark:bg-slate-900"> {/* Ensure full height & add dark mode bg */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
         {/* Optional: Add max-width and center content */}
        <div className="space-y-4 max-w-4xl mx-auto">
          {conversation.map((message) => {
            const styles = getMessageStyle(message);
            const isUser = message.sender === 'user';
            return (
              <div
                key={message.uiId} // Use stable UI ID for key
                className={cn('flex items-start gap-3', styles.alignment)}
              >
                {/* AI Avatar (Left) */}
                {!isUser && (
                  <Avatar className="w-8 h-8 border shadow-sm">
                    <AvatarFallback className={cn('text-xs font-semibold', styles.avatarColor)} title={styles.tooltip}>
                      {styles.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
                {/* Message Bubble */}
                <div
                  className={cn(
                    'rounded-lg p-3 text-sm max-w-[75%] shadow-sm', // Base bubble style
                    styles.bubbleClass // Apply dynamic classes (user/ai/error)
                  )}
                >
                  {/* Show error icon/message prominently if error exists */}
                  {message.error && (
                      <div className="flex items-center gap-1 text-red-600 dark:text-red-400 mb-1 font-medium">
                          <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
                          {/* Display a concise error message */}
                          <span className="text-xs">{message.error === 'Interrupted by user' ? 'Stopped' : 'Error'}</span>
                      </div>
                  )}
                  {/* Display content */}
                  <p className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                      {/* Show content even if there was an error (it might be partial) */}
                      {/* If content is empty and there's an error, maybe show the error text here instead? */}
                      {message.content || (!message.error ? '...' : '')}
                  </p>
                  {/* Timestamp and Status Indicators */}
                  <div className="text-xs text-right mt-1 opacity-70 flex justify-end items-center gap-1.5 text-gray-600 dark:text-gray-400">
                     {/* Completion / Error Indicators */}
                    {message.isComplete && !message.error && <span title="Complete" className="text-green-600">✔️</span>}
                    {message.error && <span title="Error" className="text-red-600">❌</span>}
                    {/* Timestamp */}
                    <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                 {/* User Avatar (Right) */}
                 {isUser && (
                  <Avatar className="w-8 h-8 border shadow-sm">
                    <AvatarFallback className={cn('text-xs font-semibold', styles.avatarColor)} title={styles.tooltip}>
                      {styles.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
          {/* Simple Streaming Indicator */}
          {isStreaming && (
            <div className="flex justify-center items-center py-2">
                 <div className="text-sm text-gray-500 dark:text-gray-400 italic">AI is thinking...</div>
             </div>
          )}
           {/* Empty State Message */}
          {conversation.length === 0 && !isStreaming && (
            <div className="text-center text-gray-500 dark:text-gray-400 mt-8">Send a message to start the chat.</div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t p-4 bg-white dark:bg-slate-800 dark:border-slate-700">
        <div className="flex items-center gap-2 max-w-4xl mx-auto">
          <Input
            placeholder="Type your message..."
            className="flex-1 bg-white dark:bg-slate-700 dark:text-gray-100"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            disabled={isStreaming} // Disable input while streaming
            aria-label="Chat input"
          />
          {/* Conditionally show Stop or Send button */}
          {isStreaming ? (
             <Button size="icon" variant="destructive" onClick={stopStream} title="Stop Generation" aria-label="Stop generation">
               <SquareIcon className="w-5 h-5" />
             </Button>
          ) : (
             <Button size="icon" variant="default" onClick={handleSendMessage} disabled={!input.trim()} aria-label="Send message">
               <SendHorizontalIcon className="w-5 h-5" />
             </Button>
          )}
        </div>
      </div>
    </div>
  );
}