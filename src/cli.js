import path from 'node:path';
import fs from 'node:fs/promises';
import { connectBrowser, hasGoogleSession, DEBUG_PORT } from './session.js';
import { capturePresentation } from './capture.js';
import { buildPdf } from './pdf.js';
import { detectBrowsers, resolveBrowser } from './browsers.js';
import { readConfig, writeConfig } from './config.js';
import { chooseBrowser, confirm } from './prompt.js';
import { parsePresentationId, sanitizeFilename, sleep } from './util.js';

const HELP = `GoogleShot - screenshot every slide of a Google Slides deck, then build a PDF.

Usage:
  googleshot browser [--browser <name>] [--restart]
  googleshot login [--browser <name>] [--restart]
  googleshot capture <slides-url|id> [-o <file.pdf>] [--png-dir <dir>] [--browser <name>] [--restart]
  googleshot <slides-url|id> [-o <file.pdf>] [--png-dir <dir>] [--browser <name>] [--restart]

Commands:
  browser    Open your browser with remote debugging and keep it open.
  login      Open the Google login page in your browser.
  capture    Capture every slide as PNG and write one PDF.

Options:
  -o, --output <file.pdf>   PDF path. Default: "<deck title>.pdf" in the current directory.
      --png-dir <dir>       PNG folder. Default: "<deck title>_slides" in the current directory.
      --browser <name>      brave, chrome, msedge or chromium. If omitted, the tool asks.
      --restart             Restart the browser automatically when it is already open.
  -h, --help                Show this help.
`;

export async function runCli(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    console.log(HELP);
    return;
  }
  if (command === 'browser') {
    await browserCommand(rest);
    return;
  }
  if (command === 'login') {
    await loginCommand(rest);
    return;
  }
  if (command === 'capture') {
    await captureCommand(rest);
    return;
  }
  if (command.includes('docs.google.com') || command.startsWith('http')) {
    await captureCommand(argv);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${HELP}`);
}

function parseOptions(argv) {
  const options = { source: null, output: null, pngDir: null, browser: null, restart: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-o' || arg === '--output') {
      options.output = argv[++index];
    } else if (arg === '--png-dir') {
      options.pngDir = argv[++index];
    } else if (arg === '--browser') {
      options.browser = argv[++index];
    } else if (arg === '--restart') {
      options.restart = true;
    } else if (!options.source) {
      options.source = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  return options;
}

async function pickBrowser({ flag = null, ask = true } = {}) {
  if (flag) {
    return resolveBrowser(flag);
  }
  const browsers = detectBrowsers();
  if (browsers.length === 0) {
    throw new Error('No supported browser found. Install Brave, Chrome or Edge, then retry.');
  }
  const savedId = readConfig().browser;
  if (!ask || !process.stdin.isTTY) {
    const saved = browsers.find((browser) => browser.id === savedId);
    return resolveBrowser(saved ? saved.id : browsers[0].id);
  }
  const chosen = await chooseBrowser(browsers, { savedId });
  writeConfig({ browser: chosen.id });
  return resolveBrowser(chosen.id);
}

async function connectWithRestart(browser, { restart = false } = {}) {
  try {
    return await connectBrowser(browser, { restart });
  } catch (error) {
    if (error.code !== 'BROWSER_NO_DEBUG' || restart || !process.stdin.isTTY) {
      throw error;
    }
    const accepted = await confirm(
      `${browser.label} is already open. Restart it in debug mode? Open tabs can be lost. [y/N]: `
    );
    if (!accepted) {
      throw error;
    }
    return connectBrowser(browser, { restart: true });
  }
}

async function browserCommand(argv) {
  const options = parseOptions(argv);
  const browser = await pickBrowser({ flag: options.browser });
  await connectWithRestart(browser, options);
  console.log(`${browser.label} is ready with remote debugging on port ${DEBUG_PORT}.`);
  process.exit(0);
}

async function loginCommand(argv) {
  const options = parseOptions(argv);
  const browser = await pickBrowser({ flag: options.browser });
  const { context } = await connectWithRestart(browser, options);
  const page = await context.newPage();
  await page.goto('https://accounts.google.com/', { waitUntil: 'domcontentloaded' });
  console.log(`Sign in to Google in ${browser.label}.`);
  for (let attempt = 0; attempt < 900; attempt += 1) {
    if (await hasGoogleSession(context)) {
      console.log('Login OK.');
      await page.close();
      process.exit(0);
    }
    await sleep(2000);
  }
  throw new Error('Login timed out after 30 minutes.');
}

async function captureCommand(argv) {
  const options = parseOptions(argv);
  if (!options.source) {
    throw new Error('Missing presentation URL or ID.');
  }
  const presentationId = parsePresentationId(options.source);
  const browser = await pickBrowser({ flag: options.browser });
  const { context } = await connectWithRestart(browser, options);
  if (!(await hasGoogleSession(context))) {
    console.log('No Google session found in this browser. Private decks will fail. Run "googleshot login" first.');
  }
  const { title, slides } = await capturePresentation(context, presentationId, {
    onProgress: (message) => console.log(message),
  });

  const baseName = sanitizeFilename(title);
  const pdfPath = path.resolve(options.output || `${baseName}.pdf`);
  const pngDir = path.resolve(options.pngDir || `${baseName}_slides`);

  await fs.rm(pngDir, { recursive: true, force: true });
  await fs.mkdir(pngDir, { recursive: true });

  const pngPaths = [];
  for (let index = 0; index < slides.length; index += 1) {
    const file = path.join(pngDir, `slide-${String(index + 1).padStart(3, '0')}.png`);
    await fs.writeFile(file, slides[index]);
    pngPaths.push(file);
  }
  await buildPdf(pngPaths, pdfPath);

  console.log(`\nDone. ${slides.length} slides.`);
  console.log(`PDF: ${pdfPath}`);
  console.log(`PNG: ${pngDir}`);
  process.exit(0);
}
