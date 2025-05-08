// app/page.tsx

"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import FileTree from "@/components/ui/file-tree"
import { BuildInterface } from "@/components/ui/BuildInterface"
import CodeEditor from "@/components/ui/code-editor"
import Preview from "@/components/ui/preview"
import { FileSystemProvider } from "@/context/file-system-context"
import Header from "@/components/ui/header"
import { SettingsPanel, Settings } from "@/components/ui/settings-panel"

export default function Home() {

  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState("editor");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    provider: "Ollama",
    worker1Model: "deepcoder:1.5b",
    worker2Model: "qwen3:4b",
  });

  // Handler for confirming settings changes
  const handleConfirmSettings = (newSettings: Settings) => {
    setSettings(newSettings);
    setSettingsOpen(false);
  };

  // Handler for cancel
  const handleCancelSettings = () => {
    setSettingsOpen(false);
  };

  return (
    <FileSystemProvider data-component="FileSystemProvider">
      <SettingsPanel
        open={settingsOpen}
        initialSettings={settings}
        onConfirm={handleConfirmSettings}
        onCancel={handleCancelSettings}
        data-component="SettingsPanel"
      />
      <div className="h-screen w-full flex flex-col overflow-hidden" role="document" aria-label="App Container" data-component="AppContainer">

        {/* Header */}
        <Header onSettingsClick={() => setSettingsOpen(true)} data-component="Header" />

        {/* Main Content */}
        <main className="flex-1 overflow-hidden" role="main" aria-label="Main content" data-component="MainContent">
          <ResizablePanelGroup direction="horizontal" data-component="ResizablePanelGroup">
            {/* Left Panel: Chat/Build Interface */}
            <ResizablePanel defaultSize={50} minSize={20} data-component="ChatPanel">
              <BuildInterface settings={settings} />
            </ResizablePanel>
            <ResizableHandle withHandle />
            {/* Right Panel: Workspace (FileTree + Editor/Preview) */}
            <ResizablePanel defaultSize={50} minSize={20} data-component="WorkspacePanel">
              <ResizablePanelGroup direction="horizontal" data-component="WorkspaceInnerPanelGroup">
                {/* FileTree (left) */}
                <ResizablePanel defaultSize={25} minSize={10} data-component="FileTreePanel">
                  <div className="h-full flex flex-col">
                    <FileTree selectedPath={activeFilePath} onFileSelect={setActiveFilePath} data-component="FileTree" />
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                {/* Editor/Preview (right) */}
                <ResizablePanel defaultSize={75} minSize={20} data-component="EditorPanel">
                  <div className="h-full flex flex-col">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full h-full" data-component="EditorTabs" role="tablist" aria-label="Editor Tabs">
                      <div className="border-b px-4">
                        <TabsList className="h-10">
                          <TabsTrigger value="editor">Code Editor</TabsTrigger>
                          <TabsTrigger value="preview">Preview</TabsTrigger>
                        </TabsList>
                      </div>
                      <TabsContent value="editor" className="flex-1 p-0 h-[calc(100vh-40px)]">
                      <CodeEditor filePath={activeFilePath} />

                      </TabsContent>
                      <TabsContent value="preview" className="flex-1 p-0 h-[calc(100vh-40px)]">
                        <Preview filePath={activeFilePath} />
                      </TabsContent>
                    </Tabs>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      </div>
    </FileSystemProvider>
  )
}
