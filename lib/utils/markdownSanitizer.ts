// lib/utils/markdownSanitizer.ts

export const stripFencedCodeBlocks = (text: string): string =>
    text.replace(/```[\w]*\n[\s\S]*?\n```/g, '\n[Code moved to Project Files]\n');
  