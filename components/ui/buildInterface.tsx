// components/ui/BuildInterface.tsx
import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { stripFencedCodeBlocks } from '@/lib/utils/markdownSanitizer';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { AlertTriangleIcon } from 'lucide-react';
import { useBuildStream } from '@/hooks/useBuildStream';

interface BuildInterfaceProps {
  settings: any; // Replace with your actual settings type
}

export function BuildInterface({ settings }: BuildInterfaceProps) {
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);

  // Use the new build stream hook
  const {
    messages,
    projectFiles,
    pipelineStage,
    statusMessage,
    refinedPrompt,
    error,
    isFinished,
    startStream,
    stopStream,
  } = useBuildStream(isSendingRef);

  // Send user input to the pipeline
  const handleSendMessage = async () => {
    if (isSendingRef.current || !input.trim()) return;
    isSendingRef.current = true;
    // For now, just send the user input as the initial prompt
    // You may want to collect more settings for pipelineParams
    const payload = {
      messages: [
        {
          role: "user",
          content: input.trim(),
        },
      ],
      worker1: {
        provider: settings.provider,
        model: settings.worker1Model,
      },
      worker2: {
        provider: settings.provider,
        model: settings.worker2Model,
      },
    };
    startStream(payload);
    setInput('');
  };

  // Helper for message display
  const getSenderMeta = (sender: string, error?: string) => {
    const styles = {
      avatarInitial: '?',
      avatarColor: 'bg-gray-400 text-white',
      bubbleClass: 'bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700', // Default AI bubble
      alignment: 'justify-start',
      tooltip: 'Unknown',
    };

    switch (sender) {
      case "user":
        return {
          icon: "🧑",
          label: "You",
          avatarInitial: "U",
          avatarColor: "bg-blue-600 text-white",
          bubbleClass: "bg-blue-500 text-white dark:bg-blue-600",
          alignment: "justify-end",
          tooltip: "User",
        };
      case "refiner":
        return {
          icon: "🧠",
          label: "Refiner Bot",
          avatarInitial: "R",
          avatarColor: "bg-orange-600 text-white",
          bubbleClass: "bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700",
          alignment: "justify-start",
          tooltip: "Refiner",
        };
      case "worker1":
      case "w1":
        return {
          icon: "💻",
          label: "Coder Bot",
          avatarInitial: "W1",
          avatarColor: "bg-green-600 text-white",
          bubbleClass: "bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700",
          alignment: "justify-start",
          tooltip: "Worker 1",
        };
      case "worker2":
      case "w2":
        return {
          icon: "🧐",
          label: "Reviewer Bot",
          avatarInitial: "W2",
          avatarColor: "bg-purple-600 text-white",
          bubbleClass: "bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700",
          alignment: "justify-start",
          tooltip: "Worker 2",
        };
      default:
        return {
          icon: "❓",
          label: "Unknown",
          avatarInitial: "?",
          avatarColor: "bg-gray-400 text-white",
          bubbleClass: "bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700",
          alignment: "justify-start",
          tooltip: sender,
        };
    }
  };


  return (
    <div
      className="flex flex-col h-full dark:bg-slate-900"
      role="main"
      data-component="BuildInterface"
    >
      {/* Status Area */}
      <div
        className="p-2 bg-slate-100 dark:bg-slate-800 border-b text-xs flex items-center gap-4"
        data-component="StatusArea"
      >
        <span>Stage: <b>{pipelineStage || '—'}</b></span>
        <span>Status: {statusMessage || '—'}</span>
        {isFinished && <span className="text-green-600 font-semibold">Pipeline finished</span>}
        {error && <span className="text-red-600 flex items-center gap-1"><AlertTriangleIcon className="w-4 h-4" />{error}</span>}
      </div>

      {/* Refined Prompt */}
      {refinedPrompt && (
        <div
          className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border-b text-sm"
          role="region"
          aria-label="Refined Prompt"
          data-component="RefinedPrompt"
        >
          <b>Refined Prompt:</b> {refinedPrompt}
        </div>
      )}

      {/* Project Files Area (scrollable, max height) */}
      <div
        className="flex flex-col gap-2 p-2 border-b bg-slate-50 dark:bg-slate-900/40 max-h-[40vh] overflow-y-auto"
        role="region"
        aria-label="Project Files"
        data-component="ProjectFiles"
      >

        <b data-component="ProjectFilesLabel">Project Files:</b>
        {Object.entries(projectFiles).map(([filename, content]) => {
          const getLanguageFromFilename = (filename: string) => {
            if (filename.endsWith('.tsx') || filename.endsWith('.ts')) return 'tsx';
            if (filename.endsWith('.js')) return 'javascript';
            if (filename.endsWith('.jsx')) return 'jsx';
            if (filename.endsWith('.html')) return 'html';
            if (filename.endsWith('.css')) return 'css';
            return 'text';
          };

          return (
            <div
              key={filename}
              className="mb-4"
              data-component="ProjectFileItem"
            >
              <div className="text-xs font-mono text-blue-700 dark:text-blue-300" data-component="ProjectFileName">{filename}</div>
              <SyntaxHighlighter
                language={getLanguageFromFilename(filename)}
                style={atomDark}
                customStyle={{
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  padding: '1rem',
                  background: 'transparent'
                }}
                wrapLongLines
                showLineNumbers
              >
                {content}
              </SyntaxHighlighter>
            </div>
          );
        })}
      </div>
      {/* Project Files Area END */}

      {/* Chat/Log Area (always visible) */}
      <ScrollArea
        className="flex-1 p-4"
        ref={scrollAreaRef}
        role="region"
        aria-label="Chat Log"
        data-component="ChatLog"
      >
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.map((msg, i) => {
            const meta = getSenderMeta(msg.sender);

            return (
              <div
                key={i}
                className={cn('flex items-start gap-3', meta.alignment)}
                data-component="ChatBubble"
              >
                {msg.sender !== 'user' && (
                  <Avatar className="w-8 h-8 border shadow-sm" data-component="ChatAvatar">
                    <AvatarFallback
                      className={cn('text-xs font-semibold', meta.avatarColor)}
                      title={meta.tooltip}
                      data-component="ChatAvatarFallback"
                    >
                      {meta.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}

                {/* Bubble */}
                <div className={cn('rounded-lg p-3 text-sm max-w-[75%] shadow-sm', meta.bubbleClass)}>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    <span>{meta.icon}</span> {meta.label}
                  </p>

                  {msg.sender === 'worker2' && (
                    <pre className="text-xs text-gray-400">
                      debug: {JSON.stringify(msg.parsedReview)}
                    </pre>
                  )}

                  {msg.parsedReview ? (
                    <div className="space-y-1">
                      <p><strong>Status:</strong> {msg.parsedReview.status}</p>
                      {msg.parsedReview.key_issues.length > 0 && (
                        <>
                          <p><strong>Key Issues:</strong></p>
                          <ul className="list-disc list-inside">
                            {msg.parsedReview.key_issues.map((issue, idx) => (
                              <li key={idx}>{issue}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      <p><strong>Next Action:</strong> {msg.parsedReview.next_action_for_w1}</p>
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert">

                      <ReactMarkdown
                        components={{
                          code({ inline, className, children, ...props }: any) {
                            if (inline) {
                              return (
                                <code
                                  style={{
                                    backgroundColor: 'rgba(200,200,200,0.15)',
                                    padding: '0.1em 0.3em',
                                    borderRadius: '4px',
                                    fontSize: '0.9em',
                                  }}
                                >
                                  {children}
                                </code>
                              );
                            }
                            return <code {...props}>{children}</code>;
                          }
                        }}
                      >
                        {msg.sender === 'worker2' ? '' : stripFencedCodeBlocks(msg.content)}
                      </ReactMarkdown>

                    </div>
                  )}

                  {msg.isDone && (
                    <span className="text-green-600 text-xs ml-2">✔️</span>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <Avatar className="w-8 h-8 border shadow-sm" data-component="ChatAvatar">
                    <AvatarFallback
                      className={cn('text-xs font-semibold', meta.avatarColor)}
                      title={meta.tooltip}
                      data-component="ChatAvatarFallback"
                    >
                      {meta.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <form
        className="flex items-center gap-2 p-2 border-t bg-white dark:bg-slate-900/60"
        onSubmit={e => { e.preventDefault(); handleSendMessage(); }}
        role="form"
        aria-label="Prompt Input"
        data-component="PromptInput"
      >
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your prompt..."
          className="flex-1"
          disabled={isSendingRef.current}
          data-component="PromptInputField"
        />
        <Button type="submit" disabled={isSendingRef.current || !input.trim()} data-component="SendButton">
          Send
        </Button>
        {isSendingRef.current && (
          <Button type="button" variant="outline" onClick={stopStream} className="ml-2 text-red-600 border-red-300" data-component="StopButton">
            Stop
          </Button>
        )}
      </form>
    </div>
  );
}

export default BuildInterface;