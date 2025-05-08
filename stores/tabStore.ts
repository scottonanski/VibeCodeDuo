// stores/tabStore.ts
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { toast } from "sonner"

export interface Tab {
    path: string // example: "src/app/page.tsx"
}

interface TabStore {
    openTabs: Tab[]
    activeTabPath: string | null
    openTab: (path: string) => void
    closeTab: (path: string) => void
    closeTabsInFolder: (folderPath: string) => void
    setActiveTab: (path: string) => void
    isTabOpen: (path: string) => boolean
}

export const useTabStore = create<TabStore>()(
    persist(
        (set, get) => ({
            openTabs: [],
            activeTabPath: null,

            openTab: (path) => {
                let wasAlreadyOpen = false;
                let isNewTab = false;

                set((state) => {
                    const tabs = state.openTabs; // Use state from set for consistency
                    const existingTab = tabs.find((t) => t.path === path);
                    wasAlreadyOpen = existingTab !== undefined;
                    
                    const newTabs = wasAlreadyOpen ? tabs : [...tabs, { path }];
                    if (!wasAlreadyOpen) {
                        isNewTab = true;
                    }
                    return { openTabs: newTabs, activeTabPath: path };
                });

                // 🍞 Toast here, only if it's a newly opened tab
                if (isNewTab) {
                    const filename = path.split('/').pop() || path;
                    toast.info(`🧷 Tab opened: ${filename}`);
                }
            },

            closeTab: (path) => {
                let tabExisted = false;
                set((state) => {
                    tabExisted = state.openTabs.some(t => t.path === path);
                    const tabs = state.openTabs.filter((t) => t.path !== path);
                    const wasActive = state.activeTabPath === path;

                    return {
                        openTabs: tabs,
                        activeTabPath:
                            wasActive && tabs.length > 0
                                ? tabs[tabs.length - 1].path // Fallback to last tab
                                : tabs.length === 0
                                    ? null // No tabs left
                                    : state.activeTabPath, // Keep current active if it wasn't the closed one
                    };
                });
                // 🍞 Toast here, only if the tab actually existed and was closed
                if (tabExisted) {
                    const filename = path.split('/').pop() || path;
                    toast.info(`🚪 Tab closed: ${filename}`);
                }
            },

            closeTabsInFolder: (folderPath: string) => {
                const currentOpenTabs = get().openTabs;
                const normalizedFolder = folderPath.replace(/\/+$/, "");
              
                // console.log("[tabStore] 🗂️ Close tabs in folder:", folderPath);
                // console.log("[tabStore] Normalized path:", normalizedFolder);
                // console.log("[tabStore] Current open tabs:", currentOpenTabs.map(t => t.path));
              
                const tabsToClose = currentOpenTabs.filter((t) =>
                  t.path === normalizedFolder || t.path.startsWith(normalizedFolder + "/")
                );
              
                // console.log("[tabStore] 🧹 Tabs to close:", tabsToClose.map(t => t.path));
              
                if (tabsToClose.length === 0) {
                    // No tabs were related to this folder, so no state change or toast needed for tabs.
                    return; 
                }

                const remainingTabs = currentOpenTabs.filter((t) => !tabsToClose.some(closed => closed.path === t.path));
                const wasActivePath = get().activeTabPath;
                
                let newActivePath = wasActivePath;
                // If the active tab was one of those closed, determine a new active tab
                if (wasActivePath && tabsToClose.some(t => t.path === wasActivePath)) {
                    newActivePath = remainingTabs.length > 0 ? remainingTabs[remainingTabs.length - 1].path : null;
                } else if (!remainingTabs.some(t => t.path === wasActivePath) && remainingTabs.length > 0) {
                    // Active tab wasn't closed, but it's not in remaining (should not happen if logic is correct)
                    // or simply ensure active tab is valid if list changed.
                    newActivePath = remainingTabs[remainingTabs.length - 1].path;
                } else if (remainingTabs.length === 0) {
                    newActivePath = null;
                }
                // If activeTabPath is still valid and present in remainingTabs, it doesn't need to change unless it was closed.

                set({
                  openTabs: remainingTabs,
                  activeTabPath: newActivePath,
                });
              
                // 🍞 Toast (using toast.info for consistency with other "closed" events)
                const folderName = normalizedFolder.split("/").pop() || "folder";
                if (tabsToClose.length === 1) {
                  // Use the actual filename for a single tab closure from folder delete
                  const singleFileName = tabsToClose[0].path.split("/").pop() || tabsToClose[0].path;
                  toast.info(`🚪 Tab closed: ${singleFileName} (from deleted folder "${folderName}")`);
                } else {
                  toast.info(`🚪 Closed ${tabsToClose.length} tabs from folder "${folderName}"`);
                }
            },
              
            setActiveTab: (path) => set({ activeTabPath: path }),

            isTabOpen: (path) => get().openTabs.some((t) => t.path === path),
        }),
        {
            name: "editor-tabs", // persists tab state to localStorage
        }
    )
)