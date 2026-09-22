const elements = {
  version: document.getElementById('version'),
  site: document.getElementById('site'),
  siteIcon: document.getElementById('siteIcon'),
  siteLabel: document.getElementById('siteLabel'),

  docsCard: document.getElementById('docsCard'),
  docsTitle: document.getElementById('docsTitle'),
  docsDesc: document.getElementById('docsDesc'),
  docsStatus: document.getElementById('docsStatus'),
  docsStatusText: document.getElementById('docsStatusText'),
  docsCancel: document.getElementById('docsCancel'),
  gmailCancel: document.getElementById('gmailCancel'),
  capture: document.getElementById('capture'),
  gmailCard: document.getElementById('gmailCard'),
  gmailTitle: document.getElementById('gmailTitle'),
  gmailDesc: document.getElementById('gmailDesc'),
  gmailStatus: document.getElementById('gmailStatus'),
  gmailStatusText: document.getElementById('gmailStatusText'),
  gmailExport: document.getElementById('gmailExport'),
  advanced: document.getElementById('advanced'),
  advancedLabel: document.getElementById('advancedLabel'),
  docsFields: document.getElementById('docsFields'),
  range: document.getElementById('range'),
  rangeLabel: document.getElementById('rangeLabel'),
  speed: document.getElementById('speed'),
  speedLabel: document.getElementById('speedLabel'),
  speedFast: document.getElementById('speedFast'),
  speedNormal: document.getElementById('speedNormal'),
  speedSafe: document.getElementById('speedSafe'),
  filename: document.getElementById('filename'),
  filenameLabel: document.getElementById('filenameLabel'),
  quality: document.getElementById('quality'),
  qualityLabel: document.getElementById('qualityLabel'),
  images: document.getElementById('images'),
  imagesLabel: document.getElementById('imagesLabel'),
  gmailFields: document.getElementById('gmailFields'),
  format: document.getElementById('format'),
  formatLabel: document.getElementById('formatLabel'),
  formatMbox: document.getElementById('formatMbox'),
  formatJson: document.getElementById('formatJson'),
  formatXml: document.getElementById('formatXml'),
  formatCsv: document.getElementById('formatCsv'),
  formatHtml: document.getElementById('formatHtml'),
  formatPdf: document.getElementById('formatPdf'),
  formatTxt: document.getElementById('formatTxt'),
  limit: document.getElementById('limit'),
  limitLabel: document.getElementById('limitLabel'),
  attachmentsOnly: document.getElementById('attachmentsOnly'),
  attachmentsLabel: document.getElementById('attachmentsLabel'),
  gmailCopy: document.getElementById('gmailCopy'),
  gmailBatch: document.getElementById('gmailBatch'),
  debug: document.getElementById('debug'),
  debugLabel: document.getElementById('debugLabel'),
  logsSection: document.getElementById('logsSection'),
  copyLogs: document.getElementById('copyLogs'),
};

const FALLBACK = {
  statusReady: 'Ready.',
  statusStarting: 'Starting...',
  statusFailed: 'Failed',
  popupSiteDocs: 'Google Docs',
  popupSiteSlides: 'Google Slides',
  popupSiteGmail: 'Gmail',
  popupSiteOther: 'No supported site',
  popupHintDocs: 'Capture every page of this document as a PDF.',
  popupHintSlides: 'Capture every slide of this presentation as a PDF.',
  popupHintGmail: 'Download the open thread with the attachments as an .mbox file.',
  popupCapture: 'Capture this tab',
  popupGmailExport: 'Export this thread',

  popupAdvanced: 'Advanced options',
  popupDebug: 'Debug mode (console logs)',
  popupCopyLogs: 'Copy debug logs',
  popupCopied: 'Copied',
  popupRange: 'Pages / slides',
  popupRangePlaceholder: 'All. Example: 1-5,8',
  popupSpeed: 'Capture speed',
  popupSpeedFast: 'Fast',
  popupSpeedNormal: 'Normal',
  popupSpeedSafe: 'Safe (slower)',
  popupFilename: 'File name',
  popupFilenamePlaceholder: 'Document title',
  popupQuality: 'JPEG quality',
  popupSaveImages: 'Also save the JPEG images',
  popupGmailFormat: 'Format',
  popupFormatMbox: 'as .mbox (full email archive)',
  popupFormatJson: 'as .json (structured data)',
  popupFormatXml: 'as .xml (structured data)',
  popupFormatCsv: 'as .csv (messages table)',
  popupFormatHtml: 'as .html (readable page)',
  popupFormatPdf: 'as .pdf (print view)',
  popupFormatTxt: 'as .txt (plain text)',
  popupGmailAttachments: 'Only the attachments (zip)',
  popupGmailLimit: 'Last messages',
  popupGmailLimitPlaceholder: 'All',
  popupGmailCopy: 'Copy as text',
  popupGmailBatch: 'Export selected threads',
  popupCopiedThread: 'Copied',
  popupCancel: 'Cancel',
};

const ICONS = {
  docs: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7l-5-5Z" fill="#4285f4"/><path d="M14 2v5h5" fill="#a1c2fa"/><path d="M8.5 12.5h7M8.5 15h7M8.5 17.5h4.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  slides: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="12" rx="2" fill="#f9ab00"/><rect x="9" y="18" width="6" height="1.6" rx="0.8" fill="#f9ab00"/><path d="M10 7.5 15 10l-5 2.5v-5Z" fill="#fff"/></svg>`,
  gmail: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-11Z" fill="#fff" stroke="#d93025" stroke-width="1.4"/><path d="m3.5 6.5 8.5 6 8.5-6" stroke="#d93025" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  other: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" stroke="currentColor" stroke-width="1.6"/></svg>`,
};

let strings = { ...FALLBACK };
let currentSite = 'other';

const params = new URLSearchParams(location.search);
// the dev overrides work only in debug mode, so a published build ignores them
let forcedTabId = Number(params.get('tabId')) || null;
let forcedSite = ['docs', 'slides', 'gmail', 'other'].includes(params.get('site'))
  ? params.get('site')
  : null;
if (!forcedTabId && !forcedSite) {
  forcedTabId = null;
  forcedSite = null;
} else {
  chrome.storage.local.get({ debug: false }).then((values) => {
    if (!values.debug) {
      forcedTabId = null;
      forcedSite = null;
      refresh();
    }
  });
}

function gsLog(step, data) {
  try {
    chrome.runtime.sendMessage({ target: 'googleshot', method: 'logs', popup: { step, data } });
  } catch {
    // ignore
  }
  chrome.storage.local.get({ debug: false }).then((values) => {
    if (values.debug) {
      console.log('[GS] popup:' + step, data === undefined ? '' : data);
    }
  });
}

const detectSite = (url) => {
  if (!url) {
    return 'other';
  }
  if (/^https:\/\/docs\.google\.com\/document\/d\//.test(url)) {
    return 'docs';
  }
  if (/^https:\/\/docs\.google\.com\/presentation\/d\//.test(url)) {
    return 'slides';
  }
  if (/^https:\/\/mail\.google\.com\//.test(url)) {
    return 'gmail';
  }
  return 'other';
};

async function activeTab() {
  if (forcedTabId) {
    return chrome.tabs.get(forcedTabId);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function applyStrings() {
  elements.capture.textContent = strings.popupCapture;
  elements.gmailExport.textContent = strings.popupGmailExport;
  elements.docsDesc.textContent = strings.popupHintDocs;
  elements.gmailDesc.textContent = strings.popupHintGmail;
  elements.advancedLabel.textContent = strings.popupAdvanced;
  elements.rangeLabel.textContent = strings.popupRange;
  elements.speedLabel.textContent = strings.popupSpeed;
  elements.speedFast.textContent = strings.popupSpeedFast;
  elements.speedNormal.textContent = strings.popupSpeedNormal;
  elements.speedSafe.textContent = strings.popupSpeedSafe;
  elements.filenameLabel.textContent = strings.popupFilename;
  elements.qualityLabel.textContent = strings.popupQuality;
  elements.imagesLabel.textContent = strings.popupSaveImages;
  elements.debugLabel.textContent = strings.popupDebug;
  elements.formatLabel.textContent = strings.popupGmailFormat;
  elements.formatMbox.textContent = strings.popupFormatMbox;
  elements.formatJson.textContent = strings.popupFormatJson;
  elements.formatXml.textContent = strings.popupFormatXml;
  elements.formatCsv.textContent = strings.popupFormatCsv;
  elements.formatHtml.textContent = strings.popupFormatHtml;
  elements.formatPdf.textContent = strings.popupFormatPdf;
  elements.formatTxt.textContent = strings.popupFormatTxt;
  elements.limitLabel.textContent = strings.popupGmailLimit;
  elements.attachmentsLabel.textContent = strings.popupGmailAttachments;
  elements.gmailCopy.textContent = strings.popupGmailCopy;
  elements.docsCancel.textContent = strings.popupCancel;
  elements.gmailCancel.textContent = strings.popupCancel;
  elements.gmailBatch.textContent = strings.popupGmailBatch;
  elements.limit.placeholder = strings.popupGmailLimitPlaceholder;
  elements.copyLogs.textContent = strings.popupCopyLogs;
  elements.docsTitle.textContent = strings.popupSiteDocs;
  elements.gmailTitle.textContent = strings.popupSiteGmail;
  elements.range.placeholder = strings.popupRangePlaceholder;
  elements.filename.placeholder = strings.popupFilenamePlaceholder;
}

function setStatus(element, textElement, text, running, isError) {
  textElement.textContent = text || '';
  element.classList.toggle('visible', Boolean(text));
  element.classList.toggle('running', Boolean(running));
  element.classList.toggle('error', Boolean(isError) && !running);
}

async function loadStrings() {
  try {
    const response = await chrome.runtime.sendMessage({ target: 'googleshot', method: 'strings' });
    if (response && response.ok && response.strings) {
      strings = { ...FALLBACK, ...response.strings };
      return response.status || strings.statusReady;
    }
  } catch {
    // fallbacks
  }
  return strings.statusReady;
}

function applySite(site) {
  currentSite = site;
  document.body.dataset.site = site;
  elements.siteIcon.innerHTML = ICONS[site] || ICONS.other;
  elements.site.classList.toggle('off', site === 'other');
  if (site === 'docs') {
    elements.siteLabel.textContent = strings.popupSiteDocs;
  } else if (site === 'slides') {
    elements.siteLabel.textContent = strings.popupSiteSlides;
  } else if (site === 'gmail') {
    elements.siteLabel.textContent = strings.popupSiteGmail;
  } else {
    elements.siteLabel.textContent = strings.popupSiteOther;
  }

  const isDocs = site === 'docs' || site === 'slides';
  const isGmail = site === 'gmail';
  elements.docsCard.hidden = !isDocs;
  elements.gmailCard.hidden = !isGmail;
  elements.advanced.hidden = !isDocs && !isGmail;
  elements.docsFields.hidden = !isDocs;
  elements.gmailFields.hidden = !isGmail;

  if (isDocs) {
    elements.docsTitle.textContent =
      site === 'slides' ? strings.popupSiteSlides : strings.popupSiteDocs;
    elements.docsDesc.textContent =
      site === 'docs' ? strings.popupHintDocs : strings.popupHintSlides;
  }
}

function renderState(state, site) {
  if (!state) {
    return;
  }
  const isGmail = state.action === 'gmail';
  const target = isGmail || site === 'gmail' ? elements.gmailStatus : elements.docsStatus;
  const text = isGmail || site === 'gmail' ? elements.gmailStatusText : elements.docsStatusText;
  const cancelButton = isGmail || site === 'gmail' ? elements.gmailCancel : elements.docsCancel;
  elements.docsCancel.hidden = true;
  elements.gmailCancel.hidden = true;
  if (state.running) {
    cancelButton.hidden = false;
    setStatus(target, text, state.message, true, false);
    return;
  }
  if (state.error) {
    setStatus(target, text, state.error, false, true);
    return;
  }
  if (state.message) {
    setStatus(target, text, state.message, false, false);
  }
}

async function refresh() {
  const version = chrome.runtime.getManifest().version;
  elements.version.textContent = 'v' + version;

  const status = await loadStrings();
  applyStrings();

  const values = await chrome.storage.local.get({
    preferredTool: 'auto',
    imageFolder: false,
    quality: 90,
    range: '',
    speed: 'normal',
    filename: '',
    format: 'mbox',
    limit: '',
    attachmentsOnly: false,
    debug: false,
  });

  const tab = await activeTab();
  const url = tab ? tab.url : '';
  const detected = forcedSite || detectSite(url);
  // The options page "preferred tool" only matters where detection finds
  // nothing: it decides which card an unsupported page shows.
  const site =
    detected === 'other' && (values.preferredTool === 'docs' || values.preferredTool === 'gmail')
      ? values.preferredTool
      : detected;
  gsLog('refresh-start', { version, site, url: url && url.slice(0, 60) });
  applySite(site);

  try {
    const state = await chrome.runtime.sendMessage({ target: 'googleshot', method: 'status' });
    if (state && state.ok) {
      if (state.state && state.state.running) {
        renderState(state.state, site);
      } else if (state.state && state.state.error && site !== 'other') {
        renderState(state.state, site);
      } else {
        const isDocs = site === 'docs' || site === 'slides';
        const isGmail = site === 'gmail';
        if (isDocs) {
          setStatus(elements.docsStatus, elements.docsStatusText, status, false, false);
        } else if (isGmail) {
          setStatus(elements.gmailStatus, elements.gmailStatusText, status, false, false);
        }
      }
    }
  } catch {
    // ignore
  }

  elements.images.checked = Boolean(values.imageFolder);
  elements.quality.value = String(values.quality);
  elements.range.value = values.range;
  elements.speed.value = values.speed;
  elements.filename.value = values.filename;
  elements.format.value = values.format || 'mbox';
  elements.limit.value = values.limit || '';
  elements.attachmentsOnly.checked = Boolean(values.attachmentsOnly);
  elements.debug.checked = Boolean(values.debug);
  syncLogsVisibility();
}

elements.capture.addEventListener('click', async () => {
  await chrome.storage.local.set({
    range: elements.range.value.trim(),
    speed: elements.speed.value,
    filename: elements.filename.value.trim(),
  });
  const tab = await activeTab();
  gsLog('capture-click', { tabId: tab && tab.id });
  chrome.runtime.sendMessage({
    target: 'googleshot',
    method: 'capture',
    tabId: tab ? tab.id : null,
  });
  window.close();
});

elements.gmailExport.addEventListener('click', async () => {
  const tab = await activeTab();
  gsLog('gmail-export-click', { tabId: tab && tab.id });
  elements.gmailExport.disabled = true;
  setStatus(elements.gmailStatus, elements.gmailStatusText, strings.statusStarting, true, false);
  await chrome.storage.local.set({
    format: elements.format.value,
    limit: elements.limit.value.trim(),
    attachmentsOnly: elements.attachmentsOnly.checked,
  });
  const response = await chrome.runtime
    .sendMessage({
      target: 'googleshot',
      method: 'gmail-export',
      tabId: tab ? tab.id : null,
      format: elements.format.value,
      limit: Number(elements.limit.value.trim()) || 0,
      attachmentsOnly: elements.attachmentsOnly.checked,
    })
    .catch(() => null);
  elements.gmailExport.disabled = false;
  if (response && response.ok) {
    setStatus(
      elements.gmailStatus,
      elements.gmailStatusText,
      `${response.count || 0} -> ${response.title || ''}`,
      false,
      false
    );
  } else {
    setStatus(
      elements.gmailStatus,
      elements.gmailStatusText,
      response && response.error ? response.error : strings.statusFailed,
      false,
      true
    );
  }
});

elements.gmailCopy.addEventListener('click', async () => {
  const tab = await activeTab();
  elements.gmailCopy.disabled = true;
  setStatus(elements.gmailStatus, elements.gmailStatusText, strings.statusStarting, true, false);
  const response = await chrome.runtime
    .sendMessage({ target: 'googleshot', method: 'gmail-copy', tabId: tab ? tab.id : null })
    .catch(() => null);
  elements.gmailCopy.disabled = false;
  if (response && response.ok) {
    await navigator.clipboard.writeText(response.text || '');
    setStatus(elements.gmailStatus, elements.gmailStatusText, strings.popupCopiedThread, false, false);
  } else {
    setStatus(
      elements.gmailStatus,
      elements.gmailStatusText,
      response && response.error ? response.error : strings.statusFailed,
      false,
      true
    );
  }
});

elements.gmailBatch.addEventListener('click', async () => {
  const tab = await activeTab();
  await chrome.storage.local.set({ format: elements.format.value });
  elements.gmailBatch.disabled = true;
  setStatus(elements.gmailStatus, elements.gmailStatusText, strings.statusStarting, true, false);
  const response = await chrome.runtime
    .sendMessage({
      target: 'googleshot',
      method: 'gmail-batch-export',
      tabId: tab ? tab.id : null,
      format: elements.format.value,
    })
    .catch(() => null);
  elements.gmailBatch.disabled = false;
  if (response && response.ok) {
    setStatus(
      elements.gmailStatus,
      elements.gmailStatusText,
      `${response.count} -> ${response.title || ''}`,
      false,
      false
    );
  } else {
    setStatus(
      elements.gmailStatus,
      elements.gmailStatusText,
      response && response.error ? response.error : strings.statusFailed,
      false,
      true
    );
  }
});

function requestCancel() {
  chrome.runtime.sendMessage({ target: 'googleshot', method: 'cancel' }).catch(() => {});
}

elements.docsCancel.addEventListener('click', requestCancel);
elements.gmailCancel.addEventListener('click', requestCancel);

document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

elements.copyLogs.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ target: 'googleshot', method: 'logs' });
  const text = JSON.stringify(response && response.logs ? response.logs : [], null, 1);
  await navigator.clipboard.writeText(text);
  elements.copyLogs.textContent = strings.popupCopied;
});

elements.images.addEventListener('change', () => {
  chrome.storage.local.set({ imageFolder: elements.images.checked });
});

elements.quality.addEventListener('change', () => {
  chrome.storage.local.set({ quality: Number(elements.quality.value) });
});

function syncLogsVisibility() {
  elements.logsSection.hidden = !elements.debug.checked;
}

elements.debug.addEventListener('change', () => {
  chrome.storage.local.set({ debug: elements.debug.checked });
  syncLogsVisibility();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.target === 'googleshot-popup' && message.state) {
    renderState(message.state, currentSite);
  }
});

refresh();
