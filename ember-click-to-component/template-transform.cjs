'use strict';

// Glimmer AST plugin: annotates plain HTML/SVG elements with
// `<attribute>="<abs-path>:<line>:<col>"` so the runtime can map a DOM node
// back to its template source.

const fs = require('node:fs');

const DEFAULT_ATTRIBUTE = 'data-ctc-source';

// Plain elements start with a lowercase letter and are not paths (`this.foo`,
// `foo.bar`), named args (`@arg`), namespaced components (`Foo::Bar`) or named
// blocks (`:header`).
function isPlainElement(tag) {
  return /^[a-z]/.test(tag) && !/[.@:]/.test(tag);
}

// Where the template text starts inside the file, as a 0-based line/column
// offset, or null when it cannot be known. Glimmer locations are relative to
// the template string it was given. For an .hbs file that string is the whole
// file, so the offset is 0:0 and the file is not read. For template-tag files
// (.gjs/.gts) and inline templates, content-tag/babel hand over only the
// template text (trimmed of surrounding whitespace by content-tag), and the JS
// they emit does not keep the original line numbers. So find that text in the
// file on disk. If the file cannot be read, or the text does not occur in it
// exactly once, return null: no location beats a wrong one.
function templateOffset(filename, contents) {
  if (filename.endsWith('.hbs')) return { line: 0, column: 0 };
  if (typeof contents !== 'string' || contents.length === 0) return null;
  let source;
  try {
    source = fs.readFileSync(filename, 'utf8');
  } catch {
    return null;
  }
  const index = source.indexOf(contents);
  if (index === -1) return null;
  if (source.indexOf(contents, index + 1) !== -1) return null;
  const lines = source.slice(0, index).split('\n');
  return { line: lines.length - 1, column: lines[lines.length - 1].length };
}

module.exports = function clickToComponentTransform(options) {
  const enabled = !options || options.enabled !== false;
  const attribute = (options && options.attribute) || DEFAULT_ATTRIBUTE;

  return function clickToComponentPlugin(env) {
    // babel-plugin-ember-template-compilation passes the absolute path of the
    // file being compiled as `env.filename` and the template text it is
    // compiling as `env.contents`.
    const filename = env && env.filename;
    let offset;

    return {
      name: 'ember-click-to-component',
      visitor: {
        ElementNode(node) {
          if (!enabled || !filename) return;
          if (!isPlainElement(node.tag)) return;
          if (node.attributes.some((attr) => attr.name === attribute)) return;

          const start = node.loc && node.loc.start;
          if (!start || typeof start.line !== 'number') return;

          if (offset === undefined) {
            offset = templateOffset(filename, env.contents);
          }
          // Location unknown: leave this template's elements unannotated.
          if (!offset) return;

          // Only the template's first line shares a file line with the text
          // before it, so only that line gets the column offset.
          const line = start.line + offset.line;
          const column =
            start.line === 1 ? start.column + offset.column : start.column;

          const { builders: b } = env.syntax;
          node.attributes.unshift(
            b.attr(attribute, b.text(`${filename}:${line}:${column + 1}`)),
          );
        },
      },
    };
  };
};
