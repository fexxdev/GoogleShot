const elements = {
  version: document.getElementById('version'),
  site: document.getElementById('site'),
  siteLabel: document.getElementById('siteLabel'),
  notice: document.getElementById('notice'),
  noticeText: document.getElementById('noticeText'),
  docsCard: document.getElementById('docsCard'),
  docsTitle: document.getElementById('docsTitle'),
  docsDesc: document.getElementById('docsDesc'),
  docsStatus: document.getElementById('docsStatus'),
  docsStatusText: document.getElementById('docsStatusText'),
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
  logsSection: document.getElementById('logsSection'),
  copyLogs: document.getElementById('copyLogs'),
};

const FALLBACK = {
  statusReady: 'Ready.',
  popupSiteDocs: 'Google Docs',
  popupSiteSlides: 'Google Slides',
  popupSiteGmail: 'Gmail',
  popupSiteOther: 'No supported site',
  popupHintDocs: 'Capture every page of this document as a PDF.',
  popupHintSlides: 'Capture every slide of this presentation as a PDF.',
  popupHintGmail: 'Download the open thread with the attachments as an .mbox file.',
  popupCapture: 'Capture this tab',
  popupGmailExport: 'Export this thread',
  popupOpenDocs: 'Open a Google Doc or a Slides deck',
  popupOpenGmail: 'Open Gmail',
  popupUnsupported: 'This tool needs a Google Doc, a Slides deck or a Gmail thread.',
  popupAdvanced: 'Advanced options',
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
  errGmailNotThread: 'Open a Gmail thread first.',
  errUnsupportedPage: "Doesn't work here. Open a Google Doc or a Google Slides deck.",
};

let strings = { ...FALLBACK };

const params = new URLSearchParams(location.search);
const forcedTabId = Number(params.get('tabId')) || null;
const forcedSite = ['docs', 'slides', 'gmail', 'other'].includes(params.get('site'))
  ? params.get('site')
  : null;

function gsLog(step, data) {
  console.log('[GS] popup:' + step, data === undefined ? '' : data);
  try {
    chrome.runtime.sendMessage({ target: 'googleshot', method: 'logs', popup: { step, data } });
  } catch {
    // ignore
  }
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
  elements.copyLogs.textContent = strings.popupCopyLogs;
  elements.noticeText.textContent = strings.popupUnsupported;
  elements.docsTitle.textContent = strings.popupSiteDocs;
  elements.gmailTitle.textContent = strings.popupSiteGmail;
  elements.range.placeholder = strings.popupRangePlaceholder;
  elements.filename.placeholder = strings.popupFilenamePlaceholder;
}

function setStatus(element, textElement, text, running, error) {
  textElement.textContent = text || '';
  element.classList.toggle('visible', Boolean(text));
  element.classList.toggle('running', Boolean(running));
  element.classList.toggle('error', Boolean(error) && !running);
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

function renderState(state, site) {
  if (!state || !state.running) {
    return;
  }
  const isGmail = state.action === 'gmail';
  if (site === 'gmail' || isGmail) {
    setStatus(elements.gmailStatus, elements.gmailStatusText, state.message, true, false);
  } else {
    setStatus(elements.docsStatus, elements.docsStatusText, state.message, true, false);
  }
}

async function refresh() {
  const version = chrome.runtime.getManifest().version;
  gsLog('refresh-start', { forcedTabId, version });
  elements.version.textContent = 'v' + version;

  const status = await loadStrings();
  applyStrings();

  const tab = await activeTab();
  const url = tab ? tab.url : '';
  const site = forcedSite || detectSite(url);
  gsLog('active-tab', { tabId: tab && tab.id, site, url });

  const isDocs = site === 'docs' || site === 'slides';
  const isGmail = site === 'gmail';

  if (isDocs) {
    elements.siteLabel.textContent = site === 'docs' ? strings.popupSiteDocs : strings.popupSiteSlides;
    elements.site.classList.remove('off');
  } else if (isGmail) {
    elements.siteLabel.textContent = strings.popupSiteGmail;
    elements.site.classList.remove('off');
  } else {
    elements.siteLabel.textContent = strings.popupSiteOther;
    elements.site.classList.add('off');
  }

  elements.docsCard.hidden = !isDocs;
  elements.gmailCard.hidden = !isGmail;
  elements.notice.classList.toggle('visible', !isDocs && !isGmail);
  elements.advanced.hidden = !isDocs && !isGmail;
  elements.docsFields.hidden = !isDocs;
  elements.logsSection.hidden = false;

  if (isDocs) {
    elements.docsDesc.textContent =
      site === 'docs' ? strings.popupHintDocs : strings.popupHintSlides;
    setStatus(elements.docsStatus, elements.docsStatusText, status, false, false);
  }
  if (isGmail) {
    setStatus(elements.gmailStatus, elements.gmailStatusText, status, false, false);
  }

  try {
    const state = await chrome.runtime.sendMessage({ target: 'googleshot', method: 'status' });
    if (state && state.ok) {
      renderState(state.state, site);
      if (state.state && !state.state.running && state.state.error && site !== 'other') {
        const target = state.state.action === 'gmail' ? elements.gmailStatus : elements.docsStatus;
        const text = state.state.action === 'gmail' ? elements.gmailStatusText : elements.docsStatusText;
        setStatus(target, text, state.state.error, false, true);
      }
    }
  } catch {
    // ignore
  }

  const values = await chrome.storage.local.get({
    imageFolder: false,
    quality: 90,
    range: '',
    speed: 'normal',
    filename: '',
  });
  elements.images.checked = Boolean(values.imageFolder);
  elements.quality.value = String(values.quality);
  elements.range.value = values.range;
  elements.speed.value = values.speed;
  elements.filename.value = values.filename;
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
  chrome.runtime.sendMessage({
    target: 'googleshot',
    method: 'gmail-export',
    tabId: tab ? tab.id : null,
  });
  window.close();
});

elements.notice.addEventListener('click', async () => {
  const tab = await activeTab();
  const url = tab ? tab.url : '';
  if (/^https:\/\/mail\.google\.com\//.test(url)) {
    chrome.tabs.create({ url: 'https://docs.google.com/' });
  } else {
    chrome.tabs.create({ url: 'https://mail.google.com/' });
  }
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

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.target === 'googleshot-popup' && message.state) {
    const site = message.state.action === 'gmail' ? 'gmail' : 'docs';
    renderState(message.state, site);
  }
});

refresh();
