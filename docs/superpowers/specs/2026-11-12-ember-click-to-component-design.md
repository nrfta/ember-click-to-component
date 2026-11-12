# ember-click-to-component: Design

Date: 2026-11-12
Status: Draft, awaiting review

## Goal

An Ember equivalent of [click-to-react-component](https://github.com/ericclemmons/click-to-component). In a development build, Option+Click on any rendered element opens the template that authored that element, at the exact line and column, in the developer's editor. Option+Right-click shows a menu of every annotated ancestor so a developer can jump to any of them.

## Decisions made

| Question | Decision |
|---|---|
| Ember versions | Modern only: Ember 5+, Embroider/Vite, `.hbs` and `.gjs`/`.gts`. No classic broccoli builds. |
| Click target | Exact template file, line and column where the element was written. |
| Editors | VS Code family: `vscode`, `vscode-insiders`, `cursor`, selected with an `editor` option. |
| Source-mapping approach | Build-time `data-` attribute added by a template AST transform (chosen over a build-time modifier and a runtime-only render-tree approach). |

## Non-goals

- Classic ember-cli builds and Ember versions before 5.
- JetBrains or custom-URL editors.
- A component-level chain (render tree). The right-click menu lists annotated element ancestors, not components.
- Any production behavior. Production and test builds contain neither the attribute nor the overlay.

## Architecture

A v2 (Embroider-native) addon with two independent parts that communicate only through a DOM attribute.

1. **Template transform** (build time). A Glimmer AST plugin adds `data-ctc-source="<abs-path>:<line>:<col>"` to plain HTML/SVG elements.
2. **Runtime overlay** (browser). Listens for Option+Click and Option+Right-click, finds the nearest annotated ancestor, and opens an editor URL.

### Host app wiring

- `babel.config.cjs` registers the transform with `babel-plugin-ember-template-compilation`, in development only. This single mechanism covers both `.hbs` and `.gjs`/`.gts`, because `.gjs` compiles to template calls before reaching that plugin.
- `app/app.js` calls `startClickToComponent({ editor })` inside `macroCondition(isDevelopingApp())` from `@embroider/macros`, so production builds drop the call and the module.

## Template transform

**Annotated:** plain HTML and SVG elements (lowercase tags such as `div`, `button`, `svg`).

**Skipped:** component invocations (`<Foo />`, `<this.foo />`, `<@arg />`), named blocks (`<:header>`), and any element that already has the attribute.

**Attribute:** `data-ctc-source="/abs/path/app/components/foo.gjs:12:5"`, added as the first attribute node so it never interferes with `...attributes` or modifiers.

**Path:** read from the file name the template compiler supplies, written as an absolute path. Because the attribute is development-only, exposing a local path in the DOM is acceptable, and the host app needs no project-root configuration.

**Position:** line from the node's `loc.start.line`; column is `loc.start.column + 1` (Glimmer is 0-based, editors are 1-based). For `.gjs`/`.gts`, if the pipeline reports positions relative to the embedded template, the transform adds the template's start offset so lines are file-accurate.

**Component invocations resolve correctly without being annotated.** A click lands on the nearest rendered element. If it lives in a component's own template, the click opens that template. If it was written in a block passed to the component, the click opens the caller's template.

**Options:**
- `enabled` (default `true`). The host controls activation by registering the plugin only in development.
- `attribute` (default `data-ctc-source`).

## Runtime overlay

**Start:** `startClickToComponent({ editor?: 'vscode' | 'vscode-insiders' | 'cursor' })`, default `vscode`. It returns a teardown function. It is plain TypeScript with no dependency on Ember's container. An unknown `editor` value throws at startup.

**Option+Click:** a capture-phase `click` listener on `document` checks `event.altKey`, then `event.target.closest('[data-ctc-source]')`.
- No annotated ancestor: do nothing and do not swallow the click.
- Match found: `preventDefault()` and `stopPropagation()` so app handlers do not fire, then navigate to the editor URL.

**Hover highlight:** while Alt is held, the element that would open gets a thin outline. One injected `<style>` rule is keyed to a root class toggled on `keydown`/`keyup`.

**Option+Right-click menu:** a `contextmenu` listener, gated on `altKey`, collects every `data-ctc-source` ancestor from the target to `<body>` and merges consecutive entries with identical locations.
- Each row shows `foo.gjs:12:5` and the element (for example `<div.card>`).
- Arrow keys move, Enter opens, Escape closes, and an outside click closes.
- The menu is plain DOM with scoped styles, not an Ember component, so the transform cannot annotate it and app CSS cannot break it.

**Editor URLs** (path, line, column from the attribute):
- `vscode://file/<path>:<line>:<col>`
- `vscode-insiders://file/<path>:<line>:<col>`
- `cursor://file/<path>:<line>:<col>`

**Platform note (README only):** some Linux window managers capture Alt+Click.

## Error handling

- If the compiler supplies no file name, the transform skips annotation instead of throwing, so it never breaks a build.
- If the editor's URL handler is not registered, the browser does nothing and this cannot be detected. The README states it.

## Testing

**Transform unit tests** (compile fixture templates through the plugin):
- A plain `<div>` is annotated with the correct line and 1-based column.
- Component invocations and named blocks are skipped.
- An element already carrying the attribute is not annotated twice.
- `enabled: false` leaves output unchanged.
- A custom attribute name is honored.
- A `.gjs` fixture asserts file-accurate line numbers. This verifies the offset question above and is the first task of implementation.

**Runtime unit tests** (vitest with a DOM environment and an injectable `open` function so nothing navigates):
- Alt+Click opens the correct URL for each editor.
- A click without Alt is untouched and not `preventDefault`ed.
- Alt+Click with no annotated ancestor does nothing.
- Right-click menu: ancestors collected and merged; arrow keys, Enter and Escape work; an outside click closes it.
- Teardown removes the listeners and the style tag.
- An unknown `editor` throws at startup.

**Integration tests** (the addon blueprint's `test-app`, with real `.hbs` and `.gjs` components):
- A QUnit test confirms the attribute renders when the plugin is registered.
- A production-build check confirms neither `data-ctc-source` nor the overlay code appears in the bundle.

## Open risk

`.gjs`/`.gts` line accuracy depends on what the compile pipeline reports. The first implementation task is the fixture test above, with an offset correction in the transform if it fails.
