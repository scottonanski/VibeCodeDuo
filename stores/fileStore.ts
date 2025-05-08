// stores/fileStore.ts
import { create } from 'zustand';
import { toast } from 'sonner'; // Added import

export interface FileNode {
  path: string;
  content?: string;
  type: 'file' | 'folder';
  children?: Record<string, FileNode>;
}

export type ProjectFileStructure = Record<string, Pick<FileNode, 'content' | 'type'>>;

interface FileStoreState {
    files: ProjectFileStructure;
    createFileOrFolder: (path: string, type: 'file' | 'folder', content?: string) => void;
    updateFileContent: (path: string, newContent: string) => void;
    deleteFileOrFolder: (path: string) => void;
    renameFileOrFolder: (oldPath: string, newPath: string) => void;
  }

export const useFileStore = create<FileStoreState>(
    (
      set: (
        partial:
          | Partial<FileStoreState>
          | ((state: FileStoreState) => Partial<FileStoreState>)
      ) => void,
      get: () => FileStoreState
    ) => ({
      files: {},
  
      createFileOrFolder: (path, type, content = '') => {
        set((state) => {
          const newFiles = { ...state.files };
          newFiles[path] = { type, content: type === 'file' ? content : undefined };
  
          const parts = path.split('/');
          let currentPath = '';
          for (let i = 0; i < parts.length - 1; i++) {
            currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
            if (!newFiles[currentPath]) {
              newFiles[currentPath] = { type: 'folder' };
            } else if (newFiles[currentPath].type === 'file') {
              // This scenario (creating a file/folder where a file of the same name as a parent path exists)
              // should ideally be prevented or handled more explicitly.
              // For now, returning original state to prevent data corruption.
              return { files: state.files };
            }
          }
          return { files: newFiles };
        });
        // 🍞 Toast after successful state update
        const itemName = path.split('/').pop() || path;
        if (type === 'folder') {
          toast.success(`📁 Folder "${itemName}" created`);
        } else {
          toast.success(`📄 File "${itemName}" created`);
        }
      },
  
      updateFileContent: (path, newContent) => {
        set((state) => {
          const newFiles = { ...state.files };
          if (!newFiles[path] || newFiles[path].type === 'folder') {
            // If path doesn't exist, or is a folder, create it as a file.
            // This also implicitly creates parent folders if they don't exist.
            newFiles[path] = { type: 'file', content: newContent };
            const parts = path.split('/');
            let currentParentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
              currentParentPath = currentParentPath ? `${currentParentPath}/${parts[i]}` : parts[i];
              if (!newFiles[currentParentPath]) {
                newFiles[currentParentPath] = { type: 'folder' };
              } else if (newFiles[currentParentPath].type === 'file') {
                // Similar to createFileOrFolder, prevent overwriting a file with a folder structure
                return { files: state.files };
              }
            }
            return { files: newFiles };
          }
          // Path exists and is a file, update its content
          return {
            files: {
              ...state.files,
              [path]: { ...state.files[path], content: newContent },
            },
          };
        });
        // Consider adding a toast here if needed, e.g., toast.success(`💾 Content saved: ${path.split('/').pop()}`);
      },
  
      deleteFileOrFolder: (path) => {
        let itemType: 'file' | 'folder' | undefined;
        const itemName: string = path.split('/').pop() || path;
        const originalFiles = get().files; // Get files before modification

        set((state) => {
          const newFiles = { ...state.files };
          itemType = newFiles[path]?.type; // Get type before deletion

          if (itemType === 'file') {
            delete newFiles[path];
          } else if (itemType === 'folder') {
            Object.keys(newFiles).forEach(p => {
              if (p.startsWith(path + '/') || p === path) {
                delete newFiles[p];
              }
            });
          } else {
            // Item not found, no change
            return { files: state.files };
          }
          return { files: newFiles };
        });

        // 🍞 Toast after successful state update, only if something was actually deleted
        if (itemType && originalFiles[path]) { // Check if item existed before trying to toast
          if (itemType === 'folder') {
            toast.info(`🗑️ Folder "${itemName}" deleted`);
          } else if (itemType === 'file') {
            toast.info(`🗑️ File "${itemName}" deleted`);
          }
        }
      },
  
      renameFileOrFolder: (oldPath, newPath) => {
        let itemType: 'file' | 'folder' | undefined;
        const oldName = oldPath.split('/').pop() || oldPath;
        const newName = newPath.split('/').pop() || newPath;

        set((state) => {
          const newFiles = { ...state.files };
          const entry = newFiles[oldPath];
          if (!entry) return { files: state.files }; // Item to rename not found

          itemType = entry.type; // Capture type

          // Prevent renaming if newPath already exists (basic check)
          if (newFiles[newPath]) {
            // Or allow overwrite with more complex logic, for now, prevent.
            console.warn(`Rename failed: Target path "${newPath}" already exists.`);
            toast.error(`⚠️ Rename failed: "${newName}" already exists.`);
            return { files: state.files };
          }
          
          delete newFiles[oldPath];
          newFiles[newPath] = entry;

          if (entry.type === 'folder') {
            // Find all children of the old folder path and update their paths
            Object.keys(state.files).forEach(p => { // Iterate over original state.files to find children
              if (p.startsWith(oldPath + '/')) {
                const relativePath = p.substring(oldPath.length); // e.g., /file.txt or /subfolder/file.txt
                const updatedChildPath = newPath + relativePath;
                if (newFiles[p]) { // Ensure the child exists in current processing copy
                    newFiles[updatedChildPath] = newFiles[p];
                    delete newFiles[p];
                }
              }
            });
          }
          return { files: newFiles };
        });

        // 🍞 Toast after successful state update
        if (itemType) { // Only toast if itemType was determined (i.e., rename was likely successful)
            toast.success(`${itemType === 'folder' ? '📁 Folder' : '📄 File'} "${oldName}" renamed to "${newName}"`);
        }
      },
    })
  );
  
// ... (buildFileTree function remains unchanged)
export function buildFileTree(files: ProjectFileStructure): FileNode[] {
  const rootNodes: FileNode[] = [];
  const map: Record<string, FileNode> = {};
  const sortedPaths = Object.keys(files).sort();

  for (const path of sortedPaths) {
    const parts = path.split('/');
    const nodeName = parts[parts.length - 1];
    const fileData = files[path];

    const newNode: FileNode = {
      path,
      type: fileData.type,
      content: fileData.content,
      children: fileData.type === 'folder' ? {} : undefined,
    };
    map[path] = newNode;

    if (parts.length === 1) {
      rootNodes.push(newNode);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parentNode = map[parentPath];
      if (parentNode?.type === 'folder' && parentNode.children) {
        parentNode.children[nodeName] = newNode;
      } else {
        // This case can happen if parent folders are not explicitly created first in a flat list.
        // Or if a file path implies folders that don't exist as separate entries.
        // For a robust tree, ensure all parent folder paths exist in 'files'.
        // console.warn(`Parent node for ${path} not found or not a folder. Adding as root.`);
        rootNodes.push(newNode);
      }
    }
  }
  return rootNodes;
}