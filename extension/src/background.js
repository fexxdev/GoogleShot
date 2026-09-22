import { PDFDocument } from 'pdf-lib';
import { captureTab } from './capture.js';

const state = {
  running: false,
  tabId: null,
  message: 'Ready',
  percent: 0,
  error: null,
};

function broadcast() {
  chrome.runtime.sendMessage({ target: 'googleshot-popup', state: { ...state } }).catch(() => {});
}

function setState(patch) {
  Object.assign(state, patch);
  broadcast();
}

async function runCapture(tabId) {
  if (state.running) {
    return { ok: false, error: 'A capture is already running.' };
  }
  state.running = true;
  state.tabId = tabId;
  state.error = null;
  setState({ message: 'Starting...', percent: 0 });
  try {
    const result = await captureTab(tabId, (message, percent) => {
      setState({ message, percent });
    });
    setState({ message: `Done. ${result.count} ${result.itemName}s.`, percent: 100 });
    return { ok: true, ...result };
  } catch (error) {
    setState({ message: 'Failed', percent: 0, error: error.message || String(error) });
    return { ok: false, error: error.message || String(error) };
  } finally {
    state.running = false;
    broadcast();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.target !== 'googleshot') {
    return undefined;
  }
  if (message.method === 'capture') {
    runCapture(message.tabId).then(sendResponse);
    return true;
  }
  if (message.method === 'status') {
    sendResponse({ ok: true, state: { ...state } });
    return true;
  }
  return undefined;
});
