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
import { AlertTriangleIcon, FileCode2Icon, SendHorizontalIcon, SquareIcon } from 'lucide-react';
import { useBuildStream, type BuildStreamMessage } from '@/hooks/useBuildStream'; // Import BuildStreamMessage
import type { Settings } from "@/components/ui/settings-panel";
import { toast } from 'sonner';
import type { AiChatMessage } from '@/lib/orchestration/stages/types';

// DisplayMessage now directly uses/extends BuildStreamMessage which includes id and error?
interface DisplayMessage extends BuildStreamMessage {
  // id is inherited from BuildStreamMessage
  // error is inherited (optional) from BuildStreamMessage
  timestamp: number;  // UI-specific timestamp for sorting/display
}

interface BuildInterfaceProps {
  settings: Settings;
}

export function BuildInterface({ settings }: BuildInterfaceProps) {
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false); 

  const {
    messages: streamMessages, // These are BuildStreamMessage[] from the hook
    projectFiles,
    pipelineStage,
    statusMessage,
    refinedPrompt,
    error: globalError, // Renamed to avoid conflict with msg.error
    isFinished,
    requiredInstalls,
    startStream,
    stopStream,
    isStreaming, 
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
  }, [streamMessages]); 

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
    const apiMessages: AiChatMessage[] = [{ role: 'user', content: input.trim() }];
    const payload = {
      messages: apiMessages, 
      worker1: { provider: settings.provider, model: settings.worker1Model },
      worker2: { provider: settings.provider, model: settings.worker2Model },
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
      icon: "❓", label: "Unknown", avatarInitial: "?", avatarColor: "bg-gray-400 text-white",
      bubbleClass: "bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700",
      alignment: "justify-start", tooltip: sender,
    };
    switch (sender.toLowerCase()) { 
      case "user": meta = { ...meta, icon: "🧑", label: "You", avatarInitial: "U", avatarColor: "bg-blue-600 text-white", bubbleClass: "bg-blue-500 text-white dark:bg-blue-600", alignment: "justify-end", tooltip: "User" }; break;
      case "refiner": meta = { ...meta, icon: "🧠", label: "Refiner Bot", avatarInitial: "R", avatarColor: "bg-orange-500 text-white", tooltip: settings.refinerModel || "Refiner" }; break;
      case "w1": meta = { ...meta, icon: "💻", label: "Coder Bot (W1)", avatarInitial: "W1", avatarColor: "bg-green-600 text-white", tooltip: settings.worker1Model || "Worker 1" }; break;
      case "w2": meta = { ...meta, icon: "🧐", label: "Reviewer Bot (W2)", avatarInitial: "W2", avatarColor: "bg-purple-600 text-white", tooltip: settings.worker2Model || "Worker 2" }; break;
      case "system": meta = { ...meta, icon: "⚙️", label: "System", avatarInitial: "S", avatarColor: "bg-slate-500 text-white", tooltip: "System Message" }; break;
    }
    if (messageSpecificError) { // Use messageSpecificError passed to function
        meta.bubbleClass = cn(meta.bubbleClass, 'border-2 border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20');
    }
    return meta;
  };

  const displayMessages: DisplayMessage[] = streamMessages.map((msg: BuildStreamMessage, index: number) => ({ // Typed msg
    ...msg, // msg from hook now has id and optional error
    timestamp: Date.now() + index, 
  }));

  return (
    <div className="flex flex-col h-full dark:bg-slate-900">
      <div className="p-2 bg-slate-100 dark:bg-slate-800 border-b text-xs flex items-center gap-4 flex-wrap">
        <span className="whitespace-nowrap">Stage: <b>{pipelineStage || 'Idle'}</b></span>
        <span className="flex-grow min-w-0"><span className="font-semibold">Status:</span> {statusMessage || 'Waiting for prompt...'}</span>
        {isFinished && !globalError && <span className="text-green-600 font-semibold whitespace-nowrap">Pipeline finished ✔️</span>}
        {globalError && ( // Display global pipeline error
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
                    customStyle={{ borderRadius: '0 0 0.25rem 0.25rem', fontSize: '0.75rem', margin: '0', padding: '0.5rem', backgroundColor: '#2d2d2d' }}
                    lineNumberStyle={{color: '#666', fontSize: '0.7rem'}}
                    wrapLongLines={true}
                    showLineNumbers
                  >
                    {String(content || "// Empty file")} {/* Explicitly stringify */}
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
            {requiredInstalls.map((cmd: string, idx: number) => (
              <li key={idx} className="font-mono text-xs bg-sky-100 dark:bg-sky-900/50 p-1.5 rounded border border-sky-200 dark:border-sky-700 text-sky-700 dark:text-sky-300">
                {cmd}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4 max-w-4xl mx-auto">
          {displayMessages.map((msg: DisplayMessage) => { // msg is now DisplayMessage, which includes 'id' and 'error?'
            const meta = getSenderMeta(msg.sender, msg.error); // Pass per-message error
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
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 opacity-90">
                    <span>{meta.icon}</span> {meta.label}
                  </p>

                  {msg.error && msg.sender !== 'user' && ( // Use msg.error (per-message error)
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
                                    {msg.parsedReview.key_issues.map((issue: string, index: number) => (
                                        <li key={index}>{issue}</li>
                                    ))}
                                </ul>
                            </details>
                        )}
                    </div>
                  )}
                  
                  <div className="flex justify-end items-center mt-1.5 text-xs opacity-70">
                    {msg.isDone && !msg.error && ( // Check msg.error for completion tick
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