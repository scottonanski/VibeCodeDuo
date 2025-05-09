// components/ui/buildInterface.tsx
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { AlertTriangleIcon, FileCode2Icon, SendHorizontalIcon, SquareIcon, BrainIcon, UsersIcon, MessageSquareTextIcon } from 'lucide-react'; // Added new icons
import { useBuildStream, type BuildStreamMessage } from '@/hooks/useBuildStream';
import type { Settings } from "@/components/ui/settings-panel";
import { toast } from 'sonner';
import type { AiChatMessage } from '@/lib/orchestration/stages/types'; // Keep for potential future use with debateFullTranscript

interface DisplayMessage extends BuildStreamMessage {
  timestamp: number;
}

interface BuildInterfaceProps {
  settings: Settings;
}

export function BuildInterface({ settings }: BuildInterfaceProps) {
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);

  const {
    messages: streamMessages,
    projectFiles,
    pipelineStage,
    statusMessage,
    refinedPrompt,
    error: globalError,
    isFinished,
    requiredInstalls,
    startStream,
    stopStream,
    isStreaming,
    // --- Debate State ---
    debateSummaryText,
    debateAgreedPlan,
    debateOptions,
    debateRequiresResolution,
    // debateFullTranscript, // Available if needed for more detailed display
  } = useBuildStream(isSendingRef);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector<HTMLDivElement>(':scope > div');
      if (scrollViewport) {
        setTimeout(() => {
          scrollViewport.scrollTop = scrollViewport.scrollHeight;
        }, 100);
      }
    }
  }, [streamMessages, debateSummaryText]); // Added debateSummaryText to trigger scroll

  const handleSendMessage = async () => {
    if (isSendingRef.current || isStreaming) {
      if(isStreaming || isSendingRef.current) toast.info("A process is already running.");
      return;
    }
     if (!input.trim()) {
        toast.info("Please enter a prompt.");
        return;
    }
    if (!settings || !settings.provider || !settings.refinerModel || !settings.worker1Model || !settings.worker2Model) {
        toast.error("AI provider settings are not configured. Please check settings.");
        return;
    }

    isSendingRef.current = true;
    // The initial prompt from user becomes the first message in the AiChatMessage array
    // In components/ui/buildInterface.tsx, inside handleSendMessage:

    // The initial prompt from user becomes the first message in the AiChatMessage array
    const initialUserMessage: AiChatMessage = { role: 'user', content: input.trim() };

    const payload = {
      messages: [initialUserMessage], // API expects an array of messages, first one used for prompt
      worker1: {
        provider: settings.provider, // Use settings.provider directly (e.g., "OpenAI" or "Ollama")
        model: settings.worker1Model,
        // NO API KEY sent from client for worker1 config
      },
      worker2: {
        provider: settings.provider, // Use settings.provider directly
        model: settings.worker2Model,
        // NO API KEY sent from client for worker2 config
      },
      // filename and maxTurns are optional in ChatApiPayload
      // filename: "app/page.tsx", // If you want to pass a default or from settings
      // maxTurns: 6,             // If you want to pass a default or from settings
    };

    try {
      await startStream(payload);
      setInput('');
    } catch (e: any) {
      console.error("Error starting stream:", e);
      toast.error(`Failed to start the build process: ${e.message || "Unknown error"}`);
      isSendingRef.current = false;
    }
  };

  const getSenderMeta = (sender: string, messageSpecificError?: string) => {
    let meta = {
      icon: <AlertTriangleIcon className="w-4 h-4 inline-block mr-1" />, label: "Unknown", avatarInitial: "?", avatarColor: "bg-gray-400 text-white",
      bubbleClass: "bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700",
      alignment: "justify-start", tooltip: sender,
    };
    switch (sender.toLowerCase()) {
      case "user": meta = { ...meta, icon: <SendHorizontalIcon className="w-4 h-4 inline-block mr-1" />, label: "You", avatarInitial: "U", avatarColor: "bg-blue-600 text-white", bubbleClass: "bg-blue-500 text-white dark:bg-blue-600", alignment: "justify-end", tooltip: "User" }; break;
      case "refiner": meta = { ...meta, icon: <BrainIcon className="w-4 h-4 inline-block mr-1" />, label: "Refiner Bot", avatarInitial: "R", avatarColor: "bg-orange-500 text-white", tooltip: settings.refinerModel || "Refiner" }; break;
      // --- Debate Senders ---
      case "debatera": meta = { ...meta, icon: <UsersIcon className="w-4 h-4 inline-block mr-1" />, label: "Debater A (Proposer)", avatarInitial: "DA", avatarColor: "bg-teal-500 text-white", tooltip: "Debater A" }; break;
      case "debaterb": meta = { ...meta, icon: <UsersIcon className="w-4 h-4 inline-block mr-1" />, label: "Debater B (Critiquer)", avatarInitial: "DB", avatarColor: "bg-cyan-500 text-white", tooltip: "Debater B" }; break;
      case "summarizer": meta = { ...meta, icon: <MessageSquareTextIcon className="w-4 h-4 inline-block mr-1" />, label: "Summarizer", avatarInitial: "Σ", avatarColor: "bg-indigo-500 text-white", tooltip: "Debate Summarizer" }; break;
      // --- Codegen/Review Senders ---
      case "w1": meta = { ...meta, icon: <FileCode2Icon className="w-4 h-4 inline-block mr-1" />, label: "Coder Bot (W1)", avatarInitial: "W1", avatarColor: "bg-green-600 text-white", tooltip: settings.worker1Model || "Worker 1" }; break;
      case "w2": meta = { ...meta, icon: <FileCode2Icon className="w-4 h-4 inline-block mr-1 transform scale-x-[-1]" />, label: "Reviewer Bot (W2)", avatarInitial: "W2", avatarColor: "bg-purple-600 text-white", tooltip: settings.worker2Model || "Worker 2" }; break;
      case "system": meta = { ...meta, icon: <AlertTriangleIcon className="w-4 h-4 inline-block mr-1" />, label: "System", avatarInitial: "S", avatarColor: "bg-slate-500 text-white", tooltip: "System Message" }; break;
    }
    if (messageSpecificError) {
        meta.bubbleClass = cn(meta.bubbleClass, 'border-2 border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20');
    }
    return meta;
  };

  const displayMessages: DisplayMessage[] = streamMessages.map((msg, index) => ({
    ...msg,
    timestamp: Date.now() + index, // Simple timestamp for sorting/key if needed
  }));

  return (
    <div className="flex flex-col h-full dark:bg-slate-900">
      <div className="p-2 bg-slate-100 dark:bg-slate-800 border-b text-xs flex items-center gap-4 flex-wrap">
        <span className="whitespace-nowrap">Stage: <b>{pipelineStage || 'Idle'}</b></span>
        <span className="flex-grow min-w-0"><span className="font-semibold">Status:</span> {statusMessage || 'Waiting for prompt...'}</span>
        {isFinished && !globalError && <span className="text-green-600 font-semibold whitespace-nowrap">Pipeline finished ✔️</span>}
        {globalError && (
          <span className="text-red-600 flex items-center gap-1 whitespace-nowrap">
            <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />Error: {globalError}
          </span>
        )}
      </div>

      {refinedPrompt && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/30 border-b text-sm text-amber-800 dark:text-amber-200">
          <b className="font-semibold">Refined Prompt:</b> {refinedPrompt}
        </div>
      )}

      {/* --- DEBATE OUTCOME SECTION --- */}
      {debateSummaryText && (
        <div className="p-3 border-b bg-indigo-50 dark:bg-indigo-900/30">
          <h3 className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 mb-2">Debate Outcome & Plan:</h3>
          {debateAgreedPlan && (
            <div className="mb-2">
              <strong className="text-xs text-indigo-700 dark:text-indigo-300 block">Agreed Plan:</strong>
              <p className="text-sm text-indigo-900 dark:text-indigo-100 pl-2 border-l-2 border-indigo-300 dark:border-indigo-600 ml-1 py-1">
                {debateAgreedPlan}
              </p>
            </div>
          )}
          {debateOptions && debateOptions.length > 0 && (!debateAgreedPlan || debateRequiresResolution) && (
            <div className="mb-2">
              <strong className="text-xs text-indigo-700 dark:text-indigo-300 block">
                {debateAgreedPlan ? "Remaining Options/Points:" : "Options Considered:"}
              </strong>
              <ul className="list-disc pl-6 text-sm text-indigo-900 dark:text-indigo-100 space-y-0.5">
                {debateOptions.map((opt, idx) => <li key={idx}>{opt}</li>)}
              </ul>
            </div>
          )}
          {debateRequiresResolution && (
            <p className="text-xs text-orange-600 dark:text-orange-400 mb-2 italic">
              <AlertTriangleIcon className="w-3 h-3 inline-block mr-1" />
              Debate concluded with points needing further resolution or clarification before an optimal plan can be finalized. The current agreed plan (if any) or refined prompt will be used.
            </p>
          )}
          <div>
            <strong className="text-xs text-indigo-700 dark:text-indigo-300 block">Full Debate Summary:</strong>
            {/* Apply styling to this wrapper div */}
            <div className="prose prose-sm dark:prose-invert max-w-none text-indigo-900 dark:text-indigo-100 mt-1 bg-indigo-100 dark:bg-indigo-800/30 p-2 rounded text-xs">
              <ReactMarkdown>
                {debateSummaryText}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
      {/* --- END DEBATE OUTCOME SECTION --- */}


      {Object.keys(projectFiles).length > 0 && (
        <div className="flex flex-col gap-2 p-3 border-b bg-slate-50 dark:bg-slate-950 max-h-[30vh] overflow-y-auto">
          <b className="text-sm font-semibold text-slate-700 dark:text-slate-300">Project Files:</b>
          {Object.entries(projectFiles).map(([filename, content]) => {
            const getLang = (name: string) => {
              const ext = name.split('.').pop();
              if (ext === 'tsx' || ext === 'ts') return 'typescript';
              if (ext === 'js' || ext === 'jsx') return 'javascript';
              if (ext === 'html') return 'markup';
              if (ext === 'css') return 'css';
              if (ext === 'json') return 'json';
              return 'plaintext';
            };
            return (
              <details key={filename} className="mb-2 bg-white dark:bg-slate-800 rounded shadow">
                <summary className="text-xs font-mono text-blue-600 dark:text-blue-400 p-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 rounded-t">
                  {filename}
                </summary>
                <div className="p-0 m-0 max-h-60 overflow-y-auto">
                  <SyntaxHighlighter
                    language={getLang(filename)}
                    style={atomDark}
                    customStyle={{ borderRadius: '0 0 0.25rem 0.25rem', fontSize: '0.75rem', margin: '0', padding: '0.5rem', backgroundColor: '#2d2d2d' }} // Ensure style object is correct
                    lineNumberStyle={{color: '#666', fontSize: '0.7rem'}}
                    wrapLongLines={true}
                    showLineNumbers
                  >
                    {String(content || "// Empty file")}
                  </SyntaxHighlighter>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {requiredInstalls.length > 0 && (
        <div className="p-3 border-b bg-sky-50 dark:bg-sky-900/30">
          <b className="text-sm font-semibold text-sky-800 dark:text-sky-200 block mb-1">
            📦 Required Install Commands:
          </b>
          <ul className="space-y-1">
            {requiredInstalls.map((cmd, idx) => (
              <li key={idx} className="font-mono text-xs bg-sky-100 dark:bg-sky-900/50 p-1.5 rounded border border-sky-200 dark:border-sky-700 text-sky-700 dark:text-sky-300">
                {cmd}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4 max-w-4xl mx-auto">
          {displayMessages.map((msg) => {
            const meta = getSenderMeta(msg.sender, msg.error);
            return (
              <div key={msg.id} className={cn('flex items-start gap-3', meta.alignment)}>
                {msg.sender !== 'user' && (
                  <Avatar className="w-8 h-8 border shadow-sm flex-shrink-0">
                    <AvatarFallback className={cn('text-xs font-semibold', meta.avatarColor)} title={meta.tooltip}>
                      {meta.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={cn('relative rounded-lg p-3 text-sm max-w-[85%] shadow-sm break-words', meta.bubbleClass)}>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 opacity-90 flex items-center">
                    {meta.icon} <span className="ml-1.5">{meta.label}</span>
                  </p>

                  {msg.error && msg.sender !== 'user' && (
                     <div className="flex items-center gap-1 text-red-500 dark:text-red-400 mb-1 font-medium text-xs border-b border-red-200 dark:border-red-700 pb-1">
                        <AlertTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>Error: {msg.error === 'Interrupted by user' ? 'Stopped by user' : msg.error}</span>
                     </div>
                  )}

                  <div className="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-gray-100">
                    <ReactMarkdown
                      components={{
                        code({ node, inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          if (!inline && match) {
                            return (
                              <SyntaxHighlighter
                                style={atomDark}
                                language={match[1]}
                                PreTag="div"
                                {...props}
                                customStyle={{ margin: '0.5em 0', fontSize: '0.875em', borderRadius: '0.25rem'}}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            );
                          }
                          return (
                            <code className={cn(className, "bg-gray-200 dark:bg-gray-700 px-1 py-0.5 rounded text-xs")} {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {msg.content || (!msg.error && !msg.isDone ? '...' : '')}
                    </ReactMarkdown>
                  </div>

                  {msg.hasCodeArtifact && (
                    <div className="mt-2 pt-1.5 border-t border-gray-300 dark:border-slate-600 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                      <FileCode2Icon className="w-3.5 h-3.5 flex-shrink-0 text-sky-600 dark:text-sky-400" />
                      <span>Code applied to editor</span>
                    </div>
                  )}

                  {msg.sender === 'w2' && msg.parsedReview && (
                    <div className="mt-2 pt-1.5 border-t border-gray-300 dark:border-slate-600">
                        <h4 className="text-xs font-semibold mb-0.5 text-gray-700 dark:text-gray-300">Review Summary:</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                            <strong>Status:</strong> {msg.parsedReview.status} <br />
                            <strong>Action for W1:</strong> {msg.parsedReview.next_action_for_w1}
                        </p>
                        {msg.parsedReview.key_issues && msg.parsedReview.key_issues.length > 0 && (
                             <details className="mt-1 text-xs">
                                <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:underline">Key Issues ({msg.parsedReview.key_issues.length})</summary>
                                <ul className="list-disc pl-4 mt-1 text-gray-600 dark:text-gray-400 space-y-0.5">
                                    {msg.parsedReview.key_issues.map((issue, index) => (
                                        <li key={index}>{issue}</li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                  )}

                  <div className="flex justify-end items-center mt-1.5 text-xs opacity-70">
                    {msg.isDone && !msg.error && (
                        <span title="Complete" className="text-green-600 dark:text-green-400 mr-1.5">✔️</span>
                    )}
                    <span className="text-gray-500 dark:text-gray-400">
                      {new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
                {msg.sender === 'user' && (
                  <Avatar className="w-8 h-8 border shadow-sm flex-shrink-0">
                    <AvatarFallback className={cn('text-xs font-semibold', meta.avatarColor)} title={meta.tooltip}>
                      {meta.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
          {isStreaming && !isFinished && (
             <div className="flex justify-center items-center py-2">
                 <div className="text-sm text-gray-500 dark:text-gray-400 italic">AI is thinking...</div>
             </div>
          )}
          {displayMessages.filter(m => m.sender !== 'user').length === 0 && !isStreaming && !isFinished && (
            <div className="text-center text-gray-500 dark:text-gray-400 mt-8">Send a message to start the build.</div>
          )}
        </div>
      </ScrollArea>

      <form
        className="flex items-center gap-2 p-3 border-t bg-white dark:bg-slate-850"
        onSubmit={e => { e.preventDefault(); handleSendMessage(); }}
      >
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={isStreaming ? "Processing... please wait" : "Describe the component or feature you want to build..."}
          className="flex-1 bg-white dark:bg-slate-700 dark:text-gray-100 border-slate-300 dark:border-slate-600"
          disabled={isStreaming || isSendingRef.current}
          aria-label="Chat input"
        />
        {isStreaming ? (
             <Button type="button" size="icon" variant="destructive" onClick={stopStream} title="Stop Generation" aria-label="Stop generation">
               <SquareIcon className="w-5 h-5" />
             </Button>
          ) : (
             <Button type="submit" size="icon" variant="default" disabled={isSendingRef.current || !input.trim() || !settings?.provider} aria-label="Send message">
               <SendHorizontalIcon className="w-5 h-5" />
             </Button>
          )}
      </form>
    </div>
  );
}

export default BuildInterface;

// ======================================================================================
// FILE EXPLANATION: components/ui/buildInterface.tsx
// ======================================================================================
//
// This file defines the `BuildInterface` React component, which serves as the primary
// user interface for interacting with the VibeCodeDuo AI-driven development pipeline.
// It displays messages from various AI agents, shows project files, manages user input,
// and reflects the overall status and stage of the build process.
//
// Core Functionalities:
//
// 1. State Consumption (via `useBuildStream` hook):
//    - Utilizes the `useBuildStream` custom hook to get real-time state updates from
//      the AI pipeline. This includes:
//      - `streamMessages`: An array of messages from all participants (user, AI agents).
//      - `projectFiles`: Content of generated files.
//      - `pipelineStage`, `statusMessage`, `refinedPrompt`, `globalError`, `isFinished`,
//        `requiredInstalls`.
//      - Debate-specific outcomes: `debateSummaryText`, `debateAgreedPlan`, `debateOptions`,
//        `debateRequiresResolution`.
//    - It also gets `startStream` and `stopStream` functions from the hook to control
//      the pipeline.
//
// 2. Message Display:
//    - Renders a scrollable chat-like interface for `streamMessages`.
//    - Uses a `getSenderMeta` helper function to determine the display properties
//      (icon, label, avatar, colors, alignment) for each message based on the sender
//      (e.g., 'user', 'refiner', 'debaterA', 'debaterB', 'summarizer', 'w1', 'w2', 'system').
//      This function has been updated to include metadata for the new debate agents.
//    - Employs `ReactMarkdown` to render message content, allowing for formatted text
//      and code blocks.
//    - Uses `react-syntax-highlighter` for syntax highlighting of code blocks within
//      Markdown and for displaying `projectFiles`.
//    - Displays per-message errors and completion status (e.g., checkmark).
//    - Shows specific UI elements for review outcomes (`parsedReview` on W2 messages)
//      and code artifacts.
//
// 3. User Input:
//    - Provides an input field for the user to enter their initial prompt/request.
//    - A "Send" button triggers the `handleSendMessage` function.
//    - A "Stop" button (visible during streaming) allows the user to cancel the
//      ongoing pipeline process.
//    - Input and buttons are disabled appropriately during active processing.
//
// 4. Pipeline Control (`handleSendMessage`):
//    - Validates user input and AI settings before starting.
//    - Constructs a payload for the `/api/chat` endpoint, including the user's prompt
//      and AI configurations (`refinerConfig`, `worker1Config`, `worker2Config`)
//      derived from the `settings` prop.
//    - Calls `startStream` (from `useBuildStream`) to initiate the backend pipeline.
//    - Clears the input field upon successful start.
//    - Handles errors during stream initiation with toast notifications.
//    - **Important**: It does *not* send specific debate agent configurations; the
//      backend pipeline (`collaborationPipeline.ts`) derives these from the existing
//      worker configs.
//
// 5. Information Panels:
//    - **Status Bar**: Shows the current `pipelineStage`, `statusMessage`, and any
//      `globalError`.
//    - **Refined Prompt Panel**: Displays the `refinedPrompt` once available.
//    - **Debate Outcome Panel (New)**:
//      - Conditionally rendered when `debateSummaryText` is present.
//      - Displays the `debateAgreedPlan` (if any).
//      - Lists `debateOptions` if no clear plan or if resolution is required.
//      - Indicates if `debateRequiresResolution` is true.
//      - Shows the full `debateSummaryText` rendered as Markdown.
//    - **Project Files Panel**: Displays an expandable list of `projectFiles`, showing
//      their content with syntax highlighting.
//    - **Required Installs Panel**: Lists any `requiredInstalls` (package commands).
//
// 6. UI Enhancements:
//    - Uses `lucide-react` for icons.
//    - Leverages Shadcn UI components (`Avatar`, `Input`, `Button`, `ScrollArea`, etc.)
//      and `cn` utility for styling.
//    - Implements auto-scrolling to keep the latest messages in view.
//    - Provides toast notifications for errors and info.
//
// Dependencies:
// - `useBuildStream` hook for state and pipeline interaction.
// - `Settings` type from `settings-panel.tsx` for AI configuration.
// - `AiChatMessage` type (though `debateFullTranscript` is not directly rendered in the
//   message loop, the type is available for future enhancements).
// - UI component libraries (Shadcn, Lucide).
// - Markdown and syntax highlighting libraries.
//
// Purpose in the Application:
// The `BuildInterface` is the user's window into the AI-driven development process.
// It translates the complex, event-driven backend operations into a comprehensible
// and interactive experience. The addition of the "Debate Outcome Panel" and updated
// sender metadata makes the new debate stage visible and understandable to the user,
// aligning with the goal of a more transparent ("glassbox") AI reasoning process.
//