import { captureTab } from './capture.js';
import { checkCancelled, requestCancel, resetCancel } from './cancel.js';
import {
  collectThread,
  EXPORT_FORMATS,
  buildAttachmentsZip,
  buildText,
  buildThreadsZip,
} from './gmail.js';
import { sanitizeFilename } from '../../shared/filename.js';
import { log, error, getLogs, setDebug } from './log.js';

const GMAIL_URL_PATTERNS = ['https://mail.google.com/*'];
const DOCS_URL_PATTERNS = [
  'https://docs.google.com/document/*',
  'https://docs.google.com/presentation/*',
];

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
    cancelled: t('statusCancelled'),
    unsupportedPage: t('errUnsupportedPage'),
    editorMissing: t('errEditorMissing'),
    slidesMissing: t('errSlidesMissing'),
    noPages: t('errNoPages'),
    noSlides: t('errNoSlides'),
    pageMissing: (number) => t('errPageMissing', number),
    pageCapture: (number) => t('errPageCapture', number),
    slideOpen: (number) => t('errSlideOpen', number),
    noActiveTab: t('errNoActiveTab'),
    invalidRange: t('errInvalidRange'),
    gmailReading: t('gmailReading'),
    gmailFetching: (current, total) => t('gmailFetching', current, total),
    gmailAttachments: (current, total) => t('gmailAttachments', current, total),
    gmailBuilding: t('gmailBuilding'),
    gmailDone: (count) => t('gmailDone', count),
    gmailNotThread: t('errGmailNotThread'),
    gmailNoAttachments: t('gmailNoAttachments'),
    gmailNoSelection: t('gmailNoSelection'),
    gmailBatchProgress: (current, total, subject) => t('gmailBatchProgress', current, total, subject),
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
    popupFormatPdf: t('gmailMenuFormat_pdf'),
    popupFormatTxt: t('gmailMenuFormat_txt'),
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
    optionsNavDefaults: t('optionsNavDefaults'),
    optionsNavGmail: t('optionsNavGmail'),
    optionsNavHistory: t('optionsNavHistory'),
    statusReady: t('statusReady'),
    statusStarting: t('statusStarting'),
    statusFailed: t('statusFailed'),
    statusCancelling: t('statusCancelling'),
    statusCancelled: t('statusCancelled'),
    popupCancel: t('popupCancel'),
    popupGmailAttachments: t('popupGmailAttachments'),
    popupGmailLimit: t('popupGmailLimit'),
    popupGmailLimitPlaceholder: t('popupGmailLimitPlaceholder'),
    popupGmailCopy: t('popupGmailCopy'),
    popupGmailBatch: t('popupGmailBatch'),
    popupCopiedThread: t('popupCopiedThread'),
    optionsDefaultsTitle: t('optionsDefaultsTitle'),
    optionsDefaultsDesc: t('optionsDefaultsDesc'),
    optionsDefaultTool: t('optionsDefaultTool'),
    optionsToolAuto: t('optionsToolAuto'),
    optionsToolDocs: t('optionsToolDocs'),
    optionsToolGmail: t('optionsToolGmail'),
    optionsHistoryTitle: t('optionsHistoryTitle'),
    optionsHistoryDesc: t('optionsHistoryDesc'),
    optionsHistoryEmpty: t('optionsHistoryEmpty'),
    optionsGmailTitle: t('optionsGmailTitle'),
    optionsGmailDesc: t('optionsGmailDesc'),
    optionsClearHistory: t('optionsClearHistory'),
    colWhen: t('colWhen'),
    colTool: t('colTool'),
    colTitle: t('colTitle'),
    colFormat: t('colFormat'),
    colItems: t('colItems'),
    toolCapture: t('toolCapture'),
    toolGmail: t('toolGmail'),
    gmailMenuExport: t('gmailMenuExport'),
    docsMenuCapture: t('docsMenuCapture'),
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

async function recordHistory(entry) {
  try {
    const { history } = await chrome.storage.local.get({ history: [] });
    const next = [{ at: new Date().toISOString(), ...entry }, ...history].slice(0, 50);
    await chrome.storage.local.set({ history: next });
  } catch {
    // ignore
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Cannot read the file.'));
    reader.readAsDataURL(blob);
  });
}

async function fetchTextInPage(tabId, url) {
  checkCancelled(t('statusCancelled'));
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
  checkCancelled(t('statusCancelled'));
  const response = await fetch(url, { credentials: 'include' });
  log('gmail:attachment-fetch', { url: url.slice(0, 120), status: response.status, ok: response.ok });
  if (!response.ok) {
    throw new Error(`Attachment download failed (${response.status}).`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function sendGmailMessage(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    log('gmail:message-failed', { tabId, method: message.method, reason: err && err.message });
    return null;
  }
}

async function gmailAuth(tabId) {
  // The content script is already declared in the manifest, so in most cases
  // it is there: ask first and inject only when nobody answers. Injecting on
  // every export used to pile up duplicate message listeners.
  let response = await sendGmailMessage(tabId, { target: 'googleshot-gmail', method: 'auth' });
  if (!response || !response.ok) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['gmail-content.js'] });
      log('gmail:content-injected', { tabId });
    } catch (err) {
      log('gmail:content-already-there', { tabId, reason: err && err.message });
    }
    response = await sendGmailMessage(tabId, { target: 'googleshot-gmail', method: 'auth' });
  }
  log('gmail:auth-response', { tabId, ok: response && response.ok, result: response && response.result });
  if (!response || !response.ok || !response.result) {
    throw new Error(buildStrings().gmailNotThread);
  }
  return response.result;
}

async function exportGmailThread(tabId, requestedFormat, options = {}) {
  const strings = buildStrings();
  const formatName =
    requestedFormat && EXPORT_FORMATS[requestedFormat] ? requestedFormat : 'mbox';
  const format = EXPORT_FORMATS[formatName];
  const attachmentsOnly = Boolean(options.attachmentsOnly);
  const limit = Number(options.limit) > 0 ? Number(options.limit) : 0;
  const { threadId, account, ik, authuser } = await gmailAuth(tabId);
  log('gmail:auth-parsed', { threadId, account, authuser, ik: ik ? `${ik.slice(0, 4)}...` : null });
  if (!threadId) {
    throw new Error(strings.gmailNotThread);
  }

  const messages = await chrome.tabs
    .sendMessage(tabId, { target: 'googleshot-gmail', method: 'messages' })
    .then((response) => (response && response.ok ? response.result : null))
    .catch(() => null);
  let selected = messages || [];
  if (limit > 0 && selected.length > limit) {
    selected = selected.slice(-limit);
  }
  log('gmail:messages', { total: messages ? messages.length : 0, used: selected.length });
  if (!selected.length) {
    throw new Error(strings.gmailNotThread);
  }

  setState({ message: strings.gmailReading, percent: 5 });
  const blocks = await collectThread({
    ik,
    authuser,
    messages: selected,
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
  if (blocks.skipped) {
    log('gmail:skipped', { skipped: blocks.skipped });
  }

  setState({ message: strings.gmailBuilding, percent: 90 });
  const title = blocks[0].subject || 'gmail-thread';
  const safeTitle = sanitizeFilename(title, 'gmail-thread');

  if (attachmentsOnly) {
    const total = blocks.reduce((sum, entry) => sum + entry.attachments.length, 0);
    if (!total) {
      throw new Error(strings.gmailNoAttachments);
    }
    const zip = buildAttachmentsZip(blocks);
    const filename = `${safeTitle}_allegati.zip`;
    const url = await blobToDataUrl(new Blob([zip], { type: 'application/zip' }));
    await chrome.downloads.download({ url, filename });
    log('gmail:download-started', { filename, attachments: total });
    setState({ message: strings.gmailDone(blocks.length), percent: 100 });
    recordHistory({
      action: 'gmail',
      title: safeTitle,
      format: 'attachments',
      count: total,
    });
    return { ok: true, count: blocks.length, title: safeTitle, format: 'zip' };
  }

  const content = await format.build(blocks, { threadId, account });
  const filename = `${safeTitle}.${format.extension}`;
  log('gmail:export-built', { format: formatName, bytes: content.length, filename });
  const blob = new Blob([content], { type: format.mime });
  const url = await blobToDataUrl(blob);
  await chrome.downloads.download({ url, filename });
  log('gmail:download-started', { filename });
  setState({ message: strings.gmailDone(blocks.length), percent: 100 });
  recordHistory({
    action: 'gmail',
    title: safeTitle,
    format: formatName,
    count: blocks.length,
  });
  return { ok: true, count: blocks.length, title: safeTitle };
}

async function waitForThread(tabId, threadId, timeout = 10000) {
  const start = Date.now();
  for (;;) {
    const auth = await gmailAuth(tabId).catch(() => null);
    if (auth && auth.threadId === threadId) {
      return;
    }
    if (Date.now() - start > timeout) {
      throw new Error(buildStrings().gmailNotThread);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function openThreadInPage(tabId, threadId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (id) => {
      location.hash = `#inbox/${id}`;
    },
    args: [threadId],
  });
  // A fixed sleep used to race slow networks and read the previous thread's
  // messages. Wait until the page reports the thread we asked for.
  await waitForThread(tabId, threadId);
}

async function exportGmailBatch(tabId, options = {}) {
  const strings = buildStrings();
  const formatName =
    options.format && EXPORT_FORMATS[options.format] ? options.format : 'mbox';
  const format = EXPORT_FORMATS[formatName];

  const selected = await chrome.tabs
    .sendMessage(tabId, { target: 'googleshot-gmail', method: 'selected' })
    .then((response) => (response && response.ok ? response.result : null))
    .catch(() => null);
  log('gmail:batch-selected', { count: selected ? selected.length : 0 });
  if (!selected || selected.length === 0) {
    throw new Error(strings.gmailNoSelection);
  }

  const { ik, authuser } = await gmailAuth(tabId);
  const files = {};
  let done = 0;
  for (const thread of selected) {
    checkCancelled();
    setState({
      message: strings.gmailBatchProgress(done + 1, selected.length, thread.subject),
      percent: (done / selected.length) * 90,
    });
    await openThreadInPage(tabId, thread.threadId);
    const messages = await chrome.tabs
      .sendMessage(tabId, { target: 'googleshot-gmail', method: 'messages' })
      .then((response) => (response && response.ok ? response.result : null))
      .catch(() => null);
    if (!messages || messages.length === 0) {
      done += 1;
      continue;
    }
    const blocks = await collectThread({
      ik,
      authuser,
      messages,
      fetchText: (url) => fetchTextInPage(tabId, url),
      fetchBytes: (url) => fetchBytesInExtension(url),
    });
    if (blocks.length) {
      let name = sanitizeFilename(blocks[0].subject || thread.subject || thread.threadId, 'gmail-thread');
      let counter = 2;
      while (Object.prototype.hasOwnProperty.call(files, `${name}.${format.extension}`)) {
        name = `${name}-${counter}`;
        counter += 1;
      }
      const content = await format.build(blocks, { threadId: thread.threadId });
      files[`${name}.${format.extension}`] = new Uint8Array(content);
    }
    done += 1;
  }
  if (Object.keys(files).length === 0) {
    throw new Error(strings.gmailNotThread);
  }
  const zip = buildThreadsZip(files);
  const filename = `gmail-threads-${selected.length}.zip`;
  const url = await blobToDataUrl(new Blob([zip], { type: 'application/zip' }));
  await chrome.downloads.download({ url, filename });
  log('gmail:batch-download-started', { filename, threads: Object.keys(files).length });
  setState({ message: strings.gmailDone(Object.keys(files).length), percent: 100 });
  recordHistory({
    action: 'gmail',
    title: filename,
    format: `${formatName} (batch)`,
    count: Object.keys(files).length,
  });
  return { ok: true, count: Object.keys(files).length, title: filename };
}

async function copyGmailThread(tabId) {
  if (state.running) {
    return { ok: false, error: t('statusAlreadyRunning') };
  }
  resetCancel();
  state.running = true;
  state.action = 'gmail';
  state.tabId = tabId;
  state.error = null;
  const strings = buildStrings();
  try {
    const { threadId, account, ik, authuser } = await gmailAuth(tabId);
    if (!threadId) {
      throw new Error(strings.gmailNotThread);
    }
    const messages = await chrome.tabs
      .sendMessage(tabId, { target: 'googleshot-gmail', method: 'messages' })
      .then((response) => (response && response.ok ? response.result : null))
      .catch(() => null);
    if (!messages || messages.length === 0) {
      throw new Error(strings.gmailNotThread);
    }
    setState({ action: 'gmail', message: strings.gmailReading, percent: 30 });
    const blocks = await collectThread({
      ik,
      authuser,
      messages,
      fetchText: (url) => fetchTextInPage(tabId, url),
      fetchBytes: (url) => fetchBytesInExtension(url),
    });
    setState({ message: '', percent: 0 });
    return { ok: true, text: buildText(blocks) };
  } finally {
    state.running = false;
    broadcast();
  }
}

async function runGmailBatch(tabId, options = {}) {
  if (state.running) {
    return { ok: false, error: t('statusAlreadyRunning') };
  }
  resetCancel();
  state.running = true;
  state.action = 'gmail';
  state.tabId = tabId;
  state.error = null;
  setState({ message: t('statusStarting'), percent: 0 });
  try {
    return await exportGmailBatch(tabId, options);
  } catch (err) {
    if (err && err.cancelled) {
      log('gmail:batch-cancelled');
      setState({ message: t('statusCancelled'), percent: 0 });
      return { ok: false, error: err.message, cancelled: true };
    }
    error('gmail:batch-failed', err);
    const message = err.message || String(err);
    setState({ message: t('statusFailed'), percent: 0, error: message });
    return { ok: false, error: message };
  } finally {
    state.running = false;
    broadcast();
  }
}

async function runGmail(tabId, format, options = {}) {
  if (state.running) {
    return { ok: false, error: t('statusAlreadyRunning') };
  }
  resetCancel();
  state.running = true;
  state.action = 'gmail';
  state.tabId = tabId;
  state.error = null;
  setState({ message: t('statusStarting'), percent: 0 });
  try {
    return await exportGmailThread(tabId, format, options);
  } catch (err) {
    if (err && err.cancelled) {
      log('gmail:cancelled');
      setState({ message: t('statusCancelled'), percent: 0 });
      return { ok: false, error: err.message, cancelled: true };
    }
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
  resetCancel();
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
    recordHistory({
      action: 'capture',
      title: result.title,
      format: 'pdf',
      count: result.count,
    });
    return { ok: true, ...result };
  } catch (err) {
    if (err && err.cancelled) {
      log('capture:cancelled');
      setState({ message: t('statusCancelled'), percent: 0 });
      return { ok: false, error: err.message, cancelled: true };
    }
    error('capture:failed', err);
    const message = err.message || String(err);
    setState({ message: t('statusFailed'), percent: 0, error: message });
    return { ok: false, error: message };
  } finally {
    state.running = false;
    broadcast();
  }
}

const MENU_FORMATS = ['mbox', 'pdf', 'txt', 'json', 'xml', 'csv', 'html'];

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
      {
        contexts: ['page'],
        documentUrlPatterns: DOCS_URL_PATTERNS,
        id: 'googleshot-capture',
        title: t('docsMenuCapture'),
      },
      () => {
        const createError = chrome.runtime.lastError;
        log('menu:created-capture', { error: createError ? createError.message : null });
      }
    );
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
  if (info.menuItemId === 'googleshot-capture') {
    runCapture(tab.id);
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
  if (message.method === 'gmail-batch-export') {
    runGmailBatch(message.tabId, { format: message.format })
      .then(sendResponse)
      .catch((err) => {
        error('gmail:batch-dispatch', err);
        sendResponse({ ok: false, error: err.message || String(err) });
      });
    return true;
  }
  if (message.method === 'gmail-copy') {
    copyGmailThread(message.tabId).then(sendResponse).catch((err) => {
      error('gmail:copy', err);
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }
  if (message.method === 'gmail-export') {
    runGmail(message.tabId, message.format, {
      attachmentsOnly: message.attachmentsOnly,
      limit: message.limit,
    }).then(sendResponse).catch((err) => {
      error('gmail:dispatch', err);
      sendResponse({ ok: false, error: err.message || String(err) });
    });
    return true;
  }
  if (message.method === 'cancel') {
    if (state.running) {
      requestCancel();
      setState({ message: t('statusCancelling') });
      log('cancel:requested');
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, error: 'Nothing is running.' });
    }
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
    // The popup and the options page report here with { popup: { step, data } }.
    // A plain { method: 'logs' } is a request to read the logs back.
    if (message.popup) {
      log(`popup:${message.popup.step}`, message.popup.data);
      sendResponse({ ok: true });
      return true;
    }
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
