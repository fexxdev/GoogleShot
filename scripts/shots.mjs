// Renders the store screenshots with headless Chromium: the popup in its main
// states and the options page. Raw captures go to store/screenshots/, the
// composed 1280x800 tiles the Store wants go to store/upload/.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const extdir = path.join(root, 'extension');
const rawdir = path.join(root, 'store', 'screenshots');
const outdir = path.join(root, 'store', 'upload');
await fs.mkdir(rawdir, { recursive: true });
await fs.mkdir(outdir, { recursive: true });

const CANVAS = { width: 1280, height: 800 };
const BACKGROUND = '#f8fafd';

const manifest = JSON.parse(await fs.readFile(path.join(extdir, 'manifest.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(extdir, '_locales', 'en', 'messages.json'), 'utf8'));
const strings = Object.fromEntries(
  Object.entries(catalog).map(([key, value]) => [key, value.message])
);

const DOCS_URL = 'https://docs.google.com/document/d/1GoogleShot000000000000000000000000000/edit';
const GMAIL_URL = 'https://mail.google.com/mail/u/0/#inbox/18f2c9a1b4d5e6f7';
const OTHER_URL = 'https://example.com/';

const HISTORY = [
  { at: '2026-09-14T09:12:00.000Z', action: 'capture', title: 'Board meeting notes', format: 'pdf', count: 12 },
  { at: '2026-09-13T17:40:00.000Z', action: 'gmail', title: 'Invoice September', format: 'mbox', count: 5 },
  { at: '2026-09-12T08:05:00.000Z', action: 'capture', title: 'Q4 planning', format: 'pdf', count: 3 },
];

const SHOTS = [
  { name: 'popup-docs', page: 'popup.html', url: DOCS_URL, values: {} },
  { name: 'popup-gmail', page: 'popup.html', url: GMAIL_URL, values: {} },
  {
    name: 'popup-gmail-advanced',
    page: 'popup.html',
    url: GMAIL_URL,
    values: { debug: true },
    openAdvanced: true,
  },
  { name: 'popup-unsupported', page: 'popup.html', url: OTHER_URL, values: {} },
  { name: 'options', page: 'options.html', url: '', values: { history: HISTORY }, full: true },
];

// The pages call the extension APIs. This mock answers with the real English
// strings, so the shots show the shipped interface.
function installMock({ strings: messages, values, tab, version }) {
  const target = window.chrome || (window.chrome = {});
  const reply = (message) => {
    if (message && message.method === 'strings') {
      return Promise.resolve({ ok: true, strings: messages, status: 'Ready.' });
    }
    if (message && message.method === 'status') {
      return Promise.resolve({ ok: true, state: { running: false, action: null, message: '', error: null } });
    }
    return Promise.resolve({ ok: true });
  };
  Object.assign(target, {
    runtime: {
      getManifest: () => ({ version }),
      sendMessage: reply,
      openOptionsPage: () => {},
      onMessage: { addListener: () => {} },
      lastError: null,
    },
    storage: {
      local: {
        get: (defaults) => Promise.resolve({ ...defaults, ...values }),
        set: () => Promise.resolve(),
      },
      onChanged: { addListener: () => {} },
    },
    tabs: {
      query: () => Promise.resolve([tab]),
      get: () => Promise.resolve(tab),
    },
  });
}

const browser = await chromium.launch();
try {
  const canvasContext = await browser.newContext({ viewport: CANVAS, colorScheme: 'light' });
  const canvas = await canvasContext.newPage();

  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: shot.full ? CANVAS : { width: 340, height: CANVAS.height },
      colorScheme: 'light',
    });
    await context.addInitScript(installMock, {
      strings,
      values: shot.values,
      tab: { id: 1, url: shot.url },
      version: manifest.version,
    });
    const page = await context.newPage();
    await page.goto(`file://${path.join(extdir, shot.page)}`);
    await page.waitForFunction(
      (id) => {
        const element = document.getElementById(id);
        return Boolean(element && element.textContent);
      },
      shot.full ? 'versionLine' : 'siteLabel'
    );
    if (shot.openAdvanced) {
      await page.evaluate(() => {
        document.getElementById('advanced').open = true;
      });
    }
    await page.waitForTimeout(250);

    const rawPath = path.join(rawdir, `${shot.name}.png`);
    const outPath = path.join(outdir, `${shot.name}-${CANVAS.width}x${CANVAS.height}.png`);
    if (shot.full) {
      // The options page already uses the canvas background: screenshot it 1:1.
      await page.screenshot({ path: rawPath });
      await fs.copyFile(rawPath, outPath);
    } else {
      // Capture the popup box only: the empty page below it would otherwise
      // paste a white column onto the canvas.
      await page.locator('.backdrop').screenshot({ path: rawPath });
      const image = (await fs.readFile(rawPath)).toString('base64');
      await canvas.setContent(
        `<style>html,body{margin:0;width:${CANVAS.width}px;height:${CANVAS.height}px;background:${BACKGROUND};display:grid;place-items:center}img{display:block}</style><img src="data:image/png;base64,${image}">`
      );
      await canvas.waitForFunction(() => {
        const image = document.querySelector('img');
        return Boolean(image && image.complete && image.naturalWidth);
      });
      await canvas.screenshot({ path: outPath, clip: { x: 0, y: 0, ...CANVAS } });
    }
    console.log(`${shot.name} -> ${path.relative(root, outPath)}`);
    await context.close();
  }
} finally {
  await browser.close();
}
