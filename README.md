# ember-click-to-component

An Ember take on [click-to-react-component](https://github.com/ericclemmons/click-to-component).
In a development build, Alt+Click (Option+Click on macOS) on any rendered
element opens the template that wrote that element in your editor, at the exact
line and column. Alt+Right-click shows a menu of every annotated ancestor so you
can jump to any of them.

It has two parts:

- a **template transform** (build time) that adds
  `data-ctc-source="<absolute path>:<line>:<column>"` to every plain HTML/SVG
  element in your templates (`.hbs`, `.gjs`, `.gts`). Component invocations
  (`<Foo />`, `<this.foo />`, `<@arg />`, `<Foo::Bar />`) and named blocks are
  left alone;
- a **runtime** (browser) that listens for Alt+Click and Alt+Right-click and
  opens an editor URL for the nearest annotated element.

Both should only run in development. Production builds should contain neither
the attributes nor the runtime.

## Compatibility

- Ember.js v4.12 or above
- Embroider or ember-auto-import v2

## Installation

```sh
pnpm add -D ember-click-to-component
```

## Setup

### 1. Register the template transform (development only)

Add the transform to the `transforms` of `babel-plugin-ember-template-compilation`
in your Babel config. The transform is a CommonJS module, so an ESM config
(`babel.config.mjs`) loads it with `createRequire`:

```js
// babel.config.mjs
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const clickToComponentTransform = require('ember-click-to-component/template-transform');

const isDevelopment = process.env.EMBER_ENV === 'development';

export default {
  plugins: [
    [
      'babel-plugin-ember-template-compilation',
      {
        transforms: [
          // ...your other transforms
          ...(isDevelopment ? [clickToComponentTransform()] : []),
        ],
      },
    ],
    // ...
  ],
};
```

In a CommonJS config (`babel.config.cjs`) use `require` directly:

```js
const clickToComponentTransform = require('ember-click-to-component/template-transform');
```

`EMBER_ENV` is set by ember-cli. A Vite app (`@embroider/vite`) does not get it
from Vite, and `NODE_ENV` is `production` for every `vite build`, so set it from
Vite's mode in `vite.config.mjs`:

```js
// vite.config.mjs
export default defineConfig(({ mode }) => {
  process.env.EMBER_ENV ??=
    mode === 'production' ? 'production' : 'development';
  return {
    plugins: [/* ... */],
  };
});
```

### 2. Start the runtime (development only)

In `app/app.ts` (or `app/app.js`), start the runtime behind
`macroCondition(isDevelopingApp())` so production builds drop it:

```ts
import { isDevelopingApp, macroCondition } from '@embroider/macros';
import { startClickToComponent } from 'ember-click-to-component';

if (macroCondition(isDevelopingApp())) {
  startClickToComponent();
}
```

`startClickToComponent()` returns a function that removes its listeners and
styles again.

## Usage

- **Alt+Click** (Option+Click): opens the nearest element carrying the
  attribute, starting at the clicked element and walking up. A click without
  Alt, or an Alt+Click with no annotated element, is left alone.
- **Hover highlight**: while Alt is held, the element that would open is
  outlined.
- **Alt+Right-click** (Option+Right-click): opens a menu listing every annotated
  ancestor from the clicked element up to `<body>` (consecutive entries with
  the same location are merged). Choose one with the mouse, or with the arrow
  keys and Enter; Escape or a click outside closes it.

## Options

### Runtime: `startClickToComponent(options)`

| Option      | Default                     | Description                                                                                                            |
| ----------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `editor`    | `'vscode'`                  | `'vscode'`, `'vscode-insiders'` or `'cursor'`. Opens `<editor>://file/<path>:<line>:<column>`. Any other value throws. |
| `attribute` | `'data-ctc-source'`         | Attribute to read. Must match the transform's `attribute`.                                                             |
| `open`      | sets `window.location.href` | Called with the editor URL instead of navigating to it.                                                                |

### Transform: `clickToComponentTransform(options)`

| Option      | Default             | Description                                               |
| ----------- | ------------------- | --------------------------------------------------------- |
| `enabled`   | `true`              | `false` makes the transform a no-op.                      |
| `attribute` | `'data-ctc-source'` | Attribute to write. Must match the runtime's `attribute`. |

An element that already has the attribute is not annotated again.

## Caveats

- **Linux:** some window managers capture Alt+Click (and Alt+drag) to move
  windows, so the page never sees the click. Change or disable that
  window-manager shortcut to use this addon.
- **Editor URL handler:** opening relies on your editor having registered its
  URL scheme (`vscode://`, `vscode-insiders://`, `cursor://`). If it is not
  registered, the browser silently does nothing; the addon cannot detect this.
- **Template-tag files:** for `.gjs`/`.gts` the transform finds the
  `<template>` contents in the file on disk to report file lines and columns.
  If the same template text appears more than once in a file, the first
  occurrence is reported.

## Contributing

See the [Contributing](CONTRIBUTING.md) guide for details.

## License

This project is licensed under the [MIT License](LICENSE.md).
