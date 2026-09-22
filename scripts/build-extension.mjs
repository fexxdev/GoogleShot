import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'extension');

execFileSync(process.execPath, [path.join(root, 'scripts/bump-version.mjs')], {
  stdio: 'inherit',
});

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

await build({
  ...common,
  entryPoints: [path.join(root, 'extension/src/gmail-content.js')],
  outfile: path.join(outdir, 'gmail-content.js'),
  format: 'iife',
});

await build({
  ...common,
  entryPoints: [path.join(root, 'extension/src/page.js')],
  outfile: path.join(outdir, 'page.js'),
  banner: { js: '// Generated from extension/src/page.js. Do not edit.' },
});

await fs.copyFile(
  path.join(root, 'extension/static/manifest.json'),
  path.join(outdir, 'manifest.json')
);
await fs.copyFile(
  path.join(root, 'extension/static/popup.html'),
  path.join(outdir, 'popup.html')
);
await fs.copyFile(path.join(root, 'extension/static/popup.js'), path.join(outdir, 'popup.js'));
await fs.copyFile(
  path.join(root, 'extension/static/options.html'),
  path.join(outdir, 'options.html')
);
await fs.copyFile(path.join(root, 'extension/static/options.js'), path.join(outdir, 'options.js'));
await fs.rm(path.join(outdir, '_locales'), { recursive: true, force: true });
await fs.cp(path.join(root, 'extension/static/_locales'), path.join(outdir, '_locales'), {
  recursive: true,
});

console.log('Extension built in ./extension');
