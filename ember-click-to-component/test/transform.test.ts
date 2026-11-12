import { createRequire } from 'node:module';
import { preprocess, print } from '@glimmer/syntax';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const clickToComponentTransform = require('../template-transform.cjs') as (
  options?: { enabled?: boolean; attribute?: string },
) => (env: { filename?: string }) => unknown;

const FILE = '/proj/app/a.hbs';

function compile(
  src: string,
  options?: { enabled?: boolean; attribute?: string },
  filename: string | null = FILE,
): string {
  const plugin = clickToComponentTransform(options);
  const ast = preprocess(src, {
    mode: 'codemod',
    ...(filename ? { meta: { moduleName: filename }, filename } : {}),
    plugins: {
      ast: [
        (env: object) =>
          plugin({ ...env, ...(filename ? { filename } : {}) }) as never,
      ],
    },
  } as never);
  return print(ast);
}

describe('template transform', () => {
  it('annotates a div with file:line:col (1-based column)', () => {
    expect(compile('<div></div>')).toBe(
      `<div data-ctc-source="${FILE}:1:1"></div>`,
    );
  });

  it('reports the line and column of an indented element', () => {
    const out = compile('\n\n    <div></div>');
    expect(out).toContain(`data-ctc-source="${FILE}:3:5"`);
  });

  it.each([
    '<Foo />',
    '<this.foo />',
    '<@arg />',
    '<Foo::Bar />',
    '<:header></:header>',
  ])('does not annotate %s', (src) => {
    expect(compile(src)).not.toContain('data-ctc-source');
  });

  it.each(['<foreignObject></foreignObject>', '<svg></svg>'])(
    'annotates %s',
    (src) => {
      expect(compile(src)).toContain('data-ctc-source=');
    },
  );

  it('keeps a pre-existing data-ctc-source attribute exactly once', () => {
    const out = compile('<div data-ctc-source="x"></div>');
    expect(out.match(/data-ctc-source=/g)).toHaveLength(1);
    expect(out).toContain('data-ctc-source="x"');
  });

  it('is a no-op when enabled is false', () => {
    const src = '<div class="a"></div>';
    expect(compile(src, { enabled: false })).toBe(src);
  });

  it('supports a custom attribute name', () => {
    const out = compile('<div></div>', { attribute: 'data-src' });
    expect(out).toBe(`<div data-src="${FILE}:1:1"></div>`);
  });

  it('does not throw and emits nothing without a filename', () => {
    let out = '';
    expect(() => {
      out = compile('<div></div>', undefined, null);
    }).not.toThrow();
    expect(out).toBe('<div></div>');
  });

  it('keeps ...attributes and modifiers, with the new attribute first', () => {
    const out = compile('<div ...attributes {{on "click" this.go}}></div>');
    expect(out).toBe(
      `<div data-ctc-source="${FILE}:1:1" ...attributes {{on "click" this.go}}></div>`,
    );
  });
});
