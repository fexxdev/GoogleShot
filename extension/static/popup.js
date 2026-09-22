const elements = {
  hint: document.getElementById('hint'),
  notice: document.getElementById('notice'),
  noticeText: document.getElementById('noticeText'),
  status: document.getElementById('status'),
  statusText: document.getElementById('statusText'),
  capture: document.getElementById('capture'),
  open: document.getElementById('open'),
  advanced: document.getElementById('advancedLabel'),
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
};

const FALLBACK = {
  popupCapture: 'Capture this tab',
  popupCaptureHint: 'Capture every slide of a deck or every page of a document.',
  popupOpenDocs: 'Open docs.google.com',
  popupSaveImages: 'Also save the JPEG images',
  popupQuality: 'JPEG quality',
  popupAdvanced: 'Advanced options',
  popupRange: 'Pages / slides',
  popupRangePlaceholder: 'All. Example: 1-5,8',
  popupSpeed: 'Capture speed',
  popupSpeedFast: 'Fast',
  popupSpeedNormal: 'Normal',
  popupSpeedSafe: 'Safe (slower)',
  popupFilename: 'File name',
  popupFilenamePlaceholder: 'Document title',
  popupUnsupported: 'Open a Google Doc or a Google Slides deck first.',
  statusReady: 'Ready.',
};

let strings = { ...FALLBACK };

const isGooglePage = (url) =>
  Boolean(url && /^https:\/\/docs\.google\.com\/(document|presentation)\/d\//.test(url));

const forcedTabId = Number(new URLSearchParams(location.search).get('tabId')) || null;

async function activeTab() {
  if (forcedTabId) {
    return chrome.tabs.get(forcedTabId);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function applyStrings() {
  elements.hint.textContent = strings.popupCaptureHint;
  elements.capture.textContent = strings.popupCapture;
  elements.open.textContent = strings.popupOpenDocs;
  elements.noticeText.textContent = strings.popupUnsupported;
  elements.advanced.textContent = strings.popupAdvanced;
  elements.rangeLabel.textContent = strings.popupRange;
  elements.speedLabel.textContent = strings.popupSpeed;
  elements.speedFast.textContent = strings.popupSpeedFast;
  elements.speedNormal.textContent = strings.popupSpeedNormal;
  elements.speedSafe.textContent = strings.popupSpeedSafe;
  elements.filenameLabel.textContent = strings.popupFilename;
  elements.qualityLabel.textContent = strings.popupQuality;
  elements.imagesLabel.textContent = strings.popupSaveImages;
  elements.range.placeholder = strings.popupRangePlaceholder;
  elements.filename.placeholder = strings.popupFilenamePlaceholder;
}

function setStatus(text, running) {
  elements.statusText.textContent = text || '';
  elements.status.classList.toggle('visible', Boolean(text));
  elements.status.classList.toggle('running', Boolean(running));
}

function render(state) {
  if (!state) {
    return;
  }
  if (state.running) {
    setStatus(state.message, true);
  } else if (state.error) {
    setStatus(state.error, false);
  } else {
    setStatus(state.message, false);
  }
}

async function loadStrings() {
  try {
    const response = await chrome.runtime.sendMessage({ target: 'googleshot', method: 'strings' });
    if (response && response.ok && response.strings) {
      strings = { ...FALLBACK, ...response.strings };
      return response.status || strings.statusReady;
    }
  } catch {
    // use the fallbacks
  }
  return strings.statusReady;
}

async function refresh() {
  const status = await loadStrings();
  applyStrings();

  const tab = await activeTab();
  const allowed = isGooglePage(tab ? tab.url : '');
  elements.notice.classList.toggle('visible', !allowed);
  elements.capture.disabled = !allowed;
  if (allowed) {
    setStatus(status, false);
  } else {
    setStatus('', false);
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
  chrome.runtime.sendMessage({
    target: 'googleshot',
    method: 'capture',
    tabId: tab ? tab.id : null,
  });
  window.close();
});

elements.open.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://docs.google.com/' });
  window.close();
});

elements.images.addEventListener('change', () => {
  chrome.storage.local.set({ imageFolder: elements.images.checked });
});

elements.quality.addEventListener('change', () => {
  chrome.storage.local.set({ quality: Number(elements.quality.value) });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.target === 'googleshot-popup' && message.state) {
    render(message.state);
  }
});

refresh();
