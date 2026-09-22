// Builds the zip to upload to the Chrome Web Store: the built extension
// files only, with manifest.json at the archive root.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extdir = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extdir, 'manifest.json'), 'utf8'));

const distdir = path.join(root, 'dist');
fs.mkdirSync(distdir, { recursive: true });
const out = path.join(distdir, `googleshot-${manifest.version}.zip`);
try {
  fs.unlinkSync(out);
} catch {
  // first pack
}

execFileSync(
  'zip',
  ['-r', '-X', out, 'background.js', 'content.js', 'gmail-content.js', 'page.js',
    'popup.html', 'popup.js', 'options.html', 'options.js', 'manifest.json',
    'icons', '_locales', '-x', '*.DS_Store'],
  { cwd: extdir, stdio: 'inherit' }
);
console.log(`Packed ${out}`);
