// Makes the CrazyGames upload: crazygames/build/ (index.html + assets) and crazygames/swing-or-splash-crazygames.zip.
// Run `npm run build` first (or `npm run build:crazygames`, which does both).
// Differences from dist/: the CrazyGames SDK v3 script tag is in <head> (the documented way to include
// the SDK, so it loads on every CrazyGames domain), and the developer test pages (?sandbox=) are left out.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const outDir = join(root, 'crazygames');
const build = join(outDir, 'build');
const zip = join(outDir, 'swing-or-splash-crazygames.zip');
const SDK_TAG = '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>';

if (!existsSync(join(dist, 'index.html'))) {
  console.error('crazygames-build: dist/ is missing, run `npm run build` first');
  process.exit(1);
}
rmSync(build, { recursive: true, force: true });
mkdirSync(build, { recursive: true });
cpSync(dist, build, { recursive: true });

for (const f of readdirSync(join(build, 'assets'))) {
  if (f.startsWith('sandbox-')) rmSync(join(build, 'assets', f));
}

let html = readFileSync(join(build, 'index.html'), 'utf8');
if (!html.includes('crazygames-sdk-v3.js"></script>')) {
  if (!html.includes('<title>')) {
    console.error('crazygames-build: could not find where to put the SDK tag');
    process.exit(1);
  }
  html = html.replace('<title>', `${SDK_TAG}\n    <title>`);
}
writeFileSync(join(build, 'index.html'), html);

rmSync(zip, { force: true });
// index.html must sit at the root of the zip.
execFileSync('zip', ['-r', '-q', '-9', zip, '.'], { cwd: build });
const files = readdirSync(build, { recursive: true }).length;
const kb = (readFileSync(zip).length / 1024).toFixed(0);
console.log(`crazygames-build: wrote ${zip} (${kb} KB, ${files} entries)`);
