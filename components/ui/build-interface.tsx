// components/ui/build-interface.tsx
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
    AlertTriangleIcon, 
    FileCode2Icon, 
    SendHorizontalIcon, 
    SquareIcon, 
    BrainIcon, 
    UsersIcon, 
    MessageSquareTextIcon 
} from 'lucide-react';
import type { BuildStreamMessage } from '@/hooks/useBuildStream';
import type { Settings } from "@/components/ui/settings-panel";
import { toast } from 'sonner';
import type { AiChatMessage } from '@/lib/orchestration/stages/types';

interface DisplayMessage extends BuildStreamMessage {
  timestamp: number;
}

interface BuildInterfaceProps {
  settings: Settings;
  streamMessages: BuildStreamMessage[];
  pipelineStage: string | null;
  statusMessage: string | null;
  globalError: string | null;
  isFinished: boolean;
  isStreaming: boolean;
  startStream: (payload: any) => Promise<void>;
  stopStream: () => void;
  // No projectFiles, refinedPrompt, etc. here, as ProjectInfoPanel handles them
}

export function BuildInterface({
  settings,
  streamMessages,
  pipelineStage,
  statusMessage,
  globalError,
  isFinished,
  isStreaming,
  startStream,
  stopStream
}: BuildInterfaceProps) {

  const [input, setInput] = useState('');

  const handleSendMessage = async () => {
    if (isStreaming) {
      toast.info("A process is already running.");
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

    const initialUserMessage: AiChatMessage = { role: 'user', content: input.trim() };

    const payload = {
      messages: [initialUserMessage],
      worker1: { provider: settings.provider, model: settings.worker1Model },
      worker2: { provider: settings.provider, model: settings.worker2Model },
      refiner: { provider: settings.provider, model: settings.refinerModel } 
    };

    try {
      await startStream(payload);
      setInput('');
    } catch (e: any) {
      console.error("Error starting stream from BuildInterface:", e);
      toast.error(`Failed to start the build process: ${e.message || "Unknown error"}`);
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
      case "debatera": meta = { ...meta, icon: <UsersIcon className="w-4 h-4 inline-block mr-1" />, label: "Debater A", avatarInitial: "DA", avatarColor: "bg-teal-500 text-white", tooltip: "Debater A" }; break;
      case "debaterb": meta = { ...meta, icon: <UsersIcon className="w-4 h-4 inline-block mr-1" />, label: "Debater B", avatarInitial: "DB", avatarColor: "bg-cyan-500 text-white", tooltip: "Debater B" }; break;
      case "summarizer": meta = { ...meta, icon: <MessageSquareTextIcon className="w-4 h-4 inline-block mr-1" />, label: "Summarizer", avatarInitial: "Σ", avatarColor: "bg-indigo-500 text-white", tooltip: "Debate Summarizer" }; break;
      case "w1": meta = { ...meta, icon: <FileCode2Icon className="w-4 h-4 inline-block mr-1" />, label: "Coder Bot", avatarInitial: "W1", avatarColor: "bg-green-600 text-white", tooltip: settings.worker1Model || "Worker 1" }; break;
      case "w2": meta = { ...meta, icon: <FileCode2Icon className="w-4 h-4 inline-block mr-1 transform scale-x-[-1]" />, label: "Reviewer Bot", avatarInitial: "W2", avatarColor: "bg-purple-600 text-white", tooltip: settings.worker2Model || "Worker 2" }; break;
      case "system": meta = { ...meta, icon: <AlertTriangleIcon className="w-4 h-4 inline-block mr-1" />, label: "System", avatarInitial: "S", avatarColor: "bg-slate-500 text-white", tooltip: "System Message" }; break;
    }
    if (messageSpecificError) {
        meta.bubbleClass = cn(meta.bubbleClass, 'border-2 border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20');
    }
    return meta;
  };

  const renderMessage = (currentMsgData: DisplayMessage, idx: number) => {
    const meta = getSenderMeta(currentMsgData.sender, currentMsgData.error);
    
    return (
      
      // Start of Message Bubbles
      <div key={currentMsgData.id} className={cn('flex items-start gap-3', meta.alignment)}>
        {currentMsgData.sender !== 'user' && (
          <Avatar className="w-8 h-8 border shadow-sm flex-shrink-0">
            <AvatarFallback className={cn('text-xs font-semibold', meta.avatarColor)} title={meta.tooltip}>
              {meta.avatarInitial}
            </AvatarFallback>
          </Avatar>
        )}
  
        {/* Start of Message Content */}
        <div className={cn('relative rounded-lg p-3 text-sm max-w-[90%] shadow-sm break-words mb-10', meta.bubbleClass)}>
          <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 opacity-90 flex items-center">
            {meta.icon} <span className="ml-1.5">{meta.label}</span>
          </p>
  
          {currentMsgData.error && currentMsgData.sender !== 'user' && (
  
            // Start of Error Message
             <div className="flex items-center gap-1 text-red-500 dark:text-red-400 mb-1 font-medium text-xs border-b border-red-200 dark:border-red-700 pb-1">
                <AlertTriangleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Error: {currentMsgData.error === 'Interrupted by user' ? 'Stopped by user' : currentMsgData.error}</span>
             </div>
          )}
         {/* End of Error Message */}
  
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
              {currentMsgData.content || (!currentMsgData.error && !currentMsgData.isDone ? '...' : '')}
            </ReactMarkdown>
          </div>
  
          {currentMsgData.hasCodeArtifact && (
            <div className="mt-2 pt-1.5 border-t border-gray-300 dark:border-slate-600 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <FileCode2Icon className="w-3.5 h-3.5 flex-shrink-0 text-sky-600 dark:text-sky-400" />
              <span>Code applied to editor</span>
            </div>
          )}
  
          {currentMsgData.sender === 'w2' && currentMsgData.parsedReview && (
            <div className="mt-2 pt-1.5 border-t border-gray-300 dark:border-slate-600">
                <h4 className="text-xs font-semibold mb-0.5 text-gray-700 dark:text-gray-300">Review Summary:</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                    <strong>Status:</strong> {currentMsgData.parsedReview.status} <br />
                    <strong>Action for W1:</strong> {currentMsgData.parsedReview.next_action_for_w1}
                </p>
                {currentMsgData.parsedReview.key_issues && currentMsgData.parsedReview.key_issues.length > 0 && (
                     <details className="mt-1 text-xs">
                        <summary className="cursor-pointer text-gray-500 dark:text-gray-400 hover:underline">Key Issues ({currentMsgData.parsedReview.key_issues.length})</summary>
                        <ul className="list-disc pl-4 mt-1 text-gray-600 dark:text-gray-400 space-y-0.5">
                            {currentMsgData.parsedReview.key_issues.map((issue, index) => (
                                <li key={index}>{issue}</li>
                            ))}
                        </ul>
                    </details>
                )}
            </div>
          )}
  
          <div className="flex justify-end items-center mt-1.5 text-xs opacity-70">
            {currentMsgData.isDone && !currentMsgData.error && (
                <span title="Complete" className="text-green-600 dark:text-green-400 mr-1.5">✔️</span>
            )}
            <span className="text-gray-500 dark:text-gray-400">
              {new Date(currentMsgData.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        {currentMsgData.sender === 'user' && (
          <Avatar className="w-8 h-8 border shadow-sm flex-shrink-0">
            <AvatarFallback className={cn('text-xs font-semibold', meta.avatarColor)} title={meta.tooltip}>
              {meta.avatarInitial}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    );
    // End of Message Bubbles
  };

  const displayMessages: DisplayMessage[] = streamMessages.map((msg, index) => ({
    ...msg,
    timestamp: Date.now() + index, 
  }));

  // Create a ref to control the Virtuoso instance
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (virtuosoRef.current && displayMessages.length > 0) {
      // Use requestAnimationFrame to ensure the DOM has updated
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: displayMessages.length - 1,
          behavior: 'smooth',
          align: 'end'
        });
      });
    }
  }, [displayMessages]);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-200">
      <div className="p-2 bg-zinc-300 border-b border-zinc-400/50 shadow-md text-xs flex items-center gap-4 flex-wrap">
        <span className="whitespace-nowrap">Stage: <b>{pipelineStage || 'Idle'}</b></span>
        <span className="flex-grow min-w-0"><span className="font-semibold">Status:</span> {statusMessage || 'Waiting for prompt...'}</span>
        {isFinished && !globalError && <span className="text-green-600 font-semibold whitespace-nowrap">Pipeline finished ✔️</span>}
        {globalError && (
          <span className="text-red-600 flex items-center gap-1 whitespace-nowrap">
            <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />Error: {globalError}
          </span>
        )}
      </div>
        
      {/* This div will contain Virtuoso and give it space to fill */}
      <div className="flex-1 overflow-hidden w-full"> {/* p-4 gives padding like ScrollArea had */}
        <Virtuoso
          ref={virtuosoRef}
          className="h-full w-full"
          data={displayMessages}
          itemContent={(index, msgData) => renderMessage(msgData, index)}
          followOutput={true}
          initialTopMostItemIndex={displayMessages.length > 0 ? displayMessages.length - 1 : 0}
          atBottomStateChange={(atBottom) => {
            // This helps maintain the auto-scroll state
            if (atBottom) {
              virtuosoRef.current?.scrollToIndex({
                index: displayMessages.length - 1,
                behavior: 'smooth',
                align: 'end'
              });
            }
          }}
        />
      </div>

      {/* We can keep these conditional messages below the Virtuoso area for now */}
      <div className="max-w-4xl mx-auto px-4 pb-2">
          {isStreaming && !isFinished && (
             <div className="flex justify-center items-center py-2">
                 <div className="text-sm text-gray-500 dark:text-gray-400 italic">AI is thinking...</div>
             </div>
          )}
          {displayMessages.length === 0 && !isStreaming && !isFinished && (
            <div className="text-center font-italic text-gray-400 mt-2">
              Send a message to start the build.
            </div>
          )}
      </div>

      <form
        className="flex items-center gap-2 p-3 border-t bg-white dark:bg-slate-850"
        onSubmit={e => { e.preventDefault(); handleSendMessage(); }}
      >
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={isStreaming ? "Processing... please wait" : "Describe the component or feature you want to build..."}
          className="flex-1 bg-white dark:bg-slate-700 dark:text-gray-100 border-slate-300 dark:border-slate-600"
          disabled={isStreaming}
          aria-label="Chat input"
        />
        {isStreaming ? (
             <Button type="button" size="icon" variant="destructive" onClick={stopStream} title="Stop Generation" aria-label="Stop generation">
               <SquareIcon className="w-5 h-5" />
             </Button>
          ) : (
             <Button type="submit" size="icon" variant="default" disabled={isStreaming || !input.trim() || !settings?.provider} aria-label="Send message">
               <SendHorizontalIcon className="w-5 h-5" />
             </Button>
          )}
      </form>
    </div>
  );
}
