import { marked } from 'marked';

/**
 * Converts markdown text to HTML that TipTap can parse
 * Handles common markdown patterns from LLM responses
 */
export function markdownToHtml(markdown: string): string {
  // Configure marked for clean output
  marked.setOptions({
    gfm: true, // GitHub Flavored Markdown
    breaks: true, // Line breaks as <br>
  });

  // Parse markdown to HTML
  const html = marked.parse(markdown, { async: false }) as string;
  
  return html;
}

/**
 * Detects if text contains markdown formatting
 */
export function containsMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s+.+$/m,           // Headers
    /\*\*.+\*\*/,               // Bold
    /\*.+\*/,                   // Italic
    /^\s*[-*+]\s+.+$/m,         // Unordered lists
    /^\s*\d+\.\s+.+$/m,         // Ordered lists
    /^\s*>\s+.+$/m,             // Blockquotes
    /`[^`]+`/,                  // Inline code
    /```[\s\S]*?```/,           // Code blocks
    /\[.+\]\(.+\)/,             // Links
    /^\s*---\s*$/m,             // Horizontal rules
    /^\s*\*\*\*\s*$/m,          // Horizontal rules alt
    /^\s*- \[[ x]\]/m,          // Task lists
  ];

  return markdownPatterns.some(pattern => pattern.test(text));
}

/**
 * Cleans up markdown that might have extra formatting
 */
export function cleanMarkdown(text: string): string {
  // Remove any leading/trailing whitespace
  let cleaned = text.trim();
  
  // Remove markdown code block wrappers if the entire response is wrapped
  if (cleaned.startsWith('```') && cleaned.endsWith('```')) {
    const lines = cleaned.split('\n');
    if (lines.length >= 2) {
      // Remove first and last lines (the ```)
      cleaned = lines.slice(1, -1).join('\n');
    }
  }
  
  return cleaned;
}

