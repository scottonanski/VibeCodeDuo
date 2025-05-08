// components/ui/editor-tabs.tsx

"use client"

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTabStore } from '@/stores/tabStore'

const getFilename = (path: string): string => path.split('/').pop() || path

interface EditorTabsProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root> {}

const EditorTabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  EditorTabsProps
>(({ className, ...props }, ref) => {
  const { openTabs, activeTabPath, setActiveTab, closeTab } = useTabStore()

  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  const handleCloseTab = (e: React.MouseEvent, path: string) => {
    e.stopPropagation()
    closeTab(path)
  }

  if (!openTabs || openTabs.length === 0) {
    return (
      <div className="flex h-10 items-center border-b px-4 text-sm text-muted-foreground">
        No files open
      </div>
    )
  }

  const currentActiveTabPath = activeTabPath && openTabs.some(t => t.path === activeTabPath)
    ? activeTabPath
    : openTabs[0]?.path || ""

  return (
    <TabsPrimitive.Root
      ref={ref}
      value={currentActiveTabPath}
      onValueChange={handleTabChange}
      className={cn('flex flex-col', className)}
      {...props}
    >
      <TabsPrimitive.List className="flex h-10 shrink-0 items-center border-b bg-muted/30">
        {openTabs.map((tab) => (
          <TabsPrimitive.Trigger
            key={tab.path}
            value={tab.path}
            className={cn(
              'relative flex h-full items-center justify-center whitespace-nowrap px-4 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
              'border-r border-transparent',
              'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
              'hover:bg-muted/50'
            )}
          >
            {getFilename(tab.path)}
            <span
  onClick={(e) => handleCloseTab(e, tab.path)}
  className={cn(
    'ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full p-0.5 text-muted-foreground transition-colors',
    'hover:bg-muted/20 hover:text-foreground',
    'data-[state=active]:text-foreground data-[state=active]:hover:bg-destructive/20 data-[state=active]:hover:text-destructive-foreground'
  )}
  aria-label={`Close tab: ${getFilename(tab.path)}`}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") handleCloseTab(e as any, tab.path)
  }}
>
  <X size={14} />
</span>

          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  )
})
EditorTabs.displayName = "EditorTabs"

export { EditorTabs }
