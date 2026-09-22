import { captureTab } from './capture.js';
import { collectThread, buildMbox } from './gmail.js';
import { log, error, getLogs } from './log.js';

const GMAIL_URL_PATTERNS = ['https://mail.google.com/*'];

log('background:module-load', { version: chrome.runtime.getManifest().version });

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
    popupGmailHint: t('popupGmailHint'),
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

function sanitizeFilename(name) {
  const cleaned = (name || 'gmail-thread')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'gmail-thread';
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

async function exportGmailThread(tabId) {
  const strings = buildStrings();
  const { threadId, account, ik, authuser } = await gmailAuth(tabId);
  log('gmail:auth-parsed', { threadId, account, authuser, ik: ik ? `${ik.slice(0, 4)}...` : null });
  if (!threadId || !account) {
    throw new Error(strings.gmailNotThread);
  }

  setState({ message: strings.gmailReading, percent: 5 });
  const entries = await collectThread({
    ik,
    account,
    authuser,
    threadId,
    onProgress: (done, total) => {
      log('gmail:progress', { done, total });
      setState({ message: strings.gmailFetching(done, total), percent: 5 + (done / total) * 80 });
    },
  });
  log('gmail:collected', { messages: entries.length, attachments: entries.reduce((sum, e) => sum + e.attachments.length, 0) });
  if (!entries.length) {
    throw new Error(strings.gmailNotThread);
  }

  setState({ message: strings.gmailBuilding, percent: 90 });
  const mbox = buildMbox(entries);
  const subjectHeader = (entries[0].message.payload?.headers || []).find(
    (header) => String(header.name).toLowerCase() === 'subject'
  );
  const title = subjectHeader ? subjectHeader.value : 'gmail-thread';
  const safeTitle = sanitizeFilename(title);
  log('gmail:mbox-built', { bytes: mbox.length, filename: `${safeTitle}.mbox` });
  const blob = new Blob([mbox], { type: 'application/mbox' });
  const url = await blobToDataUrl(blob);
  await chrome.downloads.download({ url, filename: `${safeTitle}.mbox` });
  log('gmail:download-started', { filename: `${safeTitle}.mbox` });
  setState({ message: strings.gmailDone(entries.length), percent: 100 });
  return { ok: true, count: entries.length, title: safeTitle };
}

async function runGmail(tabId) {
  if (state.running) {
    return { ok: false, error: t('statusAlreadyRunning') };
  }
  state.running = true;
  state.action = 'gmail';
  state.tabId = tabId;
  state.error = null;
  setState({ message: t('statusStarting'), percent: 0 });
  try {
    return await exportGmailThread(tabId);
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

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    const lastError = chrome.runtime.lastError;
    if (lastError) {
      error('menu:remove-all', lastError);
    }
    chrome.contextMenus.create(
      {
        id: 'googleshot-gmail-thread',
        title: t('gmailMenuExport'),
        contexts: ['page', 'selection', 'link'],
        documentUrlPatterns: GMAIL_URL_PATTERNS,
      },
      () => {
        const createError = chrome.runtime.lastError;
        log('menu:created', { error: createError ? createError.message : null, title: t('gmailMenuExport') });
      }
    );
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
  if (info.menuItemId !== 'googleshot-gmail-thread' || !tab || !tab.id) {
    return;
  }
  runGmail(tab.id);
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
    runGmail(message.tabId).then(sendResponse).catch((err) => {
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
  return undefined;
});
