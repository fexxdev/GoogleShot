import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'extension/static/manifest.json');
const packagePath = path.join(root, 'package.json');

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const [major, minor, patch] = manifest.version.split('.').map(Number);
const version = `${major}.${minor}.${patch + 1}`;
manifest.version = version;
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
if (pkg.version !== version) {
  pkg.version = version;
  await fs.writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
}

console.log(`Extension version: ${version}`);
