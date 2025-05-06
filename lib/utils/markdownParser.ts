// lib/utils/markdownParser.ts

export function extractCodeFromMarkdown(markdown: string, language?: string): string | null {
    const regex = /```(\w+)?\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(markdown)) !== null) {
      const lang = match[1]?.trim().toLowerCase();
      const code = match[2].trim();
      if (!language || lang === language.toLowerCase()) {
        return code;
      }
    }
    return null;
  }
  