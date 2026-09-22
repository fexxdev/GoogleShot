import { captureTab } from './capture.js';
import { collectThread, buildMbox } from './gmail.js';

const GMAIL_URL_PATTERNS = ['https://mail.google.com/*'];

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
  chrome.runtime
    .sendMessage({ target: 'googleshot-popup', state: { ...state } })
    .catch(() => {});
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
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['gmail-content.js'],
    });
  } catch {
    // the manifest content script may already be present
  }
  const response = await chrome.tabs
    .sendMessage(tabId, { target: 'googleshot-gmail', method: 'auth' })
    .catch(() => null);
  if (!response || !response.ok || !response.result) {
    throw new Error(buildStrings().gmailNotThread);
  }
  return response.result;
}

async function exportGmailThread(tabId) {
  const strings = buildStrings();
  const { threadId, account, ik } = await gmailAuth(tabId);
  if (!threadId || !account) {
    throw new Error(strings.gmailNotThread);
  }

  setState({ message: strings.gmailReading, percent: 5 });
  const entries = await collectThread({
    ik,
    account,
    threadId,
    onProgress: (done, total) => {
      setState({ message: strings.gmailFetching(done, total), percent: 5 + (done / total) * 80 });
    },
  });
  if (!entries.length) {
    throw new Error(strings.gmailNotThread);
  }

  setState({ message: strings.gmailBuilding, percent: 90 });
  const mbox = buildMbox(entries);
  const subject = (entries[0].message.payload?.headers || []).find(
    (header) => String(header.name).toLowerCase() === 'subject'
  );
  const title = subject ? subject.value : 'gmail-thread';
  const safeTitle = sanitizeFilename(title);
  const blob = new Blob([mbox], { type: 'application/mbox' });
  const url = await blobToDataUrl(blob);
  await chrome.downloads.download({ url, filename: `${safeTitle}.mbox` });
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
  } catch (error) {
    const message = error.message || String(error);
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
  } catch (error) {
    const message = error.message || String(error);
    setState({ message: t('statusFailed'), percent: 0, error: message });
    return { ok: false, error: message };
  } finally {
    state.running = false;
    broadcast();
  }
}

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'googleshot-gmail-thread',
      title: t('gmailMenuExport'),
      contexts: ['page', 'selection', 'link'],
      documentUrlPatterns: GMAIL_URL_PATTERNS,
    });
  });
}

chrome.runtime.onInstalled.addListener(setupContextMenus);
chrome.runtime.onStartup.addListener(setupContextMenus);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'googleshot-gmail-thread' || !tab || !tab.id) {
    return;
  }
  runGmail(tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'googleshot') {
    return undefined;
  }
  if (message.method === 'capture') {
    runCapture(message.tabId).then(sendResponse);
    return true;
  }
  if (message.method === 'gmail-export') {
    runGmail(message.tabId).then(sendResponse);
    return true;
  }
  if (message.method === 'status') {
    sendResponse({ ok: true, state: { ...state } });
    return true;
  }
  if (message.method === 'strings') {
    sendResponse({ ok: true, strings: buildStrings(), status: t('statusReady') });
    return true;
  }
  return undefined;
});
