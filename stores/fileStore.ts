// stores/fileStore.ts

import { create } from 'zustand';

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
              return { files: state.files };
            }
          }
          return { files: newFiles };
        });
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
              }
            }
            return { files: newFiles };
          }
          return {
            files: {
              ...state.files,
              [path]: { ...state.files[path], content: newContent },
            },
          };
        });
      },
  
      deleteFileOrFolder: (path) => {
        set((state) => {
          const newFiles = { ...state.files };
          if (newFiles[path]?.type === 'file') {
            delete newFiles[path];
          } else if (newFiles[path]?.type === 'folder') {
            Object.keys(newFiles).forEach(p => {
              if (p.startsWith(path + '/') || p === path) {
                delete newFiles[p];
              }
            });
          }
          return { files: newFiles };
        });
      },
  
      renameFileOrFolder: (oldPath, newPath) => {
        set((state) => {
          const newFiles = { ...state.files };
          const entry = newFiles[oldPath];
          if (!entry) return { files: state.files };
          delete newFiles[oldPath];
          newFiles[newPath] = entry;
          if (entry.type === 'folder') {
            Object.keys(newFiles).forEach(p => {
              if (p.startsWith(oldPath + '/')) {
                const updatedP = p.replace(oldPath, newPath);
                newFiles[updatedP] = newFiles[p];
                delete newFiles[p];
              }
            });
          }
          return { files: newFiles };
        });
      },
    })
  );
  

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
        rootNodes.push(newNode);
      }
    }
  }

  return rootNodes;
}
