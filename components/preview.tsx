"use client"

import { useEffect, useState } from "react"
import { useFileSystem } from "@/context/file-system-context"

export default function Preview() {
  const { currentFile, fileContents } = useFileSystem()
  const [html, setHtml] = useState("")

  useEffect(() => {
    if (currentFile) {
      // Simple preview for HTML files
      if (currentFile.endsWith(".html")) {
        setHtml(fileContents[currentFile] || "")
      }
      // For other file types, show a placeholder
      else {
        setHtml(`<div style="padding: 20px; font-family: sans-serif;">
          <h2>Preview not available</h2>
          <p>Preview is only available for HTML files.</p>
          <p>Current file: ${currentFile}</p>
        </div>`)
      }
    } else {
      setHtml(`<div style="padding: 20px; font-family: sans-serif;">
        <h2>No file selected</h2>
        <p>Select an HTML file to preview its content.</p>
      </div>`)
    }
  }, [currentFile, fileContents])

  return (
    <div className="h-full flex flex-col">
      <div className="border-b p-2 text-sm text-gray-500">Preview: {currentFile || "No file selected"}</div>
      <div className="flex-1 overflow-auto bg-white">
        <iframe srcDoc={html} title="preview" className="w-full h-full border-0" sandbox="allow-scripts" />
      </div>
    </div>
  )
}
