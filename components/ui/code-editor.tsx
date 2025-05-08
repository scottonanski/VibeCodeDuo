"use client"

import Editor from "@monaco-editor/react"
import { useFileStore } from "@/stores/fileStore"

interface CodeEditorProps {
  filePath: string | null
}

export default function CodeEditor({ filePath }: CodeEditorProps) {
  const files = useFileStore((state) => state.files)
  const updateFileContent = useFileStore((state) => state.updateFileContent)

  const code = filePath && files[filePath]?.type === "file" ? files[filePath]?.content || "" : null

  const handleChange = (value: string | undefined) => {
    if (filePath && value !== undefined) {
      updateFileContent(filePath, value)
    }
  }

  const getLanguageFromExtension = (filename: string): string => {
    if (filename.endsWith(".ts")) return "typescript"
    if (filename.endsWith(".tsx")) return "typescript"
    if (filename.endsWith(".js")) return "javascript"
    if (filename.endsWith(".jsx")) return "javascript"
    if (filename.endsWith(".html")) return "html"
    if (filename.endsWith(".css")) return "css"
    if (filename.endsWith(".json")) return "json"
    return "plaintext"
  }

  if (!filePath || code === null) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a file to view/edit
      </div>
    )
  }

  return (
    <div className="h-full w-full">
    <Editor
  height="100%"
  defaultLanguage={getLanguageFromExtension(filePath)}
  value={code}
  onChange={handleChange}
  theme="vs-dark"
  options={{
    fontSize: 14,
    minimap: { enabled: false },
    wordWrap: "on",
    automaticLayout: true,
    scrollBeyondLastLine: false, 
    padding: {
      top: 16,
      bottom: 16,
    },
  }}
/>

    </div>
  )
}
