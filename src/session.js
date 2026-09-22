import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { PROFILE_ROOT } from './browsers.js';
import { systemColorScheme } from './theme.js';
import { sleep } from './util.js';

const PORT_CANDIDATES = [9222, 9223, 9224, 9225];
const COOKIES_PATH = path.join(PROFILE_ROOT, 'cookies.json');

const AUTH_COOKIES = new Set(['SID', 'HSID', 'SSID', 'SAPISID', '__Secure-1PSID', '__Secure-3PSID']);

const SESSION_COOKIES = new Set([
  'SIDCC',
  '__Secure-1PSIDCC',
  '__Secure-3PSIDCC',
  '__Secure-1PAPISID',
  '__Secure-3PAPISID',
  '__Secure-1PSIDTS',
  '__Secure-3PSIDTS',
  'LSID',
  'OSID',
  'APISID',
  'ACCOUNT_CHOOSER',
  '__Host-3PLSID',
  '__Host-1PLSID',
  '__Host-GAPS',
  'AEC',
  'NID',
]);

const GOOGLE_USERCONTENT = /(^|\.)googleusercontent\.com$/;

function toPlaywrightCookie(cookie) {
  if (!cookie.domain || !cookie.name) {
    return null;
  }
  const result = {
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path || '/',
    httpOnly: Boolean(cookie.httpOnly),
    secure: Boolean(cookie.secure),
  };
  if (cookie.expires && cookie.expires > 0) {
    result.expires = cookie.expires;
  }
  if (cookie.sameSite === 'Strict' || cookie.sameSite === 'Lax' || cookie.sameSite === 'None') {
    result.sameSite = cookie.sameSite;
  }
  return result;
}

function isWantedCookie(cookie) {
  const domain = cookie.domain.replace(/^\./, '');
  if (domain === 'docs.google.com') {
    return true;
  }
  if (GOOGLE_USERCONTENT.test(cookie.domain)) {
    return true;
  }
  if (domain === 'google.com') {
    return AUTH_COOKIES.has(cookie.name) || SESSION_COOKIES.has(cookie.name);
  }
  return false;
}

export async function fetchDebugInfo(port) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: controller.signal,
    });
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

function processForPort(port) {
  try {
    if (process.platform === 'win32') {
      const connections = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();
      const line = connections
        .split(/\r?\n/)
        .find((item) => item.includes(`:${port}`) && /listening/i.test(item));
      if (!line) {
        return null;
      }
      const pid = line.trim().split(/\s+/).pop();
      const tasks = execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();
      const match = tasks.match(/"([^"]+)"/);
      return match ? match[1] : null;
    }
    const listeners = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString();
    const match = listeners.match(/^p(\d+)$/m);
    if (!match) {
      return null;
    }
    return execFileSync('ps', ['-p', match[1], '-o', 'comm='], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function processMatchesBrowser(command, browser) {
  if (!command || !browser.executablePath) {
    return false;
  }
  return path.basename(command) === path.basename(browser.executablePath);
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

async function launchBrowserWithDebug(browser, port) {
  const child = spawn(
    browser.executablePath,
    [`--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check'],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const info = await fetchDebugInfo(port);
    if (info) {
      return info;
    }
    await sleep(500);
  }
  throw new Error(`${browser.label} did not start with remote debugging.`);
}

export async function ensureDebugBrowser(browser, { restart = false } = {}) {
  const usedPorts = new Set();
  for (const port of PORT_CANDIDATES) {
    const info = await fetchDebugInfo(port);
    if (info) {
      const command = processForPort(port);
      if (processMatchesBrowser(command, browser) || matchesBrowser(info, browser)) {
        return `http://127.0.0.1:${port}`;
      }
      usedPorts.add(port);
    }
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
  const port = PORT_CANDIDATES.find((candidate) => !usedPorts.has(candidate));
  if (!port) {
    throw new Error(`No free remote debugging port in ${PORT_CANDIDATES.join(', ')}.`);
  }
  await launchBrowserWithDebug(browser, port);
  return `http://127.0.0.1:${port}`;
}

export async function connectBrowser(browser, options = {}) {
  const endpoint = await ensureDebugBrowser(browser, options);
  const browserServer = await chromium.connectOverCDP(endpoint);
  const context = browserServer.contexts()[0];
  if (!context) {
    throw new Error(`Cannot open a page in ${browser.label}.`);
  }
  return { browserServer, context, endpoint };
}

export async function hasGoogleSession(context) {
  const cookies = await context.cookies('https://www.google.com');
  return cookies.some((cookie) => AUTH_COOKIES.has(cookie.name));
}

export async function readCookiesFromContext(context, label = 'browser') {
  const cookies = await context.cookies();
  const relevant = cookies.filter(isWantedCookie);
  if (!relevant.some((cookie) => AUTH_COOKIES.has(cookie.name))) {
    throw new Error(`No Google session in ${label}. Sign in at https://accounts.google.com first.`);
  }
  return relevant;
}

export function saveCookies(cookies) {
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2), { mode: 0o600 });
}

export function loadCookies() {
  try {
    const parsed = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export async function launchHeadless(
  cookies,
  { deviceScaleFactor = 1.5, viewport = { width: 1600, height: 1400 } } = {}
) {
  const options = {
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
    ignoreDefaultArgs: ['--enable-automation'],
  };
  let browser;
  try {
    browser = await chromium.launch({ ...options, channel: 'chrome' });
  } catch {
    browser = await chromium.launch(options);
  }
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    colorScheme: systemColorScheme(),
  });
  await context.addCookies(cookies.map(toPlaywrightCookie).filter(Boolean));
  return { browser, context };
}

