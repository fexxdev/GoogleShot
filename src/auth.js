import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { profileDirFor, resolveBrowser, PROFILE_ROOT } from './browsers.js';
import { sleep } from './util.js';

const AUTH_COOKIES = new Set(['SID', 'HSID', 'SSID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID']);

function migrateLegacyProfile() {
  const legacy = path.join(PROFILE_ROOT, 'profile');
  const chromeProfile = profileDirFor('chrome');
  if (fs.existsSync(legacy) && !fs.existsSync(chromeProfile)) {
    fs.mkdirSync(path.dirname(chromeProfile), { recursive: true });
    fs.renameSync(legacy, chromeProfile);
  }
}

export async function launchContext({ headless = true, browserId = 'chrome' } = {}) {
  migrateLegacyProfile();
  const browser = resolveBrowser(browserId);
  const profileDir = profileDirFor(browser.id);
  fs.mkdirSync(profileDir, { recursive: true });
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
  if (browser.channel) {
    options.channel = browser.channel;
  }
  if (browser.executablePath) {
    options.executablePath = browser.executablePath;
  }
  return chromium.launchPersistentContext(profileDir, options);
}

export async function hasGoogleSession(context) {
  const cookies = await context.cookies('https://www.google.com');
  return cookies.some((cookie) => AUTH_COOKIES.has(cookie.name));
}

export async function login(browser) {
  console.log(`Opening ${browser.label}...`);
  console.log(`Profile: ${profileDirFor(browser.id)}`);
  const context = await launchContext({ headless: false, browserId: browser.id });
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto('https://accounts.google.com/', { waitUntil: 'domcontentloaded' });
    console.log('Sign in with the Google account that can open your deck.');

    for (let attempt = 0; attempt < 900; attempt += 1) {
      if (await hasGoogleSession(context)) {
        console.log('Login saved.');
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
