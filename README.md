# ember-click-to-component

Option+Click any element in your running Ember app and jump straight to the
template that rendered it, at the exact line and column, in your editor.

An Ember take on
[click-to-react-component](https://github.com/ericclemmons/click-to-component).

- **Option+Click** (Alt+Click on Windows and Linux) opens the nearest template
  element in VS Code, VS Code Insiders or Cursor.
- **Option+Right-click** lists every annotated ancestor, so you can pick the
  wrapper `<div>` three levels up instead of the `<span>` you clicked.
- **Zero cost in production.** The build-time transform and the browser runtime
  are both left out of production builds, and there is a one-line check to prove
  it ([details](#keeping-it-out-of-production)).

It works with `.hbs`, `.gjs` and `.gts` templates.

## Contents

- [How it works](#how-it-works)
- [Compatibility](#compatibility)
- [Installation](#installation)
- [Setup walkthrough](#setup-walkthrough)
  - [1. Register the template transform](#1-register-the-template-transform)
  - [2. Set `EMBER_ENV` from Vite's mode](#2-set-ember_env-from-vites-mode)
  - [3. Start the runtime](#3-start-the-runtime)
  - [4. Restart and verify](#4-restart-and-verify)
- [Using it](#using-it)
- [Options](#options)
- [Choosing and customizing your editor](#choosing-and-customizing-your-editor)
- [Tests and production builds](#tests-and-production-builds)
- [Troubleshooting](#troubleshooting)
- [Caveats](#caveats)
- [Contributing](#contributing)
- [License](#license)

## How it works

There are two small parts, and they meet at one DOM attribute.

1. **A template transform (build time).** It runs inside
   `babel-plugin-ember-template-compilation` and adds
   `data-ctc-source="<absolute path>:<line>:<column>"` to every plain HTML or
   SVG element in your templates. Component invocations (`<Foo />`,
   `<this.foo />`, `<@arg />`, `<Foo::Bar />`) and named blocks are left alone,
   because they don't produce an element of their own.
2. **A runtime (browser).** It listens for Option+Click and Option+Right-click,
   walks up from the clicked element to the nearest one carrying the attribute,
   and opens `vscode://file/<path>:<line>:<column>` (or the Cursor / Insiders
   equivalent).

So a template like this:

```hbs
{{! app/templates/profile.hbs }}
<section class='profile'>
  <h1>{{@model.name}}</h1>
</section>
```

renders in development as:

```html
<section
  data-ctc-source="/Users/you/my-app/app/templates/profile.hbs:2:1"
  class="profile"
>
  <h1 data-ctc-source="/Users/you/my-app/app/templates/profile.hbs:3:3">…</h1>
</section>
```

## Compatibility

- **Ember 5 or newer.**
- **Embroider with Vite** (`@embroider/vite`). This is the default build for new
  Ember apps, and it includes apps that still have an `ember-cli-build.js` and
  use `compatBuild` from `@embroider/compat`. Classic (non-Embroider) builds are
  not supported.
- Templates in `.hbs` files and in `.gjs` / `.gts` (`<template>`) files.
- The transform relies on the file path (`env.filename`) and template text
  (`env.contents`) that `babel-plugin-ember-template-compilation` supplies. It
  is verified with 4.0.1.
- An editor that registers a URL scheme: VS Code, VS Code Insiders or Cursor out
  of the box, or anything else through the [`open` option](#choosing-and-customizing-your-editor).

## Installation

Install it as a development dependency. It is never needed in production.

```sh
# pnpm
pnpm add -D ember-click-to-component

# npm
npm install --save-dev ember-click-to-component

# yarn
yarn add -D ember-click-to-component
```

## Setup walkthrough

You will touch three files: `babel.config.mjs`, `vite.config.mjs` and
`app/app.ts` (or `app/app.js`). The whole setup takes a couple of minutes.

> **Quick check of your starting point.** Your app should already have a
> `vite.config.mjs` that uses `@embroider/vite`, and a `babel.config.mjs` (or
> `.cjs`) that configures `babel-plugin-ember-template-compilation`. If you
> generated the app with a recent `ember new`, it does.

### 1. Register the template transform

Open your Babel config and find the `babel-plugin-ember-template-compilation`
entry. Add the click-to-component transform to its `transforms` list, but only
when you are not building for production.

The transform is a CommonJS module, so an ESM config (`babel.config.mjs`) loads
it with `createRequire`:

```js
// babel.config.mjs
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  babelCompatSupport,
  templateCompatSupport,
} from '@embroider/compat/babel';

const require = createRequire(import.meta.url);
const clickToComponentTransform = require('ember-click-to-component/template-transform');

// Annotate everywhere except production builds. Step 2 explains where
// EMBER_ENV comes from.
const isDevelopment = process.env.EMBER_ENV === 'development';

export default {
  plugins: [
    // ...your other plugins (typescript, decorator-transforms, and so on)
    [
      'babel-plugin-ember-template-compilation',
      {
        enableLegacyModules: [
          'ember-cli-htmlbars',
          'ember-cli-htmlbars-inline-precompile',
          'htmlbars-inline-precompile',
        ],
        transforms: [
          ...templateCompatSupport(),
          // Add this line:
          ...(isDevelopment ? [clickToComponentTransform()] : []),
        ],
      },
    ],
    // ...
    ...babelCompatSupport(),
  ],
};
```

The three lines that matter are the `createRequire`/`require` pair, the
`isDevelopment` constant, and the conditional spread inside `transforms`.

In a CommonJS config (`babel.config.cjs`) skip `createRequire` and call
`require` directly:

```js
const clickToComponentTransform = require('ember-click-to-component/template-transform');
```

### 2. Set `EMBER_ENV` from Vite's mode

The Babel config in step 1 reads `process.env.EMBER_ENV`. ember-cli sets that
variable, but a Vite app does not get it from Vite, and `NODE_ENV` is
`production` for every `vite build`, so set it yourself from Vite's mode:

```js
// vite.config.mjs
import { defineConfig } from 'vite';
import { extensions, classicEmberSupport, ember } from '@embroider/vite';
import { babel } from '@rollup/plugin-babel';

export default defineConfig(({ mode }) => {
  process.env.EMBER_ENV ??=
    mode === 'production' ? 'production' : 'development';

  return {
    plugins: [
      classicEmberSupport(),
      ember(),
      babel({
        babelHelpers: 'runtime',
        extensions,
      }),
    ],
  };
});
```

The part to add is the `({ mode }) =>` wrapper and the `process.env.EMBER_ENV`
assignment. Now every Vite mode other than `production` (for example
`vite --mode staging`) turns the annotations on, and an `EMBER_ENV` you export
in your shell still wins because of `??=`.

If your `vite.config.mjs` currently passes a plain object to `defineConfig`,
turn it into a function that returns that same object, as shown above.

### 3. Start the runtime

Start the runtime in your application entry file, guarded by a build-time macro
so production builds drop it entirely, and so test runs (where
`isDevelopingApp()` is also true) do not start it:

```ts
// app/app.ts (or app/app.js)
import { isDevelopingApp, isTesting, macroCondition } from '@embroider/macros';
import { startClickToComponent } from 'ember-click-to-component';

if (macroCondition(isDevelopingApp() && !isTesting())) {
  startClickToComponent();
}
```

Put it anywhere at the top level of the file, for example just after your
`loadInitializers(...)` call. `@embroider/macros` is already a dependency of
every Embroider app.

`startClickToComponent()` returns a function that removes its listeners and
styles again. Calling it a second time replaces the running instance, so hot
reloads do not stack listeners.

### 4. Restart and verify

Restart your dev server. **A restart is required**: Babel loads
`babel.config.mjs` once when the server starts, so changes to it (and to
`vite.config.mjs`) are not picked up by a running server.

```sh
pnpm start   # or: npm start / yarn start
```

Open the app in your browser and run these three checks:

1. **Annotations are in the DOM.** Inspect any element that comes from one of
   your templates: it should carry `data-ctc-source="…:line:col"`. This should
   print a number above zero in the console:

   ```js
   document.querySelectorAll('[data-ctc-source]').length;
   ```

2. **The runtime is listening.** Hold Option (Alt) and move the mouse over the
   page. The element under the cursor gets a pink outline.
3. **It opens your editor.** Option+Click an element. Your browser asks to open
   your editor (accept, and tick "always allow"), and the editor jumps to the
   template line.

If a check fails, see [Troubleshooting](#troubleshooting).

## Using it

- **Option+Click** (Alt+Click) opens the nearest element carrying the
  attribute, starting at the clicked element and walking up. A click without
  Alt, or an Alt+Click with no annotated element, is left alone.
- **Hover highlight.** While Alt is held, the element that would open is
  outlined.
- **Option+Right-click** (Alt+Right-click) opens a menu listing every annotated
  ancestor from the clicked element up to `<body>`. Consecutive entries with the
  same location are merged. Choose one with the mouse, or with the arrow keys
  and Enter. Escape or a click outside closes it. The menu is clamped to the
  viewport, so it stays usable near the edges.

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

## Choosing and customizing your editor

Pick one of the built-in editors:

```ts
startClickToComponent({ editor: 'cursor' });
```

For anything else, use `open`. It receives the same `vscode://`-style URL the
built-in editors would use, so you can log it, rewrite it, or hand it to
another scheme. For example, to share one config across a team where people use
different editors:

```ts
startClickToComponent({
  open(url) {
    const editor = localStorage.getItem('ctc-editor') ?? 'vscode';
    window.location.href = url.replace(/^[a-z-]+:/, `${editor}:`);
  },
});
```

Opening relies on your editor having registered its URL scheme (`vscode://`,
`vscode-insiders://`, `cursor://`), which the installers do for you. If it is
not registered the browser silently does nothing, and the addon cannot detect
that.

## Tests and production builds

### Keeping it out of tests

A Vite app's tests are built with `vite build --mode development`, so with the
setup above the `data-ctc-source` attributes (with absolute file paths) are
present in test runs and can show up in DOM snapshots or `innerHTML`
assertions. The runtime already stays off in tests because of
`!isTesting()`. To keep the attributes out too, register the transform only for
non-test builds, using whatever signal your Vite config has. For example, build
tests with their own mode (`vite build --mode test`) and pass it on in
`vite.config.mjs`:

```js
process.env.EMBER_ENV ??=
  mode === 'production' || mode === 'test' ? mode : 'development';
```

so that `isDevelopment` in the Babel config is false for test builds.

### Keeping it out of production

Production builds should contain neither the attributes nor the runtime. Build
for production and search the output to confirm it:

```sh
pnpm vite build
grep -rl "data-ctc-source" dist || echo "clean: no annotations in dist"
```

You can add that grep to CI so a future config change cannot ship the
annotations (which contain absolute paths from your machine) by accident. This
repository does exactly that for its own test app, in
[`test-app/scripts/check-prod-bundle.mjs`](test-app/scripts/check-prod-bundle.mjs).

## Troubleshooting

| Symptom                                                            | Likely cause and fix                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `data-ctc-source` attributes anywhere                           | The transform isn't registered or `EMBER_ENV` isn't `development`. Check steps 1 and 2, then **restart the dev server**. `console.log(process.env.EMBER_ENV)` in `babel.config.mjs` should print `development`.                                                                                    |
| Attributes on some elements but not on ones from `.gts` files      | In `.gjs`/`.gts` files the transform finds the template in the file on disk, and annotates only when the text occurs exactly once. Two identical `<template>` blocks in one file are skipped on purpose rather than pointing at a wrong line. Make the blocks differ, or move one to its own file. |
| Attributes are present but Option+hover shows no outline           | The runtime isn't running. Check step 3, make sure you aren't in a test run (`isTesting()` is true), and look for errors in the browser console.                                                                                                                                                   |
| Outline shows, but Option+Click does nothing                       | Your editor's URL handler isn't registered, or the browser blocked the prompt. Try pasting `vscode://file/<some path>:1:1` into the address bar. On Linux a window manager may be capturing Alt+Click; see [Caveats](#caveats).                                                                    |
| The editor opens the wrong editor                                  | Set the `editor` option, for example `{ editor: 'cursor' }`.                                                                                                                                                                                                                                       |
| `startClickToComponent` throws about the editor                    | `editor` accepts only `'vscode'`, `'vscode-insiders'` or `'cursor'`. Use `open` for anything else.                                                                                                                                                                                                 |
| Annotations appear in a production build                           | Your `EMBER_ENV` is not `production` for that build. Check step 2, and run the [production check](#keeping-it-out-of-production).                                                                                                                                                                  |
| `Cannot find module 'ember-click-to-component/template-transform'` | The package isn't installed in the app that owns the Babel config. In a monorepo, install it in that app's `package.json`.                                                                                                                                                                         |

## Caveats

- **Linux:** some window managers capture Alt+Click (and Alt+drag) to move
  windows, so the page never sees the click. Change or disable that
  window-manager shortcut to use this addon.
- **Template-tag files:** for `.gjs`/`.gts` (and inline templates in JS/TS) the
  compiler only sees the `<template>` contents, so the transform looks that text
  up in the file on disk to report file lines and columns. It copes with the
  indentation and trimming the compiler applies. If the text cannot be found
  exactly once in the file (for example, two identical `<template>` blocks),
  that template's elements are not annotated rather than pointing at a possibly
  wrong location.
- **Absolute paths:** the attribute holds an absolute path on the machine that
  built the app. That is what lets your editor open the file, and it is why the
  annotations must never ship to production.

## Contributing

See the [Contributing](CONTRIBUTING.md) guide for details.

## License

This project is licensed under the [MIT License](LICENSE.md).
