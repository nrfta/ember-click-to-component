// Fails (exit 1) if a production build of the test-app still contains
// click-to-component code or annotations. Run after `vite build`:
//
//   pnpm --filter test-app build && node test-app/scripts/check-prod-bundle.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARKERS = ['data-ctc-source', 'ctc-alt-active'];
const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

function* files(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

function* distFiles() {
  try {
    yield* files(dist);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

let offenders = 0;
let scanned = 0;
let jsAssets = 0;
let indexHtml = false;
for (const file of distFiles()) {
  scanned++;
  if (file.endsWith('.js')) jsAssets++;
  if (file === join(dist, 'index.html')) indexHtml = true;
  const text = readFileSync(file, 'utf8');
  const found = MARKERS.filter((marker) => text.includes(marker));
  if (found.length > 0) {
    offenders++;
    console.error(`${relative(root, file)}: contains ${found.join(', ')}`);
  }
}

if (scanned === 0 || jsAssets === 0 || !indexHtml) {
  // An empty or partial dist/ would pass the marker scan vacuously.
  console.error(
    `check-prod-bundle: dist/ does not look like a build (${scanned} file(s), ${jsAssets} .js asset(s), index.html ${indexHtml ? 'found' : 'missing'}). Run the production build first.`,
  );
  process.exitCode = 1;
} else if (offenders > 0) {
  console.error(
    `check-prod-bundle: ${offenders} file(s) in dist/ leak click-to-component.`,
  );
  process.exitCode = 1;
} else {
  console.log('check-prod-bundle: dist/ is free of click-to-component.');
}
