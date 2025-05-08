// stores/uiStore.ts

// This store is used to manage the active view tab (editor or preview)
// It is used in the app/page.tsx file to control which tab is active

import { create } from "zustand"

type ViewTab = "editor" | "preview"

interface UIStore {
  activeViewTab: ViewTab
  setActiveViewTab: (tab: ViewTab) => void
}

export const useUIStore = create<UIStore>((set) => ({
  activeViewTab: "editor",
  setActiveViewTab: (tab) => set({ activeViewTab: tab }),
}))
