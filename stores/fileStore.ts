// stores/fileStore.ts
import { create } from 'zustand';
import { toast } from 'sonner';

export interface FileNode {
  path: string;
  content?: string;
  type: 'file' | 'folder';
  children?: Record<string, FileNode>;
}

export type ProjectFileStructure = Record<string, Pick<FileNode, 'content' | 'type'>>;

// Define the state structure
interface FileStoreStateValues {
  files: ProjectFileStructure;
}

// Define the actions
interface FileStoreActions {
  createFileOrFolder: (path: string, type: 'file' | 'folder', content?: string) => void;
  updateFileContent: (path: string, newContent: string) => void;
  deleteFileOrFolder: (path: string) => void;
  renameFileOrFolder: (oldPath: string, newPath: string) => void;
  resetStore: () => void;
}

// Combine state and actions for the store type
export type FileStore = FileStoreStateValues & FileStoreActions;

// Define the initial state
const initialFileStoreState: FileStoreStateValues = {
  files: {},
};

export const useFileStore = create<FileStore>(
    (set, get) => ({
      ...initialFileStoreState,
  
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
              toast.error(`Cannot create folder structure, ${currentPath} is a file.`);
              return { files: state.files };
            }
          }
          return { files: newFiles };
        });
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
            newFiles[path] = { type: 'file', content: newContent };
            const parts = path.split('/');
            let currentParentPath = '';
            for (let i = 0; i < parts.length - 1; i++) {
              currentParentPath = currentParentPath ? `${currentParentPath}/${parts[i]}` : parts[i];
              if (!newFiles[currentParentPath]) {
                newFiles[currentParentPath] = { type: 'folder' };
              } else if (newFiles[currentParentPath].type === 'file') {
                toast.error(`Cannot update file, parent path ${currentParentPath} is a file.`);
                return { files: state.files };
              }
            }
            if (!state.files[path]) {
                 toast.success(`📄 File "${path.split('/').pop() || path}" created with new content.`);
            }
            return { files: newFiles };
          }
          newFiles[path] = { ...newFiles[path], content: newContent };
          return { files: newFiles };
        });
      },
  
      deleteFileOrFolder: (path) => {
        let itemType: 'file' | 'folder' | undefined;
        const itemName: string = path.split('/').pop() || path;
        const originalFiles = get().files;

        set((state) => {
          const newFiles = { ...state.files };
          itemType = newFiles[path]?.type;

          if (itemType === 'file') {
            delete newFiles[path];
          } else if (itemType === 'folder') {
            Object.keys(newFiles).forEach(p => {
              if (p.startsWith(path + '/') || p === path) {
                delete newFiles[p];
              }
            });
          } else {
            // Corrected: Used toast.info instead of toast.warn
            toast.info(`Item "${itemName}" not found for deletion.`);
            return { files: state.files };
          }
          return { files: newFiles };
        });

        if (itemType && originalFiles[path]) {
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
          if (!entry) {
            toast.error(`Item "${oldName}" not found for renaming.`);
            return { files: state.files };
          }

          itemType = entry.type;

          if (newFiles[newPath]) {
            toast.error(`⚠️ Rename failed: "${newName}" already exists.`);
            return { files: state.files };
          }
          
          delete newFiles[oldPath];
          newFiles[newPath] = entry;

          if (entry.type === 'folder') {
            // Iterate over a copy of keys from original state.files to avoid issues with modification during iteration
            const originalPaths = Object.keys(state.files);
            originalPaths.forEach(p => {
              if (p.startsWith(oldPath + '/')) {
                const relativePath = p.substring(oldPath.length);
                const updatedChildPath = newPath + relativePath;
                // Check if the child actually exists in the 'newFiles' before trying to move it
                // This is important if 'newFiles' was modified in earlier iterations or if 'p' refers to the old folder itself
                if (newFiles[p]) { 
                    newFiles[updatedChildPath] = newFiles[p]; // Assign the entry
                    if (p !== updatedChildPath) { // Avoid deleting if old and new path are the same (should not happen here)
                        delete newFiles[p]; // Delete the old entry
                    }
                }
              }
            });
          }
          return { files: newFiles };
        });

        if (itemType) {
            toast.success(`${itemType === 'folder' ? '📁 Folder' : '📄 File'} "${oldName}" renamed to "${newName}"`);
        }
      },

      resetStore: () => {
        set(initialFileStoreState);
        toast.info("Project files cleared.");
      },
    })
  );
  
export function buildFileTree(files: ProjectFileStructure): FileNode[] {
  const rootNodes: FileNode[] = [];
  const map: Record<string, FileNode> = {};
  const sortedPaths = Object.keys(files).sort((a, b) => {
    const aParts = a.split('/').length;
    const bParts = b.split('/').length;
    if (aParts !== bParts) {
        return aParts - bParts;
    }
    return a.localeCompare(b);
  });

  for (const path of sortedPaths) {
    const parts = path.split('/');
    const nodeName = parts[parts.length - 1];
    const fileData = files[path];

    if (!fileData) continue; 

    const newNode: FileNode = {
      path,
      type: fileData.type,
      content: fileData.content,
      children: fileData.type === 'folder' ? {} : undefined,
    };
    map[path] = newNode;

    if (parts.length === 1) {
      if (!rootNodes.find(rn => rn.path === newNode.path)) {
        rootNodes.push(newNode);
      }
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parentNode = map[parentPath];
      if (parentNode && parentNode.type === 'folder' && parentNode.children) {
        parentNode.children[nodeName] = newNode;
      } else {
        if (!rootNodes.find(rn => rn.path === newNode.path)) {
          rootNodes.push(newNode);
        }
      }
    }
  }
  return rootNodes;
}