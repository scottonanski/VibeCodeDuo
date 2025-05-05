"use client"

import { useState, useRef } from "react"
import { ChevronRight, ChevronDown, Folder, File, Plus, Trash, Edit, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useFileSystem } from "@/context/file-system-context"

export default function FileTree() {
  const { fileSystem, setCurrentFile, currentFile, addFolder, addFile, deleteItem, renameItem } = useFileSystem()

  const [newItemName, setNewItemName] = useState("")
  const [isAddingItem, setIsAddingItem] = useState<{ type: "file" | "folder"; path: string } | null>(null)
  const [isRenamingItem, setIsRenamingItem] = useState<{ path: string; name: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAddItem = (type: "file" | "folder", path: string) => {
    setIsAddingItem({ type, path })
    setNewItemName("")
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleRenameItem = (path: string, name: string) => {
    setIsRenamingItem({ path, name })
    setNewItemName(name)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const confirmAddItem = () => {
    if (!isAddingItem || !newItemName.trim()) return

    if (isAddingItem.type === "folder") {
      addFolder(`${isAddingItem.path}/${newItemName}`)
    } else {
      addFile(`${isAddingItem.path}/${newItemName}`)
    }

    setIsAddingItem(null)
    setNewItemName("")
  }

  const confirmRenameItem = () => {
    if (!isRenamingItem || !newItemName.trim()) return

    renameItem(isRenamingItem.path, newItemName)
    setIsRenamingItem(null)
    setNewItemName("")
  }

  const cancelAction = () => {
    setIsAddingItem(null)
    setIsRenamingItem(null)
    setNewItemName("")
  }

  // Simplified renderTree function that safely handles null values
  const renderTree = (tree: any, path = "") => {
    if (!tree) return null

    return Object.entries(tree)
      .map(([name, item]: [string, any]) => {
        // Skip internal properties
        if (name === "_expanded") return null

        const currentPath = path ? `${path}/${name}` : name
        const isFolder = item !== null && typeof item === "object"

        // Skip rendering if this is the item being renamed
        if (isRenamingItem && isRenamingItem.path === currentPath) {
          return (
            <div key={currentPath} className="flex items-center pl-4 py-1">
              <Input
                ref={inputRef}
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRenameItem()
                  if (e.key === "Escape") cancelAction()
                }}
                className="h-7 mr-2"
              />
              <Button variant="ghost" size="icon" onClick={confirmRenameItem} className="h-7 w-7">
                <Save className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={cancelAction} className="h-7 w-7">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )
        }

        return (
          <div key={currentPath}>
            <div
              className={`flex items-center py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer ${
                currentFile === currentPath ? "bg-gray-100 dark:bg-gray-800" : ""
              }`}
            >
              {isFolder ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 mr-1"
                    onClick={() => {
                      // Safely toggle _expanded property
                      if (item) {
                        item._expanded = item._expanded === undefined ? true : !item._expanded
                        // Force re-render
                        setCurrentFile(currentFile)
                      }
                    }}
                  >
                    {item && item._expanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                  <Folder className="h-4 w-4 mr-2 text-blue-500" />
                  <span className="flex-1">{name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleAddItem("file", currentPath)}
                    className="h-6 w-6"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRenameItem(currentPath, name)}
                    className="h-6 w-6"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteItem(currentPath)} className="h-6 w-6">
                    <Trash className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-6 mr-1"></div>
                  <File className="h-4 w-4 mr-2 text-gray-500" />
                  <span className="flex-1" onClick={() => setCurrentFile(currentPath)}>
                    {name}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRenameItem(currentPath, name)}
                    className="h-6 w-6"
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteItem(currentPath)} className="h-6 w-6">
                    <Trash className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>

            {isFolder && item && item._expanded && (
              <div className="ml-6">
                {renderTree(item, currentPath)}

                {/* Add new item input if adding to this folder */}
                {isAddingItem && isAddingItem.path === currentPath && (
                  <div className="flex items-center pl-4 py-1">
                    <Input
                      ref={inputRef}
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmAddItem()
                        if (e.key === "Escape") cancelAction()
                      }}
                      className="h-7 mr-2"
                      placeholder={isAddingItem.type === "folder" ? "Folder name" : "File name"}
                    />
                    <Button variant="ghost" size="icon" onClick={confirmAddItem} className="h-7 w-7">
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={cancelAction} className="h-7 w-7">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })
      .filter(Boolean) // Filter out null entries
  }

  return (
    <div className="h-full border-l overflow-y-auto p-2">
      <div className="flex items-center justify-between mb-4 px-2">
        <h2 className="text-lg font-semibold">Files</h2>
        <div className="flex space-x-1">
          <Button variant="outline" size="sm" onClick={() => handleAddItem("file", "")} className="h-7">
            <File className="h-3.5 w-3.5 mr-1" />
            Add File
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleAddItem("folder", "")} className="h-7">
            <Folder className="h-3.5 w-3.5 mr-1" />
            Add Folder
          </Button>
        </div>
      </div>

      <div className="file-tree">
        {renderTree(fileSystem)}

        {/* Add new item at root level */}
        {isAddingItem && isAddingItem.path === "" && (
          <div className="flex items-center py-1">
            <Input
              ref={inputRef}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAddItem()
                if (e.key === "Escape") cancelAction()
              }}
              className="h-7 mr-2"
              placeholder={isAddingItem.type === "folder" ? "Folder name" : "File name"}
            />
            <Button variant="ghost" size="icon" onClick={confirmAddItem} className="h-7 w-7">
              <Save className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={cancelAction} className="h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
