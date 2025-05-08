// components/ui/file-tree.tsx

"use client"

import { useState, useRef } from "react"
import { ChevronRight, ChevronDown, Folder, File, Plus, Trash, Edit, Save, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useFileStore, buildFileTree } from "@/stores/fileStore"

interface FileTreeProps {
  selectedPath: string | null;
  onFileSelect: (path: string | null) => void;
}

export default function FileTree({ selectedPath, onFileSelect }: FileTreeProps) {
  const files = useFileStore((s) => s.files)
  const createFileOrFolder = useFileStore((s) => s.createFileOrFolder)
  const deleteFileOrFolder = useFileStore((s) => s.deleteFileOrFolder)
  const renameFileOrFolder = useFileStore((s) => s.renameFileOrFolder)

  const [newItemName, setNewItemName] = useState("")
  const [isAddingItem, setIsAddingItem] = useState<{ type: "file" | "folder"; path: string } | null>(null)
  const [isRenamingItem, setIsRenamingItem] = useState<{ path: string; name: string } | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const fileTree = buildFileTree(files)

  const handleToggleFolder = (folderPath: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev)
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath)
      } else {
        newSet.add(folderPath)
      }
      return newSet
    })
  }

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

    const newPath = isAddingItem.path ? `${isAddingItem.path}/${newItemName}` : newItemName
    createFileOrFolder(newPath, isAddingItem.type, isAddingItem.type === "file" ? "" : undefined)

    if (isAddingItem.type === "folder" && !expandedFolders.has(newPath)) {
      handleToggleFolder(newPath)
    }

    setIsAddingItem(null)
    setNewItemName("")
  }

  const confirmRenameItem = () => {
    if (!isRenamingItem || !newItemName.trim()) return

    const parts = isRenamingItem.path.split("/")
    const parentPath = parts.slice(0, -1).join("/")
    const newFullPath = parentPath ? `${parentPath}/${newItemName}` : newItemName
    renameFileOrFolder(isRenamingItem.path, newFullPath)
    setIsRenamingItem(null)
    setNewItemName("")
  }

  const cancelAction = () => {
    setIsAddingItem(null)
    setIsRenamingItem(null)
    setNewItemName("")
  }

  const renderTree = (nodes: any) => {
    const children = Array.isArray(nodes) ? nodes : Object.values(nodes);
    return children.map((node: any) => {
      const isRenaming = isRenamingItem?.path === node.path
      const isAdding = isAddingItem?.path === node.path
      const isExpanded = expandedFolders.has(node.path)

      return (
        <div
          key={node.path}
          className="ml-2"
          data-component={node.type === "folder" ? "FileTreeFolder" : "FileTreeFile"}
          aria-label={node.type === "folder" ? `Folder: ${node.path.split("/").pop()}` : `File: ${node.path.split("/").pop()}`}
        >
          <div
            className={`flex items-center py-1 px-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer ${
              selectedPath === node.path ? "bg-gray-100 dark:bg-gray-800" : ""
            }`}
          >
            {node.type === "folder" ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 mr-1"
                  onClick={() => handleToggleFolder(node.path)}
                  aria-label={isExpanded ? `Collapse folder ${node.path.split("/").pop()}` : `Expand folder ${node.path.split("/").pop()}`}
                  data-component="FileTreeFolderToggle"
                >
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
                <Folder className="h-4 w-4 mr-2 text-blue-500" />
                <span className="flex-1" onClick={() => onFileSelect(node.path)} data-component="FileTreeFolderLabel">{node.path.split("/").pop()}</span>
                <Button variant="ghost" size="icon" onClick={() => handleAddItem("file", node.path)} className="h-6 w-6" aria-label="Add file" data-component="FileTreeAddFile">
                  <Plus className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleRenameItem(node.path, node.path.split("/").pop() || "") } className="h-6 w-6" aria-label="Rename folder" data-component="FileTreeRenameFolder">
                  <Edit className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteFileOrFolder(node.path)} className="h-6 w-6" aria-label="Delete folder" data-component="FileTreeDeleteFolder">
                  <Trash className="h-3 w-3" />
                </Button>
              </>
            ) : (
              <>
                <div className="w-6 mr-1" />
                <File className="h-4 w-4 mr-2 text-gray-500" />
                <span className="flex-1" onClick={() => onFileSelect(node.path)} data-component="FileTreeFileLabel">{node.path.split("/").pop()}</span>
                <Button variant="ghost" size="icon" onClick={() => handleRenameItem(node.path, node.path.split("/").pop() || "") } className="h-6 w-6" aria-label="Rename file" data-component="FileTreeRenameFile">
                  <Edit className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => deleteFileOrFolder(node.path)} className="h-6 w-6" aria-label="Delete file" data-component="FileTreeDeleteFile">
                  <Trash className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>

          {isRenaming && (
            <div className="flex items-center pl-4 py-1">
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
          )}

          {node.type === "folder" && isExpanded && node.children && (
            <div className="ml-4">
             {renderTree(Array.isArray(node.children) ? node.children : Object.values(node.children))}

              {isAdding && (
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
                    placeholder={isAddingItem?.type === "folder" ? "Folder name" : "File name"}
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
      <nav
        className="file-tree"
        role="navigation"
        aria-label="File Tree"
        data-component="FileTree"
      >
        {Array.isArray(fileTree) ? renderTree(fileTree) : null}
        {isAddingItem && isAddingItem.path === "" && (
          <div className="flex items-center py-1" data-component="FileTreeAddRootItem">
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
              aria-label={isAddingItem.type === "folder" ? "New folder name" : "New file name"}
            />
            <Button variant="ghost" size="icon" onClick={confirmAddItem} className="h-7 w-7" aria-label="Save new item">
              <Save className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={cancelAction} className="h-7 w-7" aria-label="Cancel add item">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </nav>
    </div>
  )
}
