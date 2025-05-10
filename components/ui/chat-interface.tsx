// // components/chat-interface.tsx
// import React, { useState, useRef, useEffect, useCallback } from 'react';
// import { Avatar, AvatarFallback } from '@/components/ui/avatar';
// import { Input } from '@/components/ui/input';
// import { Button } from '@/components/ui/button';
// import { ScrollArea } from '@/components/ui/scroll-area';
// import { cn } from '@/lib/utils';
// import { SendHorizontalIcon, SquareIcon, AlertTriangleIcon, FileCode2Icon } from 'lucide-react';
// import type { BuildStreamMessage as BuildStreamMessageForHook } from '@/hooks/useBuildStream';
// import { useBuildStream } from '@/hooks/useBuildStream';
// import type { Settings } from "@/components/ui/settings-panel";
// import { toast } from 'sonner';

// export type Message = {
//     id: string; 
//     sender: 'user' | 'w1' | 'w2' | 'refiner' | 'system';
//     content: string;
//     isComplete: boolean;
//     error?: string;
//     uiId: string; 
//     timestamp: number;
//     hasCodeArtifact?: boolean;
//     parsedReview?: BuildStreamMessageForHook['parsedReview'];
// };

// interface ChatInterfaceProps {
//   settings: Settings;
//   initialPrompt?: string;
// }

// export function ChatInterface({ settings, initialPrompt }: ChatInterfaceProps) {
//   const [conversation, setConversation] = useState<Message[]>([]);
//   const [input, setInput] = useState('');
//   const scrollAreaRef = useRef<HTMLDivElement>(null);
//   const isSendingRef = useRef(false);

//   const {
//     messages: streamMessages,
//     startStream,
//     stopStream,
//     pipelineStage,
//     statusMessage,
//     error: streamError,
//     isFinished,
//     isStreaming,
//   } = useBuildStream(isSendingRef);

//   useEffect(() => {
//     setConversation(prevConversation => {
//         const userMessages = prevConversation.filter(msg => msg.sender === 'user');

//         console.log("[ChatInterface] useEffect processing streamMessages:", JSON.stringify(streamMessages, null, 2)); // <<< ADDED LOG

//         const aiStreamMessagesForUi: Message[] = streamMessages.map((sm, index) => {
//             const existingUiMsg = prevConversation.find(pMsg => pMsg.id === sm.sender && pMsg.sender !== 'user');
//             const uiId = existingUiMsg ? existingUiMsg.uiId : crypto.randomUUID();
//             const timestamp = existingUiMsg ? existingUiMsg.timestamp : Date.now() + index; 

//             console.log(`[ChatInterface] Mapping stream message from sender ${sm.sender}. Content received for UI:`, sm.content); // <<< ADDED LOG
//             if(sm.sender === 'w1') console.log(`[ChatInterface] W1 hasCodeArtifact: ${sm.hasCodeArtifact}`); // <<< ADDED LOG for W1 artifact

//             return {
//                 id: sm.sender, 
//                 uiId: uiId,
//                 sender: sm.sender as Message['sender'],
//                 content: sm.content, 
//                 isComplete: !!sm.isDone,
//                 hasCodeArtifact: sm.hasCodeArtifact,
//                 parsedReview: sm.parsedReview,
//                 timestamp: timestamp,
//             };
//         });

//         const newConversation = [...userMessages, ...aiStreamMessagesForUi];
//         newConversation.sort((a, b) => a.timestamp - b.timestamp);
        
//         if (JSON.stringify(newConversation) !== JSON.stringify(prevConversation)) {
//             console.log("[ChatInterface] Updating conversation state with (first 2 messages shown if long):", JSON.stringify(newConversation.slice(0,2), null, 2)); // <<< MODIFIED LOG for brevity
//             return newConversation;
//         }
//         return prevConversation;
//     });
//   }, [streamMessages]);

//   useEffect(() => {
//     if (scrollAreaRef.current) {
//       const scrollViewport = scrollAreaRef.current.querySelector<HTMLDivElement>(':scope > div');
//       if (scrollViewport) {
//         setTimeout(() => {
//            scrollViewport.scrollTop = scrollViewport.scrollHeight;
//         }, 100);
//       }
//     }
//   }, [conversation]);

//   const handleAutoSendInitialPrompt = useCallback(() => {
//     if (initialPrompt && settings && settings.provider && conversation.length === 0 && !isStreaming && !isSendingRef.current) {
//         console.log("ChatInterface: Auto-sending initial prompt:", initialPrompt);
//         handleSendMessage(initialPrompt);
//     }
//   // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [initialPrompt, settings, conversation.length, isStreaming]); 

//   useEffect(() => {
//     handleAutoSendInitialPrompt();
//   }, [handleAutoSendInitialPrompt]);

//   useEffect(() => {
//     if (statusMessage) {
//       // toast.info("Pipeline Status", { description: statusMessage, duration: 3000 });
//     }
//   }, [statusMessage]);

//   useEffect(() => {
//     if (streamError) {
//       console.error("[ChatInterface] Stream Error:", streamError);
//       toast.error("Pipeline Error", { description: streamError, duration: 8000 });
//     }
//   }, [streamError]);

//   const handleSendMessage = useCallback(async (promptOverride?: string) => {
//     if (!settings || !settings.provider || !settings.refinerModel || !settings.worker1Model || !settings.worker2Model) {
//         toast.error("AI provider settings are not configured. Please check settings.");
//         console.error("Attempted to send message with incomplete settings:", settings);
//         isSendingRef.current = false;
//         return;
//     }

//     if (isSendingRef.current || isStreaming) {
//       console.log('Send message prevented: already sending or streaming.');
//       toast.info("A process is already running. Please wait.");
//       return;
//     }

//     const textToSend = (promptOverride || input).trim();
//     if (textToSend === '') return;

//     isSendingRef.current = true;

//     const userMessage: Message = {
//       id: crypto.randomUUID(), 
//       uiId: crypto.randomUUID(), 
//       sender: 'user',
//       content: textToSend,
//       isComplete: true,
//       timestamp: Date.now(),
//     };

//     setConversation(prev => [...prev, userMessage].sort((a, b) => a.timestamp - b.timestamp));
//     if (!promptOverride) {
//         setInput('');
//     }

//     const streamPayload = {
//       prompt: textToSend,
//       projectType: "react_shadcn_zustand_app",
//       refinerConfig: { provider: settings.provider, model: settings.refinerModel },
//       worker1Config: { provider: settings.provider, model: settings.worker1Model },
//       worker2Config: { provider: settings.provider, model: settings.worker2Model },
//     };

//     console.log("ChatInterface: Calling startStream with payload:", streamPayload);
//     await startStream(streamPayload);

//   }, [input, isStreaming, startStream, settings]);

//   const getMessageStyle = (message: Message) => {
//     const styles: {
//         avatarInitial: string;
//         avatarColor: string;
//         bubbleClass: string;
//         alignment: string;
//         tooltip: string;
//     } = {
//       avatarInitial: '?',
//       avatarColor: 'bg-gray-400 text-white',
//       bubbleClass: 'bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700',
//       alignment: 'justify-start',
//       tooltip: 'System',
//     };

//     switch (message.sender) {
//       case 'user':
//         styles.avatarInitial = 'U';
//         styles.avatarColor = 'bg-blue-600 text-white';
//         styles.bubbleClass = 'bg-blue-500 text-white dark:bg-blue-600';
//         styles.alignment = 'justify-end';
//         styles.tooltip = 'User';
//         break;
//       case 'w1':
//         styles.avatarInitial = 'W1';
//         styles.avatarColor = 'bg-green-600 text-white';
//         styles.tooltip = settings.worker1Model || 'Worker 1';
//         break;
//       case 'w2':
//         styles.avatarInitial = 'W2';
//         styles.avatarColor = 'bg-purple-600 text-white';
//         styles.tooltip = settings.worker2Model || 'Worker 2';
//         break;
//       case 'refiner':
//         styles.avatarInitial = 'R';
//         styles.avatarColor = 'bg-orange-500 text-white';
//         styles.tooltip = settings.refinerModel || 'Refiner';
//         break;
//       case 'system':
//         styles.avatarInitial = 'S';
//         styles.avatarColor = 'bg-slate-500 text-white';
//         styles.tooltip = 'System Message';
//         break;
//     }

//     if (message.error) {
//       styles.bubbleClass = cn(styles.bubbleClass, 'border-2 border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20');
//     }

//     return styles;
//   };

//   return (
//     <div className="flex flex-col h-full dark:bg-slate-900">
//       <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
//         <div className="space-y-4 max-w-4xl mx-auto">
//           {conversation.map((message) => {
//             const styles = getMessageStyle(message);
//             const isUser = message.sender === 'user';
//             return (
//               <div
//                 key={message.uiId}
//                 className={cn('flex items-start gap-3', styles.alignment)}
//               >
//                 {!isUser && (
//                   <Avatar className="w-8 h-8 border shadow-sm flex-shrink-0">
//                     <AvatarFallback className={cn('text-xs font-semibold', styles.avatarColor)} title={styles.tooltip}>
//                       {styles.avatarInitial}
//                     </AvatarFallback>
//                   </Avatar>
//                 )}
//                 <div
//                   className={cn(
//                     'rounded-lg p-3 text-sm max-w-[85%] shadow-sm',
//                     styles.bubbleClass
//                   )}
//                 >
//                   {message.error && (
//                     <div className="flex items-center gap-1 text-red-600 dark:text-red-400 mb-1 font-medium">
//                       <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
//                       <span className="text-xs">{message.error === 'Interrupted by user' ? 'Stopped' : 'Error'}</span>
//                     </div>
//                   )}
//                   <p className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 break-words">
//                     {message.content || (!message.error && !message.isComplete ? '...' : '')}
//                   </p>
                  
//                   {message.hasCodeArtifact && (
//                     <div className="mt-2 pt-1 border-t border-gray-300 dark:border-slate-700/50 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
//                       <FileCode2Icon className="w-3.5 h-3.5 flex-shrink-0" />
//                       <span>Code applied to editor</span>
//                     </div>
//                   )}

//                   {message.sender === 'w2' && message.parsedReview && (
//                     <div className="mt-2 pt-2 border-t border-gray-300 dark:border-slate-700/50">
//                         <h4 className="text-xs font-semibold mb-1 text-gray-700 dark:text-gray-300">Review Summary:</h4>
//                         <p className="text-xs text-gray-600 dark:text-gray-400">
//                             <strong>Status:</strong> {message.parsedReview.status} <br />
//                             <strong>Action for W1:</strong> {message.parsedReview.next_action_for_w1}
//                         </p>
//                         {message.parsedReview.key_issues && message.parsedReview.key_issues.length > 0 && (
//                              <details className="mt-1 text-xs">
//                                 <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:underline">Key Issues ({message.parsedReview.key_issues.length})</summary>
//                                 <ul className="list-disc pl-4 mt-1 text-gray-600 dark:text-gray-400">
//                                     {message.parsedReview.key_issues.map((issue: string, index: number) => (
//                                         <li key={index}>{issue}</li>
//                                     ))}
//                                 </ul>
//                             </details>
//                         )}
//                     </div>
//                   )}

//                   <div className="text-xs text-right mt-1 opacity-70 flex justify-end items-center gap-1.5 text-gray-600 dark:text-gray-400">
//                     {message.isComplete && !message.error && <span title="Complete" className="text-green-500 dark:text-green-400">✔️</span>}
//                     <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
//                   </div>
//                 </div>
//                 {isUser && (
//                   <Avatar className="w-8 h-8 border shadow-sm flex-shrink-0">
//                     <AvatarFallback className={cn('text-xs font-semibold', styles.avatarColor)} title={styles.tooltip}>
//                       {styles.avatarInitial}
//                     </AvatarFallback>
//                   </Avatar>
//                 )}
//               </div>
//             );
//           })}
//           {isStreaming && (
//             <div className="flex justify-center items-center py-2">
//               <div className="text-sm text-gray-500 dark:text-gray-400 italic">
//                 {pipelineStage ? `Current stage: ${pipelineStage}...` : 'AI is thinking...'}
//               </div>
//             </div>
//           )}
//           {conversation.length === 0 && !isStreaming && (
//             <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
//               Send a message or provide an initial project goal to start.
//             </div>
//           )}
//         </div>
//       </ScrollArea>

//       <div className="border-t p-4 bg-white dark:bg-slate-800 dark:border-slate-700">
//         <div className="flex items-center gap-2 max-w-4xl mx-auto">
//           <Input
//             placeholder={isStreaming ? "Processing... please wait" : "Type your message or project goal..."}
//             className="flex-1 bg-white dark:bg-slate-700 dark:text-gray-100"
//             value={input}
//             onChange={(e) => setInput(e.target.value)}
//             onKeyDown={(e) => {
//               if (e.key === 'Enter' && !e.shiftKey) {
//                 e.preventDefault();
//                 handleSendMessage();
//               }
//             }}
//             disabled={isStreaming || isSendingRef.current}
//             aria-label="Chat input"
//           />
//           {isStreaming ? (
//              <Button size="icon" variant="destructive" onClick={stopStream} title="Stop Generation" aria-label="Stop generation">
//                <SquareIcon className="w-5 h-5" />
//              </Button>
//           ) : (
//              <Button size="icon" variant="default" onClick={() => handleSendMessage()} disabled={!input.trim() || isSendingRef.current || !settings?.provider} aria-label="Send message">
//                <SendHorizontalIcon className="w-5 h-5" />
//              </Button>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }