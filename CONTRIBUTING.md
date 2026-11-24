# How To Contribute

This repository is a pnpm workspace with two packages:

- `ember-click-to-component/`: the published addon (template transform and
  browser runtime).
- `test-app/`: an Ember app that uses the addon, used for integration tests and
  for trying changes by hand.

## Installation

- `git clone <repository-url>`
- `cd ember-click-to-component`
- `pnpm install` (this also builds the addon through the root `prepare` script)

## Running the tests

Run everything CI runs, from the repository root:

- `pnpm test` builds the addon, then runs the addon unit tests (vitest), the
  test-app QUnit tests, and the production bundle check.

Or run the pieces on their own:

- `pnpm --filter ember-click-to-component test` runs the addon unit tests.
- `pnpm --filter test-app test` runs the test-app QUnit tests.
- `pnpm --filter test-app check:prod` builds the test app for production and
  fails if the output contains `data-ctc-source` attributes or the runtime.

## Linting

- `pnpm lint`
- `pnpm lint:fix`

## Trying changes by hand

- `pnpm start` rebuilds the addon on change and serves the test app at
  [http://localhost:4200](http://localhost:4200).
- Hold Option (Alt) and click around the test app to see the behavior.

To try the addon in another app, add it there as a linked dependency, for
example `pnpm add -D link:/path/to/ember-click-to-component/ember-click-to-component`,
and follow the setup in the [README](README.md). Run `pnpm build` in this
repository after changing the addon, since the link uses the built `dist/`.

## Building the addon

- `pnpm build` (or `pnpm build` inside `ember-click-to-component/`).

The build copies the root `README.md` and `LICENSE.md` into the package, so edit
those at the repository root.

## Releasing

1. Make sure `pnpm test` and `pnpm lint` pass on `main`.
2. Update `CHANGELOG.md`.
3. In `ember-click-to-component/`, run `npm version <patch|minor|major>`.
4. Check what will be published: `cd ember-click-to-component && npm pack --dry-run`.
5. Publish: `npm publish` (add `--access public` for a scoped name).

For more information on using ember-cli, visit [https://cli.emberjs.com/release/](https://cli.emberjs.com/release/).
