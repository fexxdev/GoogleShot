const status = document.getElementById('status');
const capture = document.getElementById('capture');
const open = document.getElementById('open');
const unsupported = document.getElementById('unsupported');
const images = document.getElementById('images');
const quality = document.getElementById('quality');
const range = document.getElementById('range');
const speed = document.getElementById('speed');
const filename = document.getElementById('filename');

const isGooglePage = (url) =>
  Boolean(url && /^https:\/\/docs\.google\.com\/(document|presentation)\/d\//.test(url));

const forcedTabId = Number(new URLSearchParams(location.search).get('tabId')) || null;

let strings = null;

async function activeTab() {
  if (forcedTabId) {
    return chrome.tabs.get(forcedTabId);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function applyStrings() {
  for (const element of document.querySelectorAll('[data-i18n]')) {
    const key = element.getAttribute('data-i18n');
    if (strings[key]) {
      element.textContent = strings[key];
    }
  }
  if (strings.popupRangePlaceholder) {
    range.placeholder = strings.popupRangePlaceholder;
  }
  if (strings.popupFilenamePlaceholder) {
    filename.placeholder = strings.popupFilenamePlaceholder;
  }
}

function render(state) {
  if (!state) {
    return;
  }
  status.textContent = state.message || '';
  capture.disabled = Boolean(state.running);
}

async function refresh() {
  const response = await chrome.runtime.sendMessage({ target: 'googleshot', method: 'strings' });
  if (response && response.ok) {
    strings = response.strings;
    applyStrings();
    status.textContent = response.status;
  }
  const tab = await activeTab();
  const allowed = isGooglePage(tab ? tab.url : '');
  if (!allowed) {
    unsupported.style.display = 'block';
    status.textContent = strings ? strings.unsupportedPage : 'Unsupported page';
  }
  capture.disabled = !allowed;
  const values = await chrome.storage.local.get({
    imageFolder: false,
    quality: 90,
    range: '',
    speed: 'normal',
    filename: '',
  });
  images.checked = Boolean(values.imageFolder);
  quality.value = String(values.quality);
  range.value = values.range;
  speed.value = values.speed;
  filename.value = values.filename;
}

capture.addEventListener('click', async () => {
  await chrome.storage.local.set({
    range: range.value.trim(),
    speed: speed.value,
    filename: filename.value.trim(),
  });
  const tab = await activeTab();
  chrome.runtime.sendMessage({
    target: 'googleshot',
    method: 'capture',
    tabId: tab ? tab.id : null,
  });
  window.close();
});

open.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://docs.google.com/' });
  window.close();
});

images.addEventListener('change', () => {
  chrome.storage.local.set({ imageFolder: images.checked });
});

quality.addEventListener('change', () => {
  chrome.storage.local.set({ quality: Number(quality.value) });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.target === 'googleshot-popup' && message.state) {
    render(message.state);
  }
});

refresh();
