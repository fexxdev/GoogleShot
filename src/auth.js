import fs from 'node:fs';
import { chromium } from 'playwright';
import { PROFILE_DIR, sleep } from './util.js';

const AUTH_COOKIES = new Set(['SID', 'HSID', 'SSID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID']);

export async function launchContext({ headless = true } = {}) {
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  const options = {
    headless,
    viewport: { width: 1600, height: 1000 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
  };
  try {
    return await chromium.launchPersistentContext(PROFILE_DIR, { ...options, channel: 'chrome' });
  } catch (error) {
    if (!/Executable doesn't exist|channel/.test(String(error.message))) {
      throw error;
    }
    return await chromium.launchPersistentContext(PROFILE_DIR, options);
  }
}

export async function hasGoogleSession(context) {
  const cookies = await context.cookies('https://www.google.com');
  return cookies.some((cookie) => AUTH_COOKIES.has(cookie.name));
}

export async function login() {
  console.log('Opening Google login...');
  console.log(`Profile: ${PROFILE_DIR}`);
  const context = await launchContext({ headless: false });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://accounts.google.com/', { waitUntil: 'domcontentloaded' });

    for (let attempt = 0; attempt < 900; attempt += 1) {
      if (await hasGoogleSession(context)) {
        console.log('Login saved. You can close the browser.');
        await sleep(1500);
        return;
      }
      await sleep(2000);
    }
    throw new Error('Login timed out after 30 minutes.');
  } finally {
    await context.close();
  }
}
