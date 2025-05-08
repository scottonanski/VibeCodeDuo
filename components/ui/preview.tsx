"use client"

import { useFileStore } from "@/stores/fileStore"

interface PreviewProps {
  filePath: string | null;
}

export default function Preview({ filePath }: PreviewProps) {
  const fileContent = useFileStore((state) =>
    filePath && state.files[filePath]?.type === "file"
      ? state.files[filePath]?.content || ""
      : ""
  );

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        No file selected.
      </div>
    );
  }

  if (!fileContent.trim()) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        File is empty.
      </div>
    );
  }

  if (!filePath.endsWith(".html")) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Preview only available for HTML files.
      </div>
    );
  }

  return (
    <iframe
      srcDoc={fileContent}
      title="Live Preview"
      className="w-full h-full border-none bg-white"
      sandbox="allow-scripts allow-same-origin"
    />
  );
}
