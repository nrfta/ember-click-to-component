export type Editor = 'vscode' | 'vscode-insiders' | 'cursor';

export interface SourceLocation {
  path: string;
  line: number;
  column: number;
}

const EDITORS: readonly Editor[] = ['vscode', 'vscode-insiders', 'cursor'];

const SOURCE_RE = /^(.+):(\d+):(\d+)$/;

export function parseSource(value: string): SourceLocation | null {
  const match = SOURCE_RE.exec(value);
  if (!match) return null;
  return {
    path: match[1] as string,
    line: Number(match[2]),
    column: Number(match[3]),
  };
}

export function assertEditor(editor: string): asserts editor is Editor {
  if (!(EDITORS as readonly string[]).includes(editor)) {
    throw new Error(
      `Invalid editor "${editor}". Expected one of: ${EDITORS.join(', ')}.`,
    );
  }
}

export function buildEditorUrl(editor: Editor, loc: SourceLocation): string {
  const normalized = loc.path.replace(/\\/g, '/').replace(/^\//, '');
  const encoded = normalized
    .split('/')
    .map((segment) =>
      /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment),
    )
    .join('/');
  return `${editor}://file/${encoded}:${loc.line}:${loc.column}`;
}
