// app/page.tsx
"use client"

import { useEffect, useState, useRef } from "react";
import { Toaster } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import FileTree from "@/components/ui/file-tree";
import { BuildInterface } from "@/components/ui/build-interface"; // Corrected path if it was buildInterface.tsx
import CodeEditor from "@/components/ui/code-editor";
import Preview from "@/components/ui/preview";
import { FileSystemProvider } from "@/context/file-system-context";
import Header from "@/components/ui/header";
import { SettingsPanel, Settings } from "@/components/ui/settings-panel";
import { useTabStore } from "@/stores/tabStore";
import { EditorTabs } from "@/components/ui/editor-tabs";
import { useUIStore } from "@/stores/uiStore";
import { ProjectInfoPanel } from "@/components/ui/project-info-panel";
import { useBuildStream } from '@/hooks/useBuildStream';

export default function Home() {
  
  const { activeViewTab, setActiveViewTab } = useUIStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { activeTabPath } = useTabStore();
  const [settings, setSettings] = useState<Settings>({
    provider: "Ollama",
    refinerModel: "phi3",
    worker1Model: "deepcoder:1.5b",
    worker2Model: "qwen3:4b",
  });
  const [showProjectInfo, setShowProjectInfo] = useState(true);

  const pageLevelIsSendingRef = useRef(false);
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
    debateSummaryText,
    debateAgreedPlan,
    debateOptions, // Keep if needed for any other logic, or remove if truly unused
    debateRequiresResolution, // Keep if needed for any other logic, or remove if truly unused
  } = useBuildStream(pageLevelIsSendingRef);

  useEffect(() => {
    console.log('[Page.tsx] Data from useBuildStream hook:', {
      refinedPrompt: refinedPrompt ? `"${refinedPrompt.substring(0,30)}..."` : null,
      debateSummaryText: debateSummaryText ? `"${debateSummaryText.substring(0,30)}..."` : null,
      debateAgreedPlan: debateAgreedPlan ? `"${debateAgreedPlan.substring(0,30)}..."` : null,
      projectFilesCount: projectFiles ? Object.keys(projectFiles).length : 0,
      installsCount: requiredInstalls ? requiredInstalls.length : 0,
      isStreaming,
      isFinished,
      globalError,
      pipelineStage,
      // timestamp: Date.now() // Already in useBuildStream log, might be redundant here
    });
  }, [ refinedPrompt, debateSummaryText, debateAgreedPlan, projectFiles, requiredInstalls, isStreaming, isFinished, globalError, pipelineStage ]);

  useEffect(() => {
    console.log('[Page.tsx] isStreaming CHANGED to:', isStreaming);
    console.log('[Page.tsx] Corresponding pageLevelIsSendingRef.current:', pageLevelIsSendingRef.current);
  }, [isStreaming]);

  const handleConfirmSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    setSettingsOpen(false);
  };

  const handleCancelSettings = () => {
    setSettingsOpen(false);
  };

  return (
    <>
      <Toaster richColors position="bottom-right" />
      <FileSystemProvider data-component="FileSystemProvider">
        <SettingsPanel
          open={settingsOpen}
          initialSettings={settings}
          onConfirm={handleConfirmSettings}
          onCancel={handleCancelSettings}
          data-component="SettingsPanel"
        />
        <div className="h-screen w-full flex flex-col overflow-hidden" role="document" aria-label="App Container" data-component="AppContainer">
          <Header onSettingsClick={() => setSettingsOpen(true)} data-component="Header" />
          <main className="flex-1 overflow-hidden flex flex-row" role="main" aria-label="Main content" data-component="MainContent">
            <div className={showProjectInfo ? "w-64 min-w-[450px] max-w-[450px] bg-slate-100 dark:bg-slate-900 border-r dark:border-slate-800 flex-shrink-0 flex flex-col transition-all duration-200" : "w-10 min-w-[40px] max-w-[40px] bg-slate-100 dark:bg-slate-900 border-r dark:border-slate-800 flex-shrink-0 flex flex-col items-center justify-start transition-all duration-200"}>
              <button
                onClick={() => setShowProjectInfo((v: boolean) => !v)}
                className="mt-4 bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 px-2 py-1 rounded shadow hover:bg-slate-400 dark:hover:bg-slate-600 focus:outline-none"
                aria-label={showProjectInfo ? "Hide Project Info" : "Show Project Info"}
                type="button"
              >
                {showProjectInfo ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                )}
              </button>
              {showProjectInfo && (
                <div className="flex-1">
                  <ProjectInfoPanel 
                    projectFiles={projectFiles || {}}
                    requiredInstalls={requiredInstalls || []}
                    refinedPrompt={refinedPrompt}
                    debateOutcome={debateSummaryText}
                    plan={debateAgreedPlan}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-1 h-full">
              <ResizablePanelGroup direction="horizontal" data-component="ResizablePanelGroupOverall">
                <ResizablePanel defaultSize={60} minSize={30} order={1} data-component="ChatPanel" className="min-w-[400px] md:min-w-[600px] lg:min-w-[860px]">
                  <BuildInterface 
                    settings={settings}
                    streamMessages={streamMessages}
                    pipelineStage={pipelineStage}
                    statusMessage={statusMessage}
                    globalError={globalError}
                    isFinished={isFinished}
                    startStream={startStream}
                    stopStream={stopStream}
                    isStreaming={isStreaming}
                    // The following props were likely missing and causing the TypeScript error,
                    // but based on our previous discussion, BuildInterface might not need them anymore.
                    // If BuildInterface *still* needs them, keep them. Otherwise, remove them from BuildInterfaceProps.
                    // For now, I'm assuming Option 1 (BuildInterface doesn't need them).
                    // If you choose Option 2 for the previous error, add them back here:
                    // projectFiles={projectFiles || {}}
                    // requiredInstalls={requiredInstalls || []}
                    // debateSummaryText={debateSummaryText}
                    // debateAgreedPlan={debateAgreedPlan}
                    // debateOptions={debateOptions}
                    // debateRequiresResolution={debateRequiresResolution}
                  />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={40} minSize={25} order={2} data-component="WorkspacePanel">
                  <ResizablePanelGroup direction="horizontal" data-component="WorkspaceInnerPanelGroup">
                    <ResizablePanel defaultSize={25} minSize={10} data-component="FileTreePanel">
                      <div className="h-full flex flex-col">
                        <FileTree data-component="FileTree" />
                      </div>
                    </ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={75} minSize={20} data-component="EditorPanel">
                      <div className="h-full flex flex-col">
                        <Tabs
                          value={activeViewTab}
                          onValueChange={(value) => setActiveViewTab(value as "editor" | "preview")}
                          className="w-full h-full"
                          data-component="EditorTabs"
                          role="tablist"
                          aria-label="Editor Tabs"
                        >
                          <div className="border-b px-4">
                            <TabsList className="h-10">
                              <TabsTrigger value="editor">Code Editor</TabsTrigger>
                              <TabsTrigger value="preview">Preview</TabsTrigger>
                            </TabsList>
                          </div>
                          <TabsContent value="editor" className="flex-1 p-0 h-[calc(100vh-40px)]">
                            <EditorTabs />
                            {activeTabPath && (
                              <CodeEditor filePath={activeTabPath} />
                            )}
                          </TabsContent>
                          <TabsContent value="preview" className="flex-1 p-0 h-[calc(100vh-40px)]">
                            {activeTabPath && (
                              <Preview filePath={activeTabPath} />
                            )}
                          </TabsContent>
                        </Tabs>
                      </div>
                    </ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div> 
          </main>
        </div>
      </FileSystemProvider>
    </>
  );
}