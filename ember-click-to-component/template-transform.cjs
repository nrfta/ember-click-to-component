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
// offset. Glimmer locations are relative to the template string it was given:
// for an .hbs file that is the whole file (no offset), but for template-tag
// files (.gjs/.gts) content-tag hands over only the (trimmed) text between
// <template> and </template>, and its JS output does not keep the original
// line numbers either. So find that text in the file on disk. Returns null
// (no offset) when the file cannot be read or the text is not found in it. If
// the same template text occurs more than once, the first occurrence wins.
function templateOffset(filename, contents) {
  if (typeof contents !== 'string' || contents.length === 0) return null;
  let source;
  try {
    source = fs.readFileSync(filename, 'utf8');
  } catch {
    return null;
  }
  const index = source.indexOf(contents);
  if (index <= 0) return null;
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
          let line = start.line;
          let column = start.column;
          if (offset) {
            // Only the template's first line shares a file line with the text
            // before it, so only that line gets the column offset.
            if (line === 1) column += offset.column;
            line += offset.line;
          }

          const { builders: b } = env.syntax;
          node.attributes.unshift(
            b.attr(attribute, b.text(`${filename}:${line}:${column + 1}`)),
          );
        },
      },
    };
  };
};
