// components/ui/BuildInterface.tsx
import React, { useState, useRef } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  const getMessageStyle = (sender: string, error?: string) => {
    let avatarInitial = '?', avatarColor = 'bg-gray-400 text-white', bubbleClass = 'bg-white border border-gray-200 dark:bg-slate-800 dark:border-slate-700', alignment = 'justify-start', tooltip = sender;
    if (sender === 'user') {
      avatarInitial = 'U'; avatarColor = 'bg-blue-600 text-white'; bubbleClass = 'bg-blue-500 text-white dark:bg-blue-600'; alignment = 'justify-end'; tooltip = 'User';
    } else if (sender === 'w1' || sender === 'worker1') {
      avatarInitial = 'W1'; avatarColor = 'bg-green-600 text-white'; tooltip = 'Worker 1';
    } else if (sender === 'w2' || sender === 'worker2') {
      avatarInitial = 'W2'; avatarColor = 'bg-purple-600 text-white'; tooltip = 'Worker 2';
    } else if (sender === 'refiner') {
      avatarInitial = 'R'; avatarColor = 'bg-orange-600 text-white'; tooltip = 'Refiner';
    }
    if (error) bubbleClass = cn(bubbleClass, 'border-2 border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20');
    return { avatarInitial, avatarColor, bubbleClass, alignment, tooltip };
  };

  return (
    <div className="flex flex-col h-full dark:bg-slate-900">
      {/* Status Area */}
      <div className="p-2 bg-slate-100 dark:bg-slate-800 border-b text-xs flex items-center gap-4">
        <span>Stage: <b>{pipelineStage || '—'}</b></span>
        <span>Status: {statusMessage || '—'}</span>
        {isFinished && <span className="text-green-600 font-semibold">Pipeline finished</span>}
        {error && <span className="text-red-600 flex items-center gap-1"><AlertTriangleIcon className="w-4 h-4" />{error}</span>}
      </div>

      {/* Refined Prompt */}
      {refinedPrompt && (
        <div className="p-2 bg-yellow-50 dark:bg-yellow-900/20 border-b text-sm">
          <b>Refined Prompt:</b> {refinedPrompt}
        </div>
      )}

      {/* Code Editor Area (basic) */}
      <div className="flex flex-col gap-2 p-2 border-b bg-slate-50 dark:bg-slate-900/40">
        <b>Project Files:</b>
        {Object.entries(projectFiles).length === 0 && <div className="text-xs text-gray-500">No files yet</div>}
        {Object.entries(projectFiles).map(([filename, content]) => (
          <div key={filename} className="mb-2">
            <div className="text-xs font-mono text-blue-700 dark:text-blue-300">{filename}</div>
            <pre className="bg-slate-100 dark:bg-slate-800 rounded p-2 text-xs overflow-x-auto border mt-1">
              <code>{content}</code>
            </pre>
          </div>
        ))}
      </div>

      {/* Chat/Log Area */}
      <ScrollArea className="flex-1 p-4" ref={scrollAreaRef}>
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.map((msg, i) => {
            const styles = getMessageStyle(msg.sender, undefined);
            return (
              <div key={i} className={cn('flex items-start gap-3', styles.alignment)}>
                {msg.sender !== 'user' && (
                  <Avatar className="w-8 h-8 border shadow-sm">
                    <AvatarFallback className={cn('text-xs font-semibold', styles.avatarColor)} title={styles.tooltip}>
                      {styles.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={cn('rounded-lg p-3 text-sm max-w-[75%] shadow-sm', styles.bubbleClass)}>
                  <p className="whitespace-pre-wrap text-gray-900 dark:text-gray-100">{msg.content}</p>
                  {msg.isDone && <span className="text-green-600 text-xs ml-2">✔️</span>}
                </div>
                {msg.sender === 'user' && (
                  <Avatar className="w-8 h-8 border shadow-sm">
                    <AvatarFallback className={cn('text-xs font-semibold', styles.avatarColor)} title={styles.tooltip}>
                      {styles.avatarInitial}
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <form className="flex items-center gap-2 p-2 border-t bg-white dark:bg-slate-900/60" onSubmit={e => { e.preventDefault(); handleSendMessage(); }}>
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