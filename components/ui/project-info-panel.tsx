// components/ui/project-info-panel.tsx
import React, { useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import ReactMarkdown from "react-markdown";
import { ScrollArea } from "./scroll-area";

interface ProjectInfoPanelProps {
  projectFiles: Record<string, string>;
  requiredInstalls: string[];
  refinedPrompt?: string | null;
  debateOutcome?: string | null;
  plan?: string | null;
}

export function ProjectInfoPanel({ projectFiles, requiredInstalls, refinedPrompt, debateOutcome, plan }: ProjectInfoPanelProps) {
  // Debug log props received with more details
  useEffect(() => {
    console.log('[ProjectInfoPanel] Props changed:', {
      refinedPrompt: refinedPrompt ? `${refinedPrompt.substring(0, 20)}...` : null,
      debateOutcome: debateOutcome ? `${debateOutcome.substring(0, 20)}...` : null,
      plan: plan ? `${plan.substring(0, 20)}...` : null,
      projectFilesCount: projectFiles ? Object.keys(projectFiles).length : 0,
      requiredInstallsCount: requiredInstalls ? requiredInstalls.length : 0,
      timestamp: Date.now()
    });
  }, [refinedPrompt, debateOutcome, plan, projectFiles, requiredInstalls]);

  // Concise log per render for debugging
  console.log('[ProjectInfoPanel] Rendered with:', {
    refinedPrompt: refinedPrompt ? `${refinedPrompt.substring(0, 20)}...` : null,
    debateOutcome: debateOutcome ? `${debateOutcome.substring(0, 20)}...` : null,
    plan: plan ? `${plan.substring(0, 20)}...` : null,
    projectFilesCount: projectFiles ? Object.keys(projectFiles).length : 0,
    requiredInstallsCount: requiredInstalls ? requiredInstalls.length : 0
  });

  // Parse values that might be JSON stringified objects
  const safelyParseContent = (content: any): string => {
    // If content is null, undefined, or the string 'undefined', return empty string
    if (!content || content === 'undefined' || content === undefined || content === null) return '';
    
    // If it's already a string, return it (but check for 'undefined' string)
    if (typeof content === 'string') {
      return content === 'undefined' ? '' : content;
    }
    
    try {
      // If it's a JSON object, stringify it nicely
      if (typeof content === 'object') {
        return JSON.stringify(content, null, 2);
      }
      // Otherwise convert to string
      return String(content);
    } catch (e) {
      console.error('Error parsing content in ProjectInfoPanel:', e);
      return '';
    }
  };
  
  // Ensure consistent property naming throughout the component
  // In page.tsx: the prop is passed as debateOutcome={debateSummaryText}
  const refinedPromptStr = safelyParseContent(refinedPrompt);
  const debateOutcomeStr = safelyParseContent(debateOutcome); // This is debateSummaryText from page.tsx
  const planStr = safelyParseContent(plan); // This is debateAgreedPlan from page.tsx

  const hasProjectFiles = projectFiles && Object.keys(projectFiles).length > 0;
  const hasRequiredInstalls = requiredInstalls && requiredInstalls.length > 0;
  const hasRefinedPrompt = !!refinedPromptStr;
  const hasDebateOutcome = !!debateOutcomeStr;
  const hasPlan = !!planStr;
  
  // Debug the actual property values that come into the component
  console.log('[ProjectInfoPanel] Raw property values:', { 
    refinedPrompt, 
    debateOutcome, 
    plan, 
    projectFilesCount: projectFiles ? Object.keys(projectFiles).length : 0,
    requiredInstallsCount: requiredInstalls ? requiredInstalls.length : 0
  });

  // No longer use the empty check - always display sections with placeholders
  // This ensures the panel is visible even when data is still loading

  return (
    <div className="h-full flex flex-col p-3 space-y-4 bg-slate-50 dark:bg-slate-900 overflow-y-auto border-r dark:border-slate-800">
      {/* Refined Prompt section */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400 sticky top-0 bg-slate-50 dark:bg-slate-900 py-1 z-10 -mx-3 px-3 border-b dark:border-slate-800">
          Refined Prompt:
        </h3>
        <div className="text-xs p-2 bg-amber-50 dark:bg-amber-900/30 rounded border border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300">
          <ReactMarkdown>
            {refinedPromptStr || "No refined prompt available yet"}
          </ReactMarkdown>
        </div>
      </div>

      {/* Debate Outcome section */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 sticky top-0 bg-slate-50 dark:bg-slate-900 py-1 z-10 -mx-3 px-3 border-b dark:border-slate-800">
          Debate Outcome & Plan:
        </h3>
        <div className="text-xs p-2 bg-emerald-50 dark:bg-emerald-900/30 rounded border border-emerald-200 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 whitespace-pre-line">
          <ReactMarkdown>
            {debateOutcomeStr || "No debate outcome available yet"}
          </ReactMarkdown>
        </div>
      </div>

      {/* Full Plan section */}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-purple-700 dark:text-purple-400 sticky top-0 bg-slate-50 dark:bg-slate-900 py-1 z-10 -mx-3 px-3 border-b dark:border-slate-800">
          Full Detailed Plan:
        </h3>
        <div className="text-xs p-2 bg-purple-50 dark:bg-purple-900/30 rounded border border-purple-200 dark:border-purple-700 text-purple-800 dark:text-purple-300 whitespace-pre-line">
          <ReactMarkdown>
            {planStr || "No plan available yet"}
          </ReactMarkdown>
        </div>
      </div>
      
      {hasProjectFiles && (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 sticky top-0 bg-slate-50 dark:bg-slate-900 py-1 z-10 -mx-3 px-3 border-b dark:border-slate-800">
            Project Files
          </h3>
          <div className="flex flex-col gap-2 pt-1">
            {Object.entries(projectFiles).map(([filename, content]) => {
              const getLang = (name: string) => {
                const ext = name.split('.').pop()?.toLowerCase();
                if (ext === 'tsx' || ext === 'ts') return 'typescript';
                if (ext === 'js' || ext === 'jsx') return 'javascript';
                if (ext === 'html') return 'markup';
                if (ext === 'css') return 'css';
                if (ext === 'json') return 'json';
                return 'plaintext';
              };
              return (
                <details key={filename} className="bg-white dark:bg-slate-800/50 rounded shadow-sm">
                  <summary className="text-xs font-mono text-blue-600 dark:text-blue-400 p-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-t">
                    {filename}
                  </summary>
                  <div className="p-0 m-0 max-h-52 overflow-y-auto">
                    <SyntaxHighlighter
                      language={getLang(filename)}
                      style={atomDark}
                      customStyle={{ borderRadius: '0 0 0.25rem 0.25rem', fontSize: '0.75rem', margin: '0', padding: '0.5rem' }}
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
        </div>
      )}

      {hasRequiredInstalls && (
        <div className={`flex flex-col gap-1 ${hasProjectFiles ? 'pt-3 mt-3 border-t dark:border-slate-800' : ''} mt-auto`}>
          <h3 className="text-sm font-semibold text-sky-700 dark:text-sky-300 sticky top-0 bg-slate-50 dark:bg-slate-900 py-1 z-10 -mx-3 px-3 border-b dark:border-slate-800">
            📦 Required Installs
          </h3>
          <ul className="space-y-1 text-xs pt-1">
            {requiredInstalls.map((cmd, idx) => (
              <li key={idx} className="font-mono bg-sky-100 dark:bg-sky-800/50 p-1.5 rounded border border-sky-200 dark:border-sky-700 text-sky-700 dark:text-sky-300">
                {cmd}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}