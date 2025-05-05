"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

type FileSystemContextType = {
  fileSystem: Record<string, any>
  currentFile: string | null
  fileContents: Record<string, string>
  setCurrentFile: (path: string | null) => void
  addFolder: (path: string) => void
  addFile: (path: string) => void
  deleteItem: (path: string) => void
  renameItem: (path: string, newName: string) => void
  updateFileContent: (path: string, content: string) => void
}

const FileSystemContext = createContext<FileSystemContextType | undefined>(undefined)

export function FileSystemProvider({ children }: { children: ReactNode }) {
  const [fileSystem, setFileSystem] = useState<Record<string, any>>({
    src: {
      _expanded: true,
      components: {
        _expanded: true,
        "App.js": null,
        "Header.js": null,
      },
      "index.js": null,
      "styles.css": null,
    },
    public: {
      _expanded: true,
      "index.html": null,
    },
  })

  const [currentFile, setCurrentFile] = useState<string | null>(null)
  const [fileContents, setFileContents] = useState<Record<string, string>>({
    "src/index.js": `import React from 'react';\nimport ReactDOM from 'react-dom';\nimport App from './components/App';\nimport './styles.css';\n\nReactDOM.render(<App />, document.getElementById('root'));`,
    "src/components/App.js": `import React from 'react';\nimport Header from './Header';\n\nfunction App() {\n  return (\n    <div className="app">\n      <Header />\n      <main>\n        <h1>Welcome to My App</h1>\n        <p>This is a sample React application.</p>\n      </main>\n    </div>\n  );\n}\n\nexport default App;`,
    "src/components/Header.js": `import React from 'react';\n\nfunction Header() {\n  return (\n    <header>\n      <nav>\n        <ul>\n          <li><a href="/">Home</a></li>\n          <li><a href="/about">About</a></li>\n          <li><a href="/contact">Contact</a></li>\n        </ul>\n      </nav>\n    </header>\n  );\n}\n\nexport default Header;`,
    "src/styles.css": `body {\n  margin: 0;\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,\n    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;\n}\n\n.app {\n  max-width: 1200px;\n  margin: 0 auto;\n  padding: 20px;\n}\n\nheader {\n  background-color: #333;\n  color: white;\n  padding: 10px 0;\n}\n\nnav ul {\n  display: flex;\n  list-style: none;\n  padding: 0;\n  margin: 0;\n}\n\nnav li {\n  margin-right: 20px;\n}\n\nnav a {\n  color: white;\n  text-decoration: none;\n}\n\nmain {\n  padding: 20px 0;\n}`,
    "public/index.html": `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My React App</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script src="../src/index.js"></script>\n</body>\n</html>`,
  })

  const addFolder = (path: string) => {
    const parts = path.split("/")
    const folderName = parts.pop() as string
    const parentPath = parts.join("/")

    setFileSystem((prev) => {
      const newFileSystem = { ...prev }
      let current = newFileSystem

      if (parentPath) {
        for (const part of parentPath.split("/")) {
          current = current[part]
        }
      }

      current[folderName] = { _expanded: true }
      return newFileSystem
    })
  }

  const addFile = (path: string) => {
    const parts = path.split("/")
    const fileName = parts.pop() as string
    const parentPath = parts.join("/")

    setFileSystem((prev) => {
      const newFileSystem = { ...prev }
      let current = newFileSystem

      if (parentPath) {
        for (const part of parentPath.split("/")) {
          current = current[part]
        }
      }

      current[fileName] = null
      return newFileSystem
    })

    // Initialize empty file content
    setFileContents((prev) => ({
      ...prev,
      [path]: "",
    }))
  }

  const deleteItem = (path: string) => {
    const parts = path.split("/")
    const itemName = parts.pop() as string
    const parentPath = parts.join("/")

    setFileSystem((prev) => {
      const newFileSystem = { ...prev }
      let current = newFileSystem

      if (parentPath) {
        for (const part of parentPath.split("/")) {
          current = current[part]
        }
      }

      delete current[itemName]
      return newFileSystem
    })

    // Remove file content if it's a file
    if (fileContents[path]) {
      setFileContents((prev) => {
        const newContents = { ...prev }
        delete newContents[path]
        return newContents
      })
    }

    // If current file is deleted, reset current file
    if (currentFile === path) {
      setCurrentFile(null)
    }
  }

  const renameItem = (path: string, newName: string) => {
    const parts = path.split("/")
    const oldName = parts.pop() as string
    const parentPath = parts.join("/")
    const newPath = parentPath ? `${parentPath}/${newName}` : newName

    setFileSystem((prev) => {
      const newFileSystem = { ...prev }
      let current = newFileSystem

      if (parentPath) {
        for (const part of parentPath.split("/")) {
          current = current[part]
        }
      }

      // Copy the item with new name
      current[newName] = current[oldName]
      // Delete the old item
      delete current[oldName]

      return newFileSystem
    })

    // Update file content path if it's a file
    if (fileContents[path]) {
      setFileContents((prev) => {
        const newContents = { ...prev }
        newContents[newPath] = newContents[path]
        delete newContents[path]
        return newContents
      })
    }

    // Update current file if it's renamed
    if (currentFile === path) {
      setCurrentFile(newPath)
    }
  }

  const updateFileContent = (path: string, content: string) => {
    setFileContents((prev) => ({
      ...prev,
      [path]: content,
    }))
  }

  return (
    <FileSystemContext.Provider
      value={{
        fileSystem,
        currentFile,
        fileContents,
        setCurrentFile,
        addFolder,
        addFile,
        deleteItem,
        renameItem,
        updateFileContent,
      }}
    >
      {children}
    </FileSystemContext.Provider>
  )
}

export function useFileSystem() {
  const context = useContext(FileSystemContext)
  if (context === undefined) {
    throw new Error("useFileSystem must be used within a FileSystemProvider")
  }
  return context
}
