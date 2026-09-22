// Builds the zip to upload to the Chrome Web Store: the built extension
// files only, with manifest.json at the archive root. Uses fflate instead of
// the system `zip`, so `npm run pack` works on Windows too.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extdir = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(extdir, 'manifest.json'), 'utf8'));

const ENTRIES = [
  'background.js',
  'content.js',
  'gmail-content.js',
  'page.js',
  'popup.html',
  'popup.js',
  'options.html',
  'options.js',
  'manifest.json',
  'icons',
  '_locales',
];

const files = {};

function addFile(absolute, name) {
  files[name] = new Uint8Array(fs.readFileSync(absolute));
}

function walk(directory, prefix) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      walk(absolute, name);
    } else {
      addFile(absolute, name);
    }
  }
}

for (const entry of ENTRIES) {
  const absolute = path.join(extdir, entry);
  if (fs.statSync(absolute).isDirectory()) {
    walk(absolute, entry);
  } else {
    addFile(absolute, entry);
  }
}

const distdir = path.join(root, 'dist');
fs.mkdirSync(distdir, { recursive: true });
const out = path.join(distdir, `googleshot-${manifest.version}.zip`);
fs.writeFileSync(out, zipSync(files, { level: 6 }));
console.log(`Packed ${out} (${Object.keys(files).length} files)`);
