// Renders the store promo tiles with headless Chromium and saves exact-size PNGs.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outdir = path.join(root, 'store', 'upload');
await fs.mkdir(outdir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.goto(`file://${path.join(root, 'store', 'assets', 'promo-small.html')}`);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(outdir, 'promo-small-440x280.png'),
    clip: { x: 0, y: 0, width: 440, height: 280 },
  });
  console.log('promo-small-440x280.png done');
} finally {
  await browser.close();
}
