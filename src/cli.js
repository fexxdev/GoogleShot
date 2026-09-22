import path from 'node:path';
import fs from 'node:fs/promises';
import { launchContext, login, hasGoogleSession } from './auth.js';
import { capturePresentation } from './capture.js';
import { buildPdf } from './pdf.js';
import { detectBrowsers, resolveBrowser } from './browsers.js';
import { readConfig, writeConfig } from './config.js';
import { chooseBrowser } from './prompt.js';
import { parsePresentationId, sanitizeFilename } from './util.js';

const HELP = `GoogleShot - screenshot every slide of a Google Slides deck, then build a PDF.

Usage:
  googleshot login [--browser <name>]
  googleshot capture <slides-url|id> [-o <file.pdf>] [--png-dir <dir>] [--browser <name>] [--headful]
  googleshot <slides-url|id> [-o <file.pdf>] [--png-dir <dir>] [--browser <name>] [--headful]

Commands:
  login      Open a browser and save your Google session.
  capture    Capture every slide as PNG and write one PDF.

Options:
  -o, --output <file.pdf>   PDF path. Default: "<deck title>.pdf" in the current directory.
      --png-dir <dir>       PNG folder. Default: "<deck title>_slides" in the current directory.
      --browser <name>      brave, chrome, msedge or chromium. If omitted, the tool asks.
      --headful             Show the browser window (debug).
  -h, --help                Show this help.
`;

export async function runCli(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    console.log(HELP);
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
  const options = { source: null, output: null, pngDir: null, browser: null, headful: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-o' || arg === '--output') {
      options.output = argv[++index];
    } else if (arg === '--png-dir') {
      options.pngDir = argv[++index];
    } else if (arg === '--browser') {
      options.browser = argv[++index];
    } else if (arg === '--headful') {
      options.headful = true;
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

async function loginCommand(argv) {
  const options = parseOptions(argv);
  if (options.source || options.output || options.pngDir || options.headful) {
    throw new Error('The login command accepts only the --browser option.');
  }
  const browser = await pickBrowser({ flag: options.browser, ask: !options.browser });
  await login(browser);
}

async function captureCommand(argv) {
  const options = parseOptions(argv);
  if (!options.source) {
    throw new Error('Missing presentation URL or ID.');
  }
  const presentationId = parsePresentationId(options.source);
  const browser = await pickBrowser({ flag: options.browser });
  const context = await launchContext({ headless: !options.headful, browserId: browser.id });
  try {
    if (!(await hasGoogleSession(context))) {
      console.log('No saved Google session. Private decks will fail. Run "googleshot login" first.');
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
  } finally {
    await context.close();
  }
}
