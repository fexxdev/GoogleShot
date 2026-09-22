import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'extension');

const common = {
  bundle: true,
  format: 'esm',
  target: 'chrome116',
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: [path.join(root, 'extension/src/background.js')],
  outfile: path.join(outdir, 'background.js'),
});

await build({
  ...common,
  entryPoints: [path.join(root, 'extension/src/content.js')],
  outfile: path.join(outdir, 'content.js'),
  format: 'iife',
});

await fs.copyFile(path.join(root, 'extension/src/page.js'), path.join(outdir, 'page.js'));
await fs.copyFile(
  path.join(root, 'extension/static/popup.html'),
  path.join(outdir, 'popup.html')
);
await fs.copyFile(path.join(root, 'extension/static/popup.js'), path.join(outdir, 'popup.js'));

console.log('Extension built in ./extension');
