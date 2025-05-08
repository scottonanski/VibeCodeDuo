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
  settings: any;
}

export function BuildInterface({ settings }: BuildInterfaceProps) {
  const [input, setInput] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);

  const {
    messages,
    projectFiles,
    pipelineStage,
    statusMessage,
    refinedPrompt,
    error,
    isFinished,
    requiredInstalls, // ✅ FIXED: pull from hook
    startStream,
    stopStream,
  } = useBuildStream(isSendingRef);

  const handleSendMessage = async () => {
    if (isSendingRef.current || !input.trim()) return;
    isSendingRef.current = true;

    const payload = {
      messages: [{ role: "user", content: input.trim() }],
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

  const getSenderMeta = (sender: string, error?: string) => {
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
    <div className="flex flex-col h-full dark:bg-slate-900">
      {/* Status Bar */}
      <div className="p-2 bg-slate-100 dark:bg-slate-800 border-b text-xs flex items-center gap-4">
        <span>Stage: <b>{pipelineStage || '—'}</b></span>
        <span>Status: {statusMessage || '—'}</span>
        {isFinished && <span className="text-green-600 font-semibold">Pipeline finished</span>}
        {error && (
          <span className="text-red-600 flex items-center gap-1">
            <AlertTriangleIcon className="w-4 h-4" />{error}
          </span>
        )}
      </div>

      {/* Refined Prompt */}
      {refinedPrompt && (
        <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border-b text-sm">
          <b>Refined Prompt:</b> {refinedPrompt}
        </div>
      )}

      {/* Project Files Display */}
      <div className="flex flex-col gap-2 p-2 border-b bg-slate-50 dark:bg-slate-900/40 max-h-[40vh] overflow-y-auto">
        <b>Project Files:</b>
        {Object.entries(projectFiles).map(([filename, content]) => {
          const getLang = (name: string) => {
            if (name.endsWith('.tsx') || name.endsWith('.ts')) return 'tsx';
            if (name.endsWith('.js')) return 'javascript';
            if (name.endsWith('.jsx')) return 'jsx';
            if (name.endsWith('.html')) return 'html';
            if (name.endsWith('.css')) return 'css';
            return 'text';
          };

          return (
            <div key={filename} className="mb-4">
              <div className="text-xs font-mono text-blue-700 dark:text-blue-300">{filename}</div>
              <SyntaxHighlighter
                language={getLang(filename)}
                style={atomDark}
                customStyle={{
                  borderRadius: '0.5rem',
                  fontSize: '0.75rem',
                  padding: '1rem',
                  background: 'transparent',
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

      {/* 📦 Install Commands Section */}
      {requiredInstalls.length > 0 && (
        <div className="p-4 border-b bg-yellow-50 dark:bg-yellow-900/20">
          <b className="text-sm font-semibold text-yellow-900 dark:text-yellow-300 block mb-2">
            📦 Required Install Commands:
          </b>
          <ul className="space-y-1">
            {requiredInstalls.map((cmd: string, idx: number) => (
              <li
                key={idx}
                className="font-mono text-sm bg-yellow-100 dark:bg-yellow-900/50 p-2 rounded-md border border-yellow-200 dark:border-yellow-700 text-yellow-800 dark:text-yellow-200"
              >
                {cmd}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Chat Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.map((msg, i) => {
            const meta = getSenderMeta(msg.sender);
            return (
              <div key={i} className={cn('flex items-start gap-3', meta.alignment)}>
                {msg.sender !== 'user' && (
                  <Avatar className="w-8 h-8 border shadow-sm">
                    <AvatarFallback className={cn('text-xs font-semibold', meta.avatarColor)} title={meta.tooltip}>
                      {meta.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={cn('rounded-lg p-3 text-sm max-w-[75%] shadow-sm', meta.bubbleClass)}>
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
                    <span>{meta.icon}</span> {meta.label}
                  </p>

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
                  {msg.isDone && <span className="text-green-600 text-xs ml-2">✔️</span>}
                </div>
                {msg.sender === 'user' && (
                  <Avatar className="w-8 h-8 border shadow-sm">
                    <AvatarFallback className={cn('text-xs font-semibold', meta.avatarColor)} title={meta.tooltip}>
                      {meta.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Input */}
      <form
        className="flex items-center gap-2 p-2 border-t bg-white dark:bg-slate-900/60"
        onSubmit={e => { e.preventDefault(); handleSendMessage(); }}
      >
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Type your prompt..."
          className="flex-1"
          disabled={isSendingRef.current}
        />
        <Button type="submit" disabled={isSendingRef.current || !input.trim()}>
          Send
        </Button>
        {isSendingRef.current && (
          <Button type="button" variant="outline" onClick={stopStream} className="ml-2 text-red-600 border-red-300">
            Stop
          </Button>
        )}
      </form>
    </div>
  );
}

export default BuildInterface;
