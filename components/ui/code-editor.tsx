"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useFileSystem } from "@/context/file-system-context"

export default function CodeEditor() {
  const { currentFile, fileContents, updateFileContent } = useFileSystem()
  const [code, setCode] = useState("")

  useEffect(() => {
    if (currentFile) {
      setCode(fileContents[currentFile] || "")
    } else {
      setCode("")
    }
  }, [currentFile, fileContents])

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCode = e.target.value
    setCode(newCode)
    if (currentFile) {
      updateFileContent(currentFile, newCode)
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-2 text-sm text-gray-500">{currentFile || "No file selected"}</div>
      <div className="flex-1 overflow-hidden">
        {currentFile ? (
          <textarea
            value={code}
            onChange={handleCodeChange}
            className="w-full h-full p-4 font-mono text-sm resize-none focus:outline-none"
            placeholder="Write your code here..."
          />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            Select a file from the file tree to start editing
          </div>
        )}
      </div>
    </div>
  )
}
