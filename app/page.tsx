"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import FileTree from "@/components/file-tree"
import { ChatInterface } from "@/components/chat-interface"
import CodeEditor from "@/components/code-editor"
import Preview from "@/components/preview"
import { FileSystemProvider } from "@/context/file-system-context"

export default function Home() {
  const [activeTab, setActiveTab] = useState("editor")

  return (
    <FileSystemProvider>
      <div className="h-screen w-full flex flex-col overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            {/* Left Panel: Code Editor & Preview */}
            <ResizablePanel defaultSize={40} minSize={30}>
              <div className="h-full flex flex-col">
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <div className="border-b px-4">
                    <TabsList className="h-10">
                      <TabsTrigger value="editor">Code Editor</TabsTrigger>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="editor" className="flex-1 p-0 h-[calc(100vh-40px)]">
                    <CodeEditor />
                  </TabsContent>
                  <TabsContent value="preview" className="flex-1 p-0 h-[calc(100vh-40px)]">
                    <Preview />
                  </TabsContent>
                </Tabs>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Middle Panel: Chat Interface */}
            <ResizablePanel defaultSize={40} minSize={30}>
              <ChatInterface />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Panel: File Tree */}
            <ResizablePanel defaultSize={20} minSize={15}>
              <FileTree />
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>
      </div>
    </FileSystemProvider>
  )
}
