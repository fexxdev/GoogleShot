const status = document.getElementById('status');
const fill = document.getElementById('fill');
const error = document.getElementById('error');
const capture = document.getElementById('capture');
const open = document.getElementById('open');
const images = document.getElementById('images');

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

function render(state) {
  if (!state) {
    return;
  }
  status.textContent = state.message || 'Ready.';
  fill.style.width = `${state.percent || 0}%`;
  if (state.error) {
    error.hidden = false;
    error.textContent = state.error;
  } else {
    error.hidden = true;
  }
  capture.disabled = Boolean(state.running);
}

async function refresh() {
  const tab = await activeTab();
  const allowed = isGooglePage(tab ? tab.url : '');
  capture.disabled = !allowed;
  if (!allowed) {
    status.textContent = 'Open a Google Doc or a Google Slides deck first.';
  } else {
    const response = await chrome.runtime.sendMessage({ target: 'googleshot', method: 'status' });
    if (response && response.ok) {
      render(response.state);
    }
  }
  const values = await chrome.storage.local.get({ imageFolder: false });
  images.checked = Boolean(values.imageFolder);
}

capture.addEventListener('click', async () => {
  error.hidden = true;
  capture.disabled = true;
  status.textContent = 'Starting...';
  const tab = await activeTab();
  const response = await chrome.runtime.sendMessage({
    target: 'googleshot',
    method: 'capture',
    tabId: tab ? tab.id : null,
  });
  if (response && response.ok) {
    status.textContent = `Done. ${response.count} ${response.itemName}s.`;
  } else {
    status.textContent = 'Failed.';
    error.hidden = false;
    error.textContent = (response && response.error) || 'Unknown error.';
  }
  capture.disabled = false;
});

open.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://docs.google.com/' });
  window.close();
});

images.addEventListener('change', () => {
  chrome.storage.local.set({ imageFolder: images.checked });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message && message.target === 'googleshot-popup' && message.state) {
    render(message.state);
  }
});

refresh();
