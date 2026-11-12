'use strict';

// Glimmer AST plugin: annotates plain HTML/SVG elements with
// `<attribute>="<abs-path>:<line>:<col>"` so the runtime can map a DOM node
// back to its template source.

const DEFAULT_ATTRIBUTE = 'data-ctc-source';

// Plain elements start with a lowercase letter and are not paths (`this.foo`,
// `foo.bar`), named args (`@arg`), namespaced components (`Foo::Bar`) or named
// blocks (`:header`).
function isPlainElement(tag) {
  return /^[a-z]/.test(tag) && !/[.@:]/.test(tag);
}

module.exports = function clickToComponentTransform(options) {
  const enabled = !options || options.enabled !== false;
  const attribute = (options && options.attribute) || DEFAULT_ATTRIBUTE;

  return function clickToComponentPlugin(env) {
    // babel-plugin-ember-template-compilation passes the absolute path of the
    // file being compiled as `env.filename`.
    const filename = env && env.filename;

    return {
      name: 'ember-click-to-component',
      visitor: {
        ElementNode(node) {
          if (!enabled || !filename) return;
          if (!isPlainElement(node.tag)) return;
          if (node.attributes.some((attr) => attr.name === attribute)) return;

          const start = node.loc && node.loc.start;
          if (!start || typeof start.line !== 'number') return;

          const { builders: b } = env.syntax;
          node.attributes.unshift(
            b.attr(
              attribute,
              b.text(`${filename}:${start.line}:${start.column + 1}`),
            ),
          );
        },
      },
    };
  };
};
