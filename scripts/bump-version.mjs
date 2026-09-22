import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'extension/static/manifest.json');
const packagePath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');

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

// Keep the lockfile root in sync, or `npm ci` warns about an out-of-date lock.
try {
  const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = version;
  }
  await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
} catch {
  // no lockfile: nothing to update
}

console.log(`Extension version: ${version}`);
