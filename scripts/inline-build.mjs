// Makes dist-single/index.html: the whole game in one self-contained HTML file
// (handy for sharing a playable link). The normal multi-file build stays in dist/.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

html = html.replace(/<script type="module" crossorigin src="\.\/([^"]+)"><\/script>/g, (_, file) => {
  const js = readFileSync(join(dist, file), 'utf8').replace(/<\/script/gi, '<\\/script');
  return `<script type="module">${js}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="\.\/([^"]+)">/g, (_, file) => {
  return `<style>${readFileSync(join(dist, file), 'utf8')}</style>`;
});

if (/src="\.\/assets|href="\.\/assets/.test(html)) {
  console.error('inline-build: some assets were not inlined');
  process.exit(1);
}

mkdirSync(join(root, 'dist-single'), { recursive: true });
writeFileSync(join(root, 'dist-single', 'index.html'), html);
console.log(`inline-build: wrote dist-single/index.html (${(html.length / 1024).toFixed(0)} KB)`);
