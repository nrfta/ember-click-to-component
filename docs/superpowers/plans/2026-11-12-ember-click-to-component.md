# ember-click-to-component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A development-only Ember addon where Option+Click on a rendered element opens the template line that authored it in VS Code, Cursor, or VS Code Insiders.

**Architecture:** A v2 addon with two parts joined only by a DOM attribute. A Glimmer AST transform (Node, CommonJS, registered in the host's babel config) adds `data-ctc-source="<abs-path>:<line>:<col>"` to plain elements. A browser overlay reads that attribute on Alt+Click / Alt+Right-click and navigates to an editor URL.

**Tech Stack:** TypeScript, `@embroider/addon-blueprint` (v2 addon, pnpm), `babel-plugin-ember-template-compilation`, `@glimmer/syntax`, `content-tag`, vitest + jsdom, QUnit (test-app), `@embroider/macros`.

**Spec:** `docs/superpowers/specs/2026-11-12-ember-click-to-component-design.md`

## Global Constraints

- Ember 5+, Embroider/Vite, `.hbs` and `.gjs`/`.gts`. No classic broccoli builds.
- Editors: `vscode`, `vscode-insiders`, `cursor`. Default `vscode`. Unknown `editor` throws at startup.
- Attribute default `data-ctc-source`; value `<abs-path>:<line>:<col>`, column is 1-based (`loc.start.column + 1`).
- Transform options: only `enabled` (default `true`) and `attribute`.
- Transform never throws when the compiler supplies no file name; it skips annotation.
- Runtime is plain TypeScript with no dependency on Ember's container; the menu is plain DOM with scoped styles.
- Production builds contain neither `data-ctc-source` nor overlay code.
- Plan-level addition to the spec: `startClickToComponent` also accepts `attribute` (default `data-ctc-source`), so a custom transform attribute still works.

## Review Focus

1. Windows paths (`C:\proj\a.gjs:3:4`) contain colons; location parsing must anchor on the last two colons. (Task 3)
2. Paths with spaces, `#`, `?` or unicode must produce a valid editor URL; absolute POSIX paths must not yield `file//`. (Task 3)
3. Releasing Alt while the window is blurred must not leave the hover outline stuck on. (Task 4)
4. Event targets that are not elements (text node, `document`, `null`) must not throw. (Task 4)
5. Camel-case SVG tags (`foreignObject`) are annotated; `<this.foo>`, `<@arg>`, `<:named>`, `<Foo::Bar>` are not. (Task 2)

---

## File Structure

All paths relative to the repo root after Task 1's scaffold (`ember-click-to-component/` is the addon package, `test-app/` the host app).

- `ember-click-to-component/template-transform.cjs`: Glimmer AST plugin; exported as `ember-click-to-component/template-transform`.
- `ember-click-to-component/src/editors.ts`: `parseSource`, `buildEditorUrl`, `assertEditor`.
- `ember-click-to-component/src/find-source.ts`: `findSource`, `collectChain`.
- `ember-click-to-component/src/menu.ts`: right-click menu.
- `ember-click-to-component/src/index.ts`: `startClickToComponent` (listeners, highlight, wiring).
- `ember-click-to-component/test/*.test.ts`: vitest unit tests.
- `test-app/`: babel config wiring, sample `.hbs`/`.gjs` components, QUnit test, `scripts/check-prod-bundle.mjs`.

---

### Task 1: Scaffold the v2 addon and unit-test tooling

**Files:**
- Create: the `@embroider/addon-blueprint` output at the repo root (keep existing `docs/` and `.git`)
- Modify: `ember-click-to-component/package.json` (add `exports["./template-transform"]` → `./template-transform.cjs`; add `"files"` entry for it)
- Create: `ember-click-to-component/vitest.config.ts`, `ember-click-to-component/test/smoke.test.ts`

**Interfaces:**
- Produces: pnpm workspace with packages `ember-click-to-component` and `test-app`; command `pnpm vitest run <file>` run from `ember-click-to-component/`.

- [ ] **Step 1:** Generate the blueprint into a scratch directory with `pnpm dlx ember-cli@latest addon ember-click-to-component -b @embroider/addon-blueprint --pnpm --skip-git`, then move its contents into the repo root without touching `docs/` or `.git`.
- [ ] **Step 2:** Add `vitest`, `jsdom` and `@glimmer/syntax` as devDependencies of `ember-click-to-component`; create `vitest.config.ts` with `include: ['test/**/*.test.ts']`; add a `"test:unit": "vitest run"` script.
- [ ] **Step 3: Write the failing test** `test/smoke.test.ts` asserting `1 + 1 === 2`, run `pnpm vitest run test/smoke.test.ts`, expect PASS (this proves the tooling, so it is not a red test). Delete it in Step 4.
- [ ] **Step 4:** Run `pnpm install && pnpm --filter test-app build` to confirm the scaffold builds; delete `smoke.test.ts`.
- [ ] **Step 5: Commit:** `git add -A && git commit -m "chore: scaffold v2 addon with vitest"`

---

### Task 2: Template transform (hbs)

**Files:**
- Create: `ember-click-to-component/template-transform.cjs`
- Test: `ember-click-to-component/test/transform.test.ts`

**Interfaces:**
- Produces: `module.exports = function clickToComponentTransform(options?: { enabled?: boolean; attribute?: string }): (env: { filename?: string }) => { name: string; visitor: { ElementNode(node): void } }`. Output of a compile via `preprocess(src, { mode: 'codemod', plugins: { ast: [clickToComponentTransform()] }, meta/filename })` then `print`.

- [ ] **Step 1: Write failing tests** in `transform.test.ts`, compiling fixtures through `@glimmer/syntax` `preprocess` with the plugin and `print`ing the result with filename `/proj/app/a.hbs`:
  - `<div></div>` on line 1 prints with `data-ctc-source="/proj/app/a.hbs:1:1"`; the same div indented 4 spaces on line 3 yields `:3:5`.
  - Not annotated: `<Foo />`, `<this.foo />`, `<@arg />`, `<Foo::Bar />`, `<:header></:header>`.
  - Annotated: `<foreignObject></foreignObject>` and `<svg></svg>`.
  - An element already carrying `data-ctc-source="x"` keeps exactly one such attribute with value `x`.
  - `{ enabled: false }` output equals input; `{ attribute: 'data-src' }` emits `data-src`.
  - Compiling with no filename emits no attribute and does not throw.
  - `<div ...attributes {{on "click" this.go}}></div>` keeps `...attributes` and the modifier intact, with the new attribute first.
- [ ] **Step 2:** Run `pnpm vitest run test/transform.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `template-transform.cjs`. Annotate an `ElementNode` when its `tag` starts with a lowercase letter and contains none of `.`, `@`, `:`; prepend an `AttrNode` built with `env.syntax.builders.attr`. Confirm in this step which `env` field carries the absolute file name (log `env` once in a throwaway compile; `env.filename` is expected); use that field.
- [ ] **Step 4:** Run the test file. Expected: PASS.
- [ ] **Step 5: Commit:** `git add ember-click-to-component && git commit -m "feat: template transform annotates plain elements"`

---

### Task 3: Editor URL and source-attribute parsing

**Files:**
- Create: `ember-click-to-component/src/editors.ts`
- Test: `ember-click-to-component/test/editors.test.ts`

**Interfaces:**
- Produces:
  - `type Editor = 'vscode' | 'vscode-insiders' | 'cursor'`
  - `interface SourceLocation { path: string; line: number; column: number }`
  - `parseSource(value: string): SourceLocation | null`
  - `buildEditorUrl(editor: Editor, loc: SourceLocation): string`
  - `assertEditor(editor: string): asserts editor is Editor` (throws `Error` naming the three valid values)

- [ ] **Step 1: Write failing tests:**
  - `parseSource('/p/a.gjs:12:5')` → `{ path: '/p/a.gjs', line: 12, column: 5 }`.
  - `parseSource('C:\\proj\\a.gjs:3:4')` → `{ path: 'C:\\proj\\a.gjs', line: 3, column: 4 }` (Review Focus 1).
  - `parseSource('garbage')` and `parseSource('/p/a.gjs:x:1')` → `null`.
  - `buildEditorUrl('vscode', {path:'/p/a.gjs',line:12,column:5})` → `vscode://file/p/a.gjs:12:5`; likewise `vscode-insiders://file/...` and `cursor://file/...`.
  - A path `/My Proj/a#b?.gjs` yields `vscode://file/My%20Proj/a%23b%3F.gjs:1:1`; unicode is percent-encoded; `C:\proj\a.gjs` yields `vscode://file/C:/proj/a.gjs:1:1` (Review Focus 2).
  - `assertEditor('emacs')` throws; `assertEditor('cursor')` does not.
- [ ] **Step 2:** Run `pnpm vitest run test/editors.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `src/editors.ts`. Parse with a regex anchored on the final `:<digits>:<digits>`. Build the URL by converting backslashes to `/`, stripping one leading `/`, encoding each path segment with `encodeURIComponent` (keep a drive-letter segment like `C:` unencoded), and appending `:line:col`.
- [ ] **Step 4:** Run the test file. Expected: PASS.
- [ ] **Step 5: Commit:** `git add ember-click-to-component && git commit -m "feat: editor URL building and source parsing"`

---

### Task 4: Source lookup, Alt+Click, hover highlight, start/teardown

**Files:**
- Create: `ember-click-to-component/src/find-source.ts`, `ember-click-to-component/src/index.ts`
- Test: `ember-click-to-component/test/runtime.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `parseSource`, `buildEditorUrl`, `assertEditor`, `Editor`, `SourceLocation` from `src/editors.ts`.
- Produces:
  - `interface SourceEntry { element: Element; location: SourceLocation }`
  - `findSource(from: EventTarget | null, attribute?: string): SourceEntry | null` (nearest annotated ancestor, including `from` itself)
  - `collectChain(from: EventTarget | null, attribute?: string): SourceEntry[]` (target up to `<body>`, consecutive identical locations merged)
  - `startClickToComponent(options?: { editor?: Editor; attribute?: string; open?: (url: string) => void }): () => void`; default `open` is `(url) => { window.location.href = url }`.

- [ ] **Step 1: Write failing tests** (build DOM with `data-ctc-source="/p/a.gjs:12:5"` fixtures, call `startClickToComponent({ open: spy })`):
  - Alt+Click on an annotated element calls `open` once with `vscode://file/p/a.gjs:12:5`; the event is `defaultPrevented` and an app click listener on the same element does not fire.
  - `editor: 'cursor'` and `'vscode-insiders'` produce their schemes.
  - Click without Alt: `open` not called, event not prevented.
  - Alt+Click with no annotated ancestor: `open` not called, event not prevented.
  - Alt+Click on a child of an annotated element opens the ancestor's location.
  - `findSource(null)`, `findSource(document)` and `findSource(textNode)` return without throwing (text node resolves via its parent element) (Review Focus 4).
  - Alt `keydown` adds class `ctc-alt-active` to `<html>`; `keyup` removes it; `window` `blur` while active also removes it and clears the hover marker (Review Focus 3).
  - With Alt held, `mousemove` over an annotated element sets `data-ctc-hover` on that single element only, not its ancestors.
  - `collectChain` merges consecutive entries with identical locations.
  - `startClickToComponent({ editor: 'emacs' as any })` throws.
  - Calling the returned teardown removes all listeners, the injected `<style>`, the class and the hover marker; a later Alt+Click does not call `open`.
- [ ] **Step 2:** Run `pnpm vitest run test/runtime.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the two files. Use capture-phase `click` on `document` with `event.altKey`; call `preventDefault()` and `stopPropagation()` only on a match. Inject one `<style>` with the rule `[data-ctc-hover]{outline:1px solid #e0457b!important;outline-offset:-1px}`. Resolve a `Text` target to its `parentElement` before `closest`.
- [ ] **Step 4:** Run the test file. Expected: PASS.
- [ ] **Step 5: Commit:** `git add ember-click-to-component && git commit -m "feat: runtime Alt+Click opens editor with hover highlight"`

---

### Task 5: Option+Right-click menu

**Files:**
- Create: `ember-click-to-component/src/menu.ts`
- Modify: `ember-click-to-component/src/index.ts` (add the `contextmenu` listener; teardown closes any open menu)
- Test: `ember-click-to-component/test/menu.test.ts` (`// @vitest-environment jsdom`)

**Interfaces:**
- Consumes: `collectChain`, `SourceEntry` from `src/find-source.ts`; `buildEditorUrl` from `src/editors.ts`.
- Produces: `showMenu(entries: SourceEntry[], position: { x: number; y: number }, onOpen: (entry: SourceEntry) => void): () => void` (returns a close function; at most one menu exists at a time).

- [ ] **Step 1: Write failing tests:**
  - Alt `contextmenu` on a nested annotated element renders one row per merged ancestor, each showing `<basename>:<line>:<col>` and the element label (for example `<div.card>`); the event is `defaultPrevented`.
  - `contextmenu` without Alt, or with no annotated ancestor, renders no menu and is not prevented.
  - ArrowDown/ArrowUp move the active row (wrapping); Enter calls `open` with that row's editor URL and closes the menu; Escape closes without opening.
  - Clicking a row opens it; clicking outside the menu closes it.
  - A second Alt+Right-click replaces the first menu (only one in the DOM).
  - The menu root is not itself annotated and the teardown from `startClickToComponent` removes an open menu.
- [ ] **Step 2:** Run `pnpm vitest run test/menu.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `showMenu` as plain DOM appended to `document.body`, with its styles scoped under a unique class (`ctc-menu`) inside the same injected `<style>` element used for the highlight. Wire it in `index.ts`.
- [ ] **Step 4:** Run the whole unit suite with `pnpm vitest run`. Expected: all PASS.
- [ ] **Step 5: Commit:** `git add ember-click-to-component && git commit -m "feat: Option+Right-click ancestor menu"`

---

### Task 6: test-app integration, production check, README

**Files:**
- Modify: `test-app/babel.config.cjs`, `test-app/app/app.ts` (or `.js`), `test-app/package.json` (script `check:prod`)
- Create: `test-app/app/components/hello.hbs`, `test-app/app/components/hello-gjs.gjs`, `test-app/tests/integration/click-to-component-test.ts`, `test-app/scripts/check-prod-bundle.mjs`, `README.md`

**Interfaces:**
- Consumes: `ember-click-to-component/template-transform` (default export, the transform factory) and `startClickToComponent` from `ember-click-to-component`.

- [ ] **Step 1: Write the failing QUnit test:** render both sample components; assert that a `<div>` in each has `data-ctc-source` matching `/components\/hello(-gjs)?\.(hbs|gjs):\d+:\d+$/`, and that the `.gjs` element's line equals the line where it is written in the fixture (pin the number in the test).
- [ ] **Step 2:** Run `pnpm --filter test-app test`. Expected: FAIL (attribute absent).
- [ ] **Step 3:** Register the transform in `test-app/babel.config.cjs` inside the `babel-plugin-ember-template-compilation` `transforms` array when `process.env.EMBER_ENV !== 'production'`. Call `startClickToComponent()` in `app.ts` inside `macroCondition(isDevelopingApp())`. If the `.gjs` line number is wrong, add the template start-line offset inside `template-transform.cjs` and extend `transform.test.ts` with a `.gjs`-style fixture before continuing.
- [ ] **Step 4:** Run `pnpm --filter test-app test`. Expected: PASS.
- [ ] **Step 5: Write `scripts/check-prod-bundle.mjs`:** exit 1 and print the offending file if any file under `test-app/dist` contains `data-ctc-source` or `ctc-alt-active`; otherwise exit 0. Run `EMBER_ENV=production pnpm --filter test-app build && node test-app/scripts/check-prod-bundle.mjs`. Expected: exit 0. Then temporarily remove the `macroCondition` guard, rebuild, and confirm the script exits 1; restore the guard.
- [ ] **Step 6:** Write `README.md`: install, the `babel.config.cjs` snippet (development only), the `app.js` snippet, options (`editor`, `attribute`, `enabled`), the Alt+Click / Alt+Right-click behavior, the Linux window-manager Alt note, and that an unregistered editor URL handler fails silently.
- [ ] **Step 7: Commit:** `git add -A && git commit -m "feat: test-app integration, production bundle check, README"`
