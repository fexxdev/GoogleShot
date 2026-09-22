import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const HOME = os.homedir();
const LOCAL_APP_DATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
const PROGRAM_FILES = process.env.PROGRAMFILES || 'C:\\Program Files';
const PROGRAM_FILES_X86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

export const PROFILE_ROOT = process.env.GOOGLESHOT_HOME || path.join(HOME, '.googleshot');

const DEFINITIONS = [
  {
    id: 'brave',
    label: 'Brave',
    commands: ['brave-browser', 'brave'],
    paths: {
      darwin: [
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        path.join(HOME, 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser'),
      ],
      linux: ['/usr/bin/brave-browser', '/usr/bin/brave', '/snap/bin/brave'],
      win32: [
        path.join(PROGRAM_FILES, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(PROGRAM_FILES_X86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(LOCAL_APP_DATA, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      ],
    },
  },
  {
    id: 'chrome',
    label: 'Google Chrome',
    channel: 'chrome',
    commands: ['google-chrome', 'google-chrome-stable'],
    paths: {
      darwin: [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        path.join(HOME, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
      ],
      linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
      win32: [
        path.join(PROGRAM_FILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(PROGRAM_FILES_X86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(LOCAL_APP_DATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ],
    },
  },
  {
    id: 'msedge',
    label: 'Microsoft Edge',
    channel: 'msedge',
    commands: ['microsoft-edge', 'microsoft-edge-stable'],
    paths: {
      darwin: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
      linux: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
      win32: [
        path.join(PROGRAM_FILES, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(PROGRAM_FILES_X86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ],
    },
  },
  {
    id: 'chromium',
    label: 'Chromium (Playwright)',
    bundled: true,
  },
];

function isExecutable(file) {
  if (!file) {
    return false;
  }
  try {
    fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findCommand(command) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  try {
    const output = execFileSync(finder, [command], { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const first = output.split(/\r?\n/)[0];
    return isExecutable(first) ? first : null;
  } catch {
    return null;
  }
}

function findExecutable(definition) {
  const candidates = (definition.paths && definition.paths[process.platform]) || [];
  for (const candidate of candidates) {
    if (isExecutable(candidate)) {
      return candidate;
    }
  }
  for (const command of definition.commands || []) {
    const found = findCommand(command);
    if (found) {
      return found;
    }
  }
  return null;
}

function bundledChromiumRoots() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    return [process.env.PLAYWRIGHT_BROWSERS_PATH];
  }
  if (process.platform === 'darwin') {
    return [path.join(HOME, 'Library', 'Caches', 'ms-playwright')];
  }
  if (process.platform === 'win32') {
    return [path.join(LOCAL_APP_DATA, 'ms-playwright')];
  }
  return [path.join(HOME, '.cache', 'ms-playwright')];
}

function hasBundledChromium() {
  return bundledChromiumRoots().some((root) => {
    try {
      return fs.readdirSync(root).some((name) => name.startsWith('chromium-'));
    } catch {
      return false;
    }
  });
}

function isInstalled(definition) {
  if (definition.bundled) {
    return hasBundledChromium();
  }
  return findExecutable(definition) !== null;
}

export function detectBrowsers() {
  return DEFINITIONS.filter(isInstalled).map((definition) => ({
    id: definition.id,
    label: definition.label,
  }));
}

export function resolveBrowser(id) {
  const definition = DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    const names = DEFINITIONS.map((item) => item.id).join(', ');
    throw new Error(`Unknown browser "${id}". Available: ${names}.`);
  }
  if (!isInstalled(definition)) {
    throw new Error(`${definition.label} is not installed.`);
  }
  return {
    id: definition.id,
    label: definition.label,
    channel: definition.channel || null,
    executablePath: definition.channel || definition.bundled ? null : findExecutable(definition),
  };
}

export function profileDirFor(browserId) {
  return path.join(PROFILE_ROOT, 'profiles', browserId);
}
