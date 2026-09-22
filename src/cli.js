import path from 'node:path';
import fs from 'node:fs/promises';
import {
  connectBrowser,
  hasGoogleSession,
  launchHeadless,
  readCookiesFromContext,
} from './session.js';
import { captureDocument, capturePresentation } from './capture.js';
import { buildPdf } from './pdf.js';
import { detectBrowsers, resolveBrowser } from './browsers.js';
import { readConfig, writeConfig } from './config.js';
import { chooseBrowser, confirm } from './prompt.js';
import { isDocSource, parseDocId, parseSlidesId, sanitizeFilename } from './util.js';
import { t } from './i18n.js';

const HELP = `GoogleShot - screenshot every slide of a Google Slides deck or every page of a Google Doc, then build a PDF.

Usage:
  googleshot capture <slides-url|doc-url|id> [-o <file.pdf>] [--images-dir <dir>] [--quality <1-100>] [--browser <name>] [--restart]
  googleshot login [--browser <name>] [--restart]
  googleshot browser [--browser <name>] [--restart]
  googleshot <slides-url|doc-url|id> [-o <file.pdf>] [--images-dir <dir>] [--quality <1-100>] [--browser <name>] [--restart]
  gshot c <url|id> ...   (gshot is a short alias of googleshot)

Commands:
  capture, c    Read the session from your browser, then capture every slide or
                page in a headless browser. Your browser stays untouched.
  login, l      Check that your browser has a Google session.
  browser, b    Open your browser with remote debugging and keep it open.

Options:
  -o, --output <file.pdf>   PDF path. Default: "<title>.pdf" in the current directory.
      --images-dir <dir>    Image folder. Default: "<title>_slides" for Slides, "<title>_pages" for Docs.
      --quality <1-100>     JPEG quality of the images. Default: 90.
      --browser <name>      brave, chrome, msedge or chromium. If omitted, the tool asks.
      --restart             Restart the browser automatically when it is already open.
  -h, --help                Show this help.
`;

const COMMANDS = {
  c: 'capture',
  l: 'login',
  b: 'browser',
};

export async function runCli(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help' || command === 'help') {
    console.log(HELP);
    return;
  }
  const name = COMMANDS[command] || command;
  if (name === 'browser') {
    await browserCommand(rest);
    return;
  }
  if (name === 'login') {
    await loginCommand(rest);
    return;
  }
  if (name === 'capture') {
    await captureCommand(rest);
    return;
  }
  if (command.includes('docs.google.com') || command.startsWith('http')) {
    await captureCommand(argv);
    return;
  }
  throw new Error(`${t('unknownCommand', command)}\n\n${HELP}`);
}

function parseOptions(argv) {
  const options = {
    source: null,
    output: null,
    imagesDir: null,
    quality: null,
    browser: null,
    restart: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-o' || arg === '--output') {
      options.output = argv[++index];
    } else if (arg === '--images-dir') {
      options.imagesDir = argv[++index];
    } else if (arg === '--quality') {
      options.quality = argv[++index];
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

function parseQuality(value) {
  if (value === null || value === undefined) {
    return 90;
  }
  const quality = Number(value);
  if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
    throw new Error(t('invalidQuality', value));
  }
  return Math.round(quality);
}

async function pickBrowser({ flag = null, ask = true } = {}) {
  if (flag) {
    return resolveBrowser(flag);
  }
  const browsers = detectBrowsers();
  if (browsers.length === 0) {
    throw new Error(t('noBrowserFound'));
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
      t('restartQuestion', browser.label)
    );
    if (!accepted) {
      throw error;
    }
    return connectBrowser(browser, { restart: true });
  }
}

function wantsHelp(argv) {
  return argv.includes('-h') || argv.includes('--help');
}

async function browserCommand(argv) {
  if (wantsHelp(argv)) {
    console.log(HELP);
    return;
  }
  const options = parseOptions(argv);
  const browser = await pickBrowser({ flag: options.browser });
  const { endpoint } = await connectWithRestart(browser, options);
  console.log(t('browserReady', browser.label, endpoint));
  process.exit(0);
}

async function loginCommand(argv) {
  if (wantsHelp(argv)) {
    console.log(HELP);
    return;
  }
  const options = parseOptions(argv);
  const browser = await pickBrowser({ flag: options.browser });
  const { context } = await connectWithRestart(browser, options);
  if (await hasGoogleSession(context)) {
    console.log(t('loginFound', browser.label));
    process.exit(0);
  }
  console.log(t('loginMissing', browser.label));
  process.exit(1);
}

function resolveSource(input) {
  if (isDocSource(input)) {
    return { kind: 'doc', id: parseDocId(input) };
  }
  if (!input) {
    throw new Error(t('missingSource'));
  }
  if (input.includes('/presentation/d/') || /^[a-zA-Z0-9_-]{20,}$/.test(input)) {
    return { kind: 'slides', id: parseSlidesId(input) };
  }
  throw new Error(t('cannotFindSource', input));
}

async function captureCommand(argv) {
  if (wantsHelp(argv)) {
    console.log(HELP);
    return;
  }
  const options = parseOptions(argv);
  const source = resolveSource(options.source);
  const quality = parseQuality(options.quality);
  const browser = await pickBrowser({ flag: options.browser });

  // cookies stay in memory only: read them from the live browser, then use them
  const { context } = await connectWithRestart(browser, options);
  const cookies = await readCookiesFromContext(context, browser.label);
  console.log(t('sessionCookies', cookies.length, browser.label));

  const { browser: headless, context: headlessContext } = await launchHeadless(cookies);
  let result;
  try {
    const engine = source.kind === 'doc' ? captureDocument : capturePresentation;
    result = await engine(headlessContext, source.id, {
      onProgress: (message) => console.log(message),
      quality,
    });
  } finally {
    await headless.close();
  }

  const baseName = sanitizeFilename(result.title);
  const pdfPath = path.resolve(options.output || `${baseName}.pdf`);
  const imagesDir = path.resolve(
    options.imagesDir || `${baseName}_${source.kind === 'doc' ? 'pages' : 'slides'}`
  );
  const itemName = source.kind === 'doc' ? 'page' : 'slide';

  await fs.rm(imagesDir, { recursive: true, force: true });
  await fs.mkdir(imagesDir, { recursive: true });
  for (let index = 0; index < result.items.length; index += 1) {
    const file = path.join(imagesDir, `${itemName}-${String(index + 1).padStart(3, '0')}.jpg`);
    await fs.writeFile(file, result.items[index]);
  }
  await buildPdf(result.items, pdfPath);

  console.log(`\n${t('done', t(itemName === 'page' ? 'pagesCount' : 'slidesCount', result.items.length))}`);
  console.log(t('pdfPath', pdfPath));
  console.log(t('imagesPath', imagesDir));
  process.exit(0);
}
