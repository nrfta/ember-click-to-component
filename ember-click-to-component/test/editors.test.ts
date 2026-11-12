import { describe, expect, it } from 'vitest';
import { assertEditor, buildEditorUrl, parseSource } from '../src/editors';

describe('parseSource', () => {
  it('parses a posix path', () => {
    expect(parseSource('/p/a.gjs:12:5')).toEqual({
      path: '/p/a.gjs',
      line: 12,
      column: 5,
    });
  });

  it('parses a Windows path with a drive letter', () => {
    expect(parseSource('C:\\proj\\a.gjs:3:4')).toEqual({
      path: 'C:\\proj\\a.gjs',
      line: 3,
      column: 4,
    });
  });

  it('returns null for malformed values', () => {
    expect(parseSource('garbage')).toBeNull();
    expect(parseSource('/p/a.gjs:x:1')).toBeNull();
  });
});

describe('buildEditorUrl', () => {
  const loc = { path: '/p/a.gjs', line: 12, column: 5 };

  it('builds URLs for each editor', () => {
    expect(buildEditorUrl('vscode', loc)).toBe('vscode://file/p/a.gjs:12:5');
    expect(buildEditorUrl('vscode-insiders', loc)).toBe(
      'vscode-insiders://file/p/a.gjs:12:5',
    );
    expect(buildEditorUrl('cursor', loc)).toBe('cursor://file/p/a.gjs:12:5');
  });

  it('percent-encodes special characters per segment', () => {
    expect(
      buildEditorUrl('vscode', {
        path: '/My Proj/a#b?.gjs',
        line: 1,
        column: 1,
      }),
    ).toBe('vscode://file/My%20Proj/a%23b%3F.gjs:1:1');
  });

  it('percent-encodes unicode', () => {
    expect(
      buildEditorUrl('vscode', { path: '/p/é.gjs', line: 1, column: 1 }),
    ).toBe('vscode://file/p/%C3%A9.gjs:1:1');
  });

  it('keeps a Windows drive letter unencoded and converts backslashes', () => {
    expect(
      buildEditorUrl('vscode', { path: 'C:\\proj\\a.gjs', line: 1, column: 1 }),
    ).toBe('vscode://file/C:/proj/a.gjs:1:1');
  });
});

describe('assertEditor', () => {
  it('throws for unknown editors, naming valid values', () => {
    expect(() => assertEditor('emacs')).toThrow(
      /vscode.*vscode-insiders.*cursor/,
    );
  });

  it('accepts valid editors', () => {
    expect(() => assertEditor('cursor')).not.toThrow();
  });
});
