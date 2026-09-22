import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { sleep } from './util.js';

export const DEBUG_PORT = 9222;
export const DEBUG_ENDPOINT = `http://127.0.0.1:${DEBUG_PORT}`;

const AUTH_COOKIES = new Set(['SID', 'HSID', 'SSID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID']);

export async function fetchDebugInfo() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1000);
  try {
    const response = await fetch(`${DEBUG_ENDPOINT}/json/version`, { signal: controller.signal });
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function matchesBrowser(info, browser) {
  const name = String(info.Browser || '');
  if (browser.id === 'brave') {
    return /brave/i.test(name);
  }
  if (browser.id === 'msedge') {
    return /edg/i.test(name);
  }
  if (browser.id === 'chrome') {
    return /chrome/i.test(name) && !/brave|edg/i.test(name);
  }
  return !/brave|edg/i.test(name);
}

function processNameFor(browser) {
  return browser.executablePath ? path.basename(browser.executablePath) : null;
}

function isProcessRunning(browser) {
  const name = processNameFor(browser);
  if (!name) {
    return false;
  }
  try {
    if (process.platform === 'win32') {
      const output = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${name}`, '/NH'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();
      return output.includes(name) && !/no tasks/i.test(output);
    }
    execFileSync('pgrep', ['-f', name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function quitBrowser(browser) {
  try {
    if (process.platform === 'darwin') {
      execFileSync('osascript', ['-e', `tell application "${browser.appName}" to quit`]);
    } else if (process.platform === 'win32') {
      execFileSync('taskkill', ['/IM', processNameFor(browser)]);
    } else {
      execFileSync('pkill', ['-f', processNameFor(browser)]);
    }
  } catch {
    return;
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!isProcessRunning(browser)) {
      return;
    }
    await sleep(500);
  }
  throw new Error(`Could not quit ${browser.label}. Quit it manually, then retry.`);
}

async function launchBrowserWithDebug(browser) {
  const child = spawn(
    browser.executablePath,
    [`--remote-debugging-port=${DEBUG_PORT}`, '--no-first-run', '--no-default-browser-check'],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const info = await fetchDebugInfo();
    if (info) {
      return info;
    }
    await sleep(500);
  }
  throw new Error(`${browser.label} did not start with remote debugging.`);
}

export async function ensureDebugBrowser(browser, { restart = false } = {}) {
  const info = await fetchDebugInfo();
  if (info) {
    if (!matchesBrowser(info, browser)) {
      throw new Error(
        `Port ${DEBUG_PORT} is used by ${info.Browser}. Close it, or select that browser.`
      );
    }
    return DEBUG_ENDPOINT;
  }
  if (isProcessRunning(browser)) {
    if (!restart) {
      const error = new Error(
        `${browser.label} is running without remote debugging. Quit ${browser.label} and retry, or use --restart.`
      );
      error.code = 'BROWSER_NO_DEBUG';
      throw error;
    }
    await quitBrowser(browser);
  }
  await launchBrowserWithDebug(browser);
  return DEBUG_ENDPOINT;
}

export async function connectBrowser(browser, options = {}) {
  const endpoint = await ensureDebugBrowser(browser, options);
  const browserServer = await chromium.connectOverCDP(endpoint);
  const context = browserServer.contexts()[0];
  if (!context) {
    throw new Error(`Cannot open a page in ${browser.label}.`);
  }
  return { browserServer, context };
}

export async function hasGoogleSession(context) {
  const cookies = await context.cookies('https://www.google.com');
  return cookies.some((cookie) => AUTH_COOKIES.has(cookie.name));
}
