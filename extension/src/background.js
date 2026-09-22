import { captureTab } from './capture.js';
import { collectThread, EXPORT_FORMATS } from './gmail.js';
import { log, error, getLogs, setDebug } from './log.js';

const GMAIL_URL_PATTERNS = ['https://mail.google.com/*'];

chrome.storage.local.get({ debug: false }).then((values) => {
  setDebug(values.debug);
  log('background:module-load', { version: chrome.runtime.getManifest().version, debug: values.debug });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.debug) {
    setDebug(changes.debug.newValue);
    log('background:debug-changed', { debug: changes.debug.newValue });
  }
});

const state = {
  running: false,
  action: null,
  tabId: null,
  message: '',
  percent: 0,
  error: null,
};

function t(key, ...substitutions) {
  const values = substitutions.map((value) => String(value));
  const message = chrome.i18n.getMessage(key, values);
  if (message) {
    return message;
  }
  return key;
}

function buildStrings() {
  return {
    findingPages: t('advFindingPages'),
    findingSlides: t('advFindingSlides'),
    scanning: (count) => t('advScanningDocument', count),
    pagesFound: (count) => t('advPagesFound', count),
    slidesFound: (count) => t('advSlidesFound', count),
    capturingPage: (current, total) => t('advCapturingPage', current, total),
    capturingSlide: (current, total) => t('advCapturingSlide', current, total),
    buildingPdf: t('advBuildingPdf'),
    done: t('advDone'),
    unsupportedPage: t('errUnsupportedPage'),
    editorMissing: t('errEditorMissing'),
    slidesMissing: t('errSlidesMissing'),
    noPages: t('errNoPages'),
    noSlides: t('errNoSlides'),
    pageMissing: (number) => t('errPageMissing', number),
    pageCapture: (number) => t('errPageCapture', number),
    slideOpen: (number) => t('errSlideOpen', number),
    noActiveTab: t('errNoActiveTab'),
    gmailReading: t('gmailReading'),
    gmailFetching: (current, total) => t('gmailFetching', current, total),
    gmailAttachments: (current, total) => t('gmailAttachments', current, total),
    gmailBuilding: t('gmailBuilding'),
    gmailDone: (count) => t('gmailDone', count),
    gmailNotThread: t('errGmailNotThread'),
    gmailUnauthorized: t('errGmailUnauthorized'),
    gmailFailed: (reason) => t('errGmailFailed', reason),
    popupCapture: t('popupCapture'),
    popupCaptureHint: t('popupCaptureHint'),
    popupOpenDocs: t('popupOpenDocs'),
    popupSaveImages: t('popupSaveImages'),
    popupQuality: t('popupQuality'),
    popupAdvanced: t('popupAdvanced'),
    popupRange: t('popupRange'),
    popupRangePlaceholder: t('popupRangePlaceholder'),
    popupSpeed: t('popupSpeed'),
    popupSpeedFast: t('popupSpeedFast'),
    popupSpeedNormal: t('popupSpeedNormal'),
    popupSpeedSafe: t('popupSpeedSafe'),
    popupFilename: t('popupFilename'),
    popupFilenamePlaceholder: t('popupFilenamePlaceholder'),
    popupUnsupported: t('popupUnsupported'),
    popupGmailExport: t('popupGmailExport'),
    popupGmailFormat: t('popupGmailFormat'),
    popupFormatMbox: t('gmailMenuFormat_mbox'),
    popupFormatJson: t('gmailMenuFormat_json'),
    popupFormatXml: t('gmailMenuFormat_xml'),
    popupFormatCsv: t('gmailMenuFormat_csv'),
    popupFormatHtml: t('gmailMenuFormat_html'),
    popupGmailHint: t('popupGmailHint'),
    popupSiteDocs: t('popupSiteDocs'),
    popupSiteSlides: t('popupSiteSlides'),
    popupSiteGmail: t('popupSiteGmail'),
    popupSiteOther: t('popupSiteOther'),
    popupHintDocs: t('popupHintDocs'),
    popupHintSlides: t('popupHintSlides'),
    popupOpenGmail: t('popupOpenGmail'),
    popupDebug: t('popupDebug'),
    popupCopyLogs: t('popupCopyLogs'),
    popupCopied: t('popupCopied'),
    statusReady: t('statusReady'),
    gmailMenuExport: t('gmailMenuExport'),
  };
}

function broadcast() {
  try {
    chrome.runtime
      .sendMessage({ target: 'googleshot-popup', state: { ...state } })
      .catch(() => {});
  } catch {
    // no popup open
  }
}

function setState(patch) {
  Object.assign(state, patch);
  broadcast();
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Cannot read the file.'));
    reader.readAsDataURL(blob);
  });
}

function decodeMimeWord(value) {
  return String(value || '').replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (match, charset, encoding, text) => {
    try {
      if (encoding.toUpperCase() === 'B') {
        const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
        return new TextDecoder(charset).decode(bytes);
      }
      const bytes = [];
      const normalized = text.replace(/_/g, ' ');
      for (let index = 0; index < normalized.length; index += 1) {
        if (normalized[index] === '=' && index + 2 < normalized.length) {
          bytes.push(parseInt(normalized.slice(index + 1, index + 3), 16));
          index += 2;
        } else {
          bytes.push(normalized.charCodeAt(index));
        }
      }
      return new TextDecoder(charset).decode(Uint8Array.from(bytes));
    } catch {
      return match;
    }
  });
}

function sanitizeFilename(name) {
  const cleaned = (name || 'gmail-thread')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'gmail-thread';
}

async function fetchTextInPage(tabId, url) {
  const result = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (fetchUrl) => {
      try {
        const response = await fetch(fetchUrl, { credentials: 'include' });
        const text = await response.text();
        return {
          ok: response.ok,
          status: response.status,
          type: response.headers.get('content-type') || '',
          preview: text.slice(0, 90),
          text,
        };
      } catch (error) {
        return { ok: false, status: 0, text: '', error: String(error && error.message ? error.message : error) };
      }
    },
    args: [url],
  });
  const entry = result && result[0] && result[0].result;
  log('gmail:page-fetch', {
    url: url.slice(0, 140),
    ok: entry ? entry.ok : null,
    status: entry ? entry.status : null,
    type: entry ? entry.type : null,
    bytes: entry && entry.text ? entry.text.length : 0,
    preview: entry ? entry.preview : null,
    error: entry ? entry.error || null : 'no-result',
  });
  if (!entry) {
    throw new Error('The page did not answer the fetch.');
  }
  if (entry.error) {
    throw new Error(`Page fetch failed: ${entry.error}`);
  }
  if (!entry.ok) {
    throw new Error(`Gmail responded ${entry.status}.`);
  }
  return entry.text;
}

async function fetchBytesInExtension(url) {
  const response = await fetch(url, { credentials: 'include' });
  log('gmail:attachment-fetch', { url: url.slice(0, 120), status: response.status, ok: response.ok });
  if (!response.ok) {
    throw new Error(`Attachment download failed (${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function gmailAuth(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['gmail-content.js'] });
    log('gmail:content-injected', { tabId });
  } catch (err) {
    log('gmail:content-already-there', { tabId, reason: err && err.message });
  }
  const response = await chrome.tabs
    .sendMessage(tabId, { target: 'googleshot-gmail', method: 'auth' })
    .catch((err) => {
      log('gmail:auth-message-failed', { tabId, reason: err && err.message });
      return null;
    });
  log('gmail:auth-response', { tabId, ok: response && response.ok, result: response && response.result });
  if (!response || !response.ok || !response.result) {
    throw new Error(buildStrings().gmailNotThread);
  }
  return response.result;
}

async function exportGmailThread(tabId, requestedFormat) {
  const strings = buildStrings();
  const formatName =
    requestedFormat && EXPORT_FORMATS[requestedFormat] ? requestedFormat : 'mbox';
  const format = EXPORT_FORMATS[formatName];
  const { threadId, account, ik, authuser } = await gmailAuth(tabId);
  log('gmail:auth-parsed', { threadId, account, authuser, ik: ik ? `${ik.slice(0, 4)}...` : null });
  if (!threadId) {
    throw new Error(strings.gmailNotThread);
  }

  const messages = await chrome.tabs
    .sendMessage(tabId, { target: 'googleshot-gmail', method: 'messages' })
    .then((response) => (response && response.ok ? response.result : null))
    .catch(() => null);
  log('gmail:messages', { messages });
  if (!messages || messages.length === 0) {
    throw new Error(strings.gmailNotThread);
  }

  setState({ message: strings.gmailReading, percent: 5 });
  const blocks = await collectThread({
    ik,
    authuser,
    messages,
    fetchText: (url) => fetchTextInPage(tabId, url),
    fetchBytes: (url) => fetchBytesInExtension(url),
    onProgress: (done, total) => {
      log('gmail:progress', { done, total });
      setState({ message: strings.gmailFetching(done, total), percent: 5 + (done / total) * 80 });
    },
  });
  log('gmail:collected', { messages: blocks.length, bytes: blocks.reduce((sum, b) => sum + b.length, 0) });
  if (!blocks.length) {
    throw new Error(strings.gmailNotThread);
  }

  setState({ message: strings.gmailBuilding, percent: 90 });
  const title = blocks[0].subject || 'gmail-thread';
  const safeTitle = sanitizeFilename(title);
  const content = format.build(blocks, { threadId, account });
  const filename = `${safeTitle}.${format.extension}`;
  log('gmail:export-built', { format: formatName, bytes: content.length, filename });
  const blob = new Blob([content], { type: format.mime });
  const url = await blobToDataUrl(blob);
  await chrome.downloads.download({ url, filename });
  log('gmail:download-started', { filename });
  setState({ message: strings.gmailDone(blocks.length), percent: 100 });
  return { ok: true, count: blocks.length, title: safeTitle };
}

async function runGmail(tabId, format) {
  if (state.running) {
    return { ok: false, error: t('statusAlreadyRunning') };
  }
  state.running = true;
  state.action = 'gmail';
  state.tabId = tabId;
  state.error = null;
  setState({ message: t('statusStarting'), percent: 0 });
  try {
    return await exportGmailThread(tabId, format);
  } catch (err) {
    error('gmail:failed', err);
    const message = err.message || String(err);
    setState({ message: t('statusFailed'), percent: 0, error: message });
    return { ok: false, error: message };
  } finally {
    state.running = false;
    broadcast();
  }
}

async function runCapture(tabId) {
  if (state.running) {
    return { ok: false, error: t('statusAlreadyRunning') };
  }
  const strings = buildStrings();
  state.running = true;
  state.action = 'capture';
  state.tabId = tabId;
  state.error = null;
  setState({ message: t('statusStarting'), percent: 0 });
  try {
    const result = await captureTab(tabId, {
      onProgress: (message, percent) => setState({ message, percent }),
      strings,
      errors: strings,
    });
    setState({ message: t('statusDone', result.count, result.itemName), percent: 100 });
    return { ok: true, ...result };
  } catch (err) {
    error('capture:failed', err);
    const message = err.message || String(err);
    setState({ message: t('statusFailed'), percent: 0, error: message });
    return { ok: false, error: message };
  } finally {
    state.running = false;
    broadcast();
  }
}

const MENU_FORMATS = ['mbox', 'json', 'xml', 'csv', 'html'];

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    const lastError = chrome.runtime.lastError;
    if (lastError) {
      error('menu:remove-all', lastError);
    }
    const base = {
      contexts: ['page', 'selection', 'link'],
      documentUrlPatterns: GMAIL_URL_PATTERNS,
    };
    chrome.contextMenus.create(
      { ...base, id: 'googleshot-gmail-thread', title: t('gmailMenuExport') },
      () => {
        const createError = chrome.runtime.lastError;
        log('menu:created', { error: createError ? createError.message : null });
      }
    );
    for (const format of MENU_FORMATS) {
      chrome.contextMenus.create(
        {
          ...base,
          id: `googleshot-gmail-thread-${format}`,
          parentId: 'googleshot-gmail-thread',
          title: t(`gmailMenuFormat_${format}`),
        },
        () => {
          const createError = chrome.runtime.lastError;
          log('menu:created-format', {
            format,
            error: createError ? createError.message : null,
          });
        }
      );
    }
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  log('background:installed', { reason: details && details.reason });
  setupContextMenus();
});
chrome.runtime.onStartup.addListener(() => {
  log('background:startup');
  setupContextMenus();
});
setupContextMenus();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  log('menu:clicked', { menuItemId: info.menuItemId, tabId: tab && tab.id, url: tab && tab.url });
  if (!tab || !tab.id) {
    return;
  }
  const match = String(info.menuItemId).match(/^googleshot-gmail-thread(?:-(\w+))?$/);
  if (!match) {
    return;
  }
  runGmail(tab.id, match[1] || 'mbox');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'googleshot') {
    return undefined;
  }
  log('message', { method: message.method, tabId: message.tabId });
  if (message.method === 'capture') {
    runCapture(message.tabId).then(sendResponse).catch((err) => {
      error('capture:dispatch', err);
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }
  if (message.method === 'gmail-export') {
    runGmail(message.tabId, message.format).then(sendResponse).catch((err) => {
      error('gmail:dispatch', err);
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }
  if (message.method === 'status') {
    sendResponse({ ok: true, state: { ...state } });
    return true;
  }
  if (message.method === 'strings') {
    try {
      sendResponse({ ok: true, strings: buildStrings(), status: t('statusReady') });
    } catch (err) {
      error('strings:failed', err);
      sendResponse({ ok: false, error: err.message || String(err) });
    }
    return true;
  }
  if (message.method === 'logs') {
    sendResponse({ ok: true, logs: getLogs() });
    return true;
  }
  if (message.method === 'debug') {
    setDebug(message.enabled);
    sendResponse({ ok: true });
    return true;
  }
  return undefined;
});
