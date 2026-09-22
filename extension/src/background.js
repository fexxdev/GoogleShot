import { captureTab } from './capture.js';

const state = {
  running: false,
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
    unsupportedPage: t('errUnsupportedPage'),
    editorMissing: t('errEditorMissing'),
    slidesMissing: t('errSlidesMissing'),
    noPages: t('errNoPages'),
    noSlides: t('errNoSlides'),
    pageMissing: (number) => t('errPageMissing', number),
    pageCapture: (number) => t('errPageCapture', number),
    slideOpen: (number) => t('errSlideOpen', number),
    noActiveTab: t('errNoActiveTab'),
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

async function runCapture(tabId) {
  if (state.running) {
    return { ok: false, error: t('statusAlreadyRunning') };
  }
  const strings = buildStrings();
  state.running = true;
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
  if (message.method === 'strings') {
    sendResponse({ ok: true, strings: buildStrings(), status: t('statusReady') });
    return true;
  }
  return undefined;
});
