/**
 * Split sectioned-text on === Title === headers.
 */

export type TextSection = {
  title: string;
  /** Body lines (trimmed, non-empty preserved with blanks for record splits). */
  body: string;
  startLine: number;
};

const HEADER_RE = /^===\s*(.+?)\s*===\s*$/;

export function splitSections(content: string): TextSection[] {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const sections: TextSection[] = [];
  let currentTitle: string | null = null;
  let currentStart = 0;
  let buf: string[] = [];

  const flush = (endLine: number) => {
    if (currentTitle === null) return;
    sections.push({
      title: currentTitle,
      body: buf.join("\n"),
      startLine: currentStart,
    });
    void endLine;
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = HEADER_RE.exec(line);
    if (m) {
      flush(i);
      currentTitle = m[1]!.trim();
      currentStart = i + 1;
      continue;
    }
    if (currentTitle !== null) {
      buf.push(line);
    }
  }
  flush(lines.length);
  return sections;
}
