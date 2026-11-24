import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preprocess, print } from '@glimmer/syntax';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const clickToComponentTransform =
  require('../template-transform.cjs') as (options?: {
    enabled?: boolean;
    attribute?: string;
  }) => (env: { filename?: string; contents?: string }) => unknown;

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

// Template-tag files (.gjs/.gts): content-tag hands
// babel-plugin-ember-template-compilation only the (trimmed) text between
// <template> and </template>, so Glimmer locations are relative to that
// block. The transform must report lines/columns of the real file.
const GJS_SOURCE = [
  "import Component from '@glimmer/component';", // 1
  '', // 2
  'export default class Greeting extends Component {', // 3
  '  <template>', // 4
  '    <section>', // 5: <section> at column 5
  '      <p>hi</p>', // 6: <p> at column 7
  '    </section>', // 7
  '  </template>', // 8
  '}', // 9
  '', // 10
  'export const Other = <template><span>x</span></template>;', // 11: <span> at column 32
  '',
].join('\n');

describe('template transform in template-tag files', () => {
  let dir: string;
  let gjsFile: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ctc-transform-'));
    gjsFile = join(dir, 'greeting.gjs');
    writeFileSync(gjsFile, GJS_SOURCE);
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function compileBlock(contents: string, filename = gjsFile): string {
    const plugin = clickToComponentTransform();
    const ast = preprocess(contents, {
      mode: 'codemod',
      meta: { moduleName: filename },
      plugins: {
        ast: [(env: object) => plugin({ ...env, filename, contents }) as never],
      },
    } as never);
    return print(ast);
  }

  it('reports file lines/columns for a trimmed class-body template', () => {
    const out = compileBlock('<section>\n      <p>hi</p>\n    </section>');
    expect(out).toContain(`<section data-ctc-source="${gjsFile}:5:5"`);
    expect(out).toContain(`<p data-ctc-source="${gjsFile}:6:7"`);
  });

  it('reports file lines/columns for an untrimmed template block', () => {
    const out = compileBlock(
      '\n    <section>\n      <p>hi</p>\n    </section>\n  ',
    );
    expect(out).toContain(`<section data-ctc-source="${gjsFile}:5:5"`);
    expect(out).toContain(`<p data-ctc-source="${gjsFile}:6:7"`);
  });

  it('offsets the column of a template that starts mid-line', () => {
    const out = compileBlock('<span>x</span>');
    expect(out).toContain(`<span data-ctc-source="${gjsFile}:11:32"`);
  });

  it('does not annotate when the block is not in the file', () => {
    const out = compileBlock('<div></div>');
    expect(out).toBe('<div></div>');
  });

  it('does not annotate when the file is unreadable', () => {
    const missing = join(dir, 'missing.gjs');
    const out = compileBlock('<span>x</span>', missing);
    expect(out).toBe('<span>x</span>');
  });

  it('does not annotate when the template text occurs more than once', () => {
    const dupFile = join(dir, 'dup.gjs');
    writeFileSync(
      dupFile,
      [
        'export const A = <template><b>same</b></template>;',
        'export const B = <template><b>same</b></template>;',
        '',
      ].join('\n'),
    );
    const out = compileBlock('<b>same</b>', dupFile);
    expect(out).toBe('<b>same</b>');
  });

  it('annotates .hbs templates with their own locations without reading the file', () => {
    // This .hbs file does not exist: no read is needed, the template is the file.
    const hbsFile = join(dir, 'not-on-disk.hbs');
    const out = compileBlock('\n  <div></div>', hbsFile);
    expect(out).toContain(`<div data-ctc-source="${hbsFile}:2:3"`);
  });

  // JS template literals normalise CRLF to LF, so for a CRLF file on disk the
  // pipeline hands over LF-only contents.
  it('reports file lines/columns for a CRLF file given LF-normalised contents', () => {
    const crlfFile = join(dir, 'crlf.gjs');
    writeFileSync(crlfFile, GJS_SOURCE.replace(/\n/g, '\r\n'));
    const out = compileBlock(
      '<section>\n      <p>hi</p>\n    </section>',
      crlfFile,
    );
    expect(out).toContain(`<section data-ctc-source="${crlfFile}:5:5"`);
    expect(out).toContain(`<p data-ctc-source="${crlfFile}:6:7"`);
  });

  // content-tag strips the template's common indentation from every line
  // after the first, so the text it hands over is not a substring of the file.
  it('reports file lines/columns for a template with its common indent stripped', () => {
    const indentedFile = join(dir, 'indented.gjs');
    writeFileSync(
      indentedFile,
      [
        'export default class A {',
        '  <template>',
        '    <section>',
        '      <p>hi</p>',
        '',
        '      <b>x</b>',
        '    </section>',
        '  </template>',
        '}',
        '',
      ].join('\n'),
    );
    const out = compileBlock(
      '<section>\n  <p>hi</p>\n\n  <b>x</b>\n</section>',
      indentedFile,
    );
    expect(out).toContain(`<section data-ctc-source="${indentedFile}:3:5"`);
    expect(out).toContain(`<p data-ctc-source="${indentedFile}:4:7"`);
    expect(out).toContain(`<b data-ctc-source="${indentedFile}:6:7"`);
  });

  it('does not annotate ambiguous indent-stripped template text', () => {
    const dupFile = join(dir, 'indented-dup.gjs');
    const block = [
      '  <template>',
      '    <i>a</i>',
      '    <i>b</i>',
      '  </template>',
    ];
    writeFileSync(dupFile, [...block, ...block, ''].join('\n'));
    const out = compileBlock('<i>a</i>\n<i>b</i>', dupFile);
    expect(out).toBe('<i>a</i>\n<i>b</i>');
  });

  it('does not annotate ambiguous template text in a CRLF file', () => {
    const crlfDup = join(dir, 'crlf-dup.gjs');
    writeFileSync(
      crlfDup,
      [
        'export const A = <template><i>a</i>',
        '<i>b</i></template>;',
        'export const B = <template><i>a</i>',
        '<i>b</i></template>;',
        '',
      ].join('\r\n'),
    );
    const out = compileBlock('<i>a</i>\n<i>b</i>', crlfDup);
    expect(out).toBe('<i>a</i>\n<i>b</i>');
  });
});
