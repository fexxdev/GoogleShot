(() => {
  window.__googleshotContent = true;
  let counter = 0;
  const pending = new Map();
  let readyPromise = null;

  function injectPageScript() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('page.js');
      script.onload = () => {
        script.remove();
        resolve();
      };
      script.onerror = () => reject(new Error('Cannot inject the page script.'));
      (document.head || document.documentElement).appendChild(script);
    });
  }

  function injectStrings() {
    const template = (key) => (chrome.i18n.getMessage(key) || key).replace(/\$\w+\$/, '$COUNT$');
    const host = document.createElement('script');
    host.textContent = `window.__googleshotStrings = ${JSON.stringify({
      scanning: template('advScanningDocument'),
      pagesFound: template('advPagesFound'),
      slidesFound: template('advSlidesFound'),
    })};`;
    (document.head || document.documentElement).appendChild(host);
    host.remove();
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) {
      return;
    }
    const data = event.data;
    if (!data || data.__googleshot !== 'result' || !pending.has(data.id)) {
      return;
    }
    const entry = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) {
      entry.reject(new Error(data.error));
    } else {
      entry.resolve(data.result);
    }
  });

  async function ensureReady() {
    if (readyPromise) {
      return readyPromise;
    }
    readyPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The GoogleShot page script is not ready.')), 5000);
      const onReady = (event) => {
        if (event.source === window && event.data && event.data.__googleshot === 'ready') {
          clearTimeout(timer);
          window.removeEventListener('message', onReady);
          resolve();
        }
      };
      window.addEventListener('message', onReady);
      injectStrings();
      injectPageScript().catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    return readyPromise;
  }

  async function call(method, args = {}) {
    await ensureReady();
    if (method === 'pages') {
      injectStrings();
    }
    const id = String(++counter);
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      window.postMessage({ __googleshot: 'call', id, method, args }, '*');
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.target !== 'googleshot-page') {
      return undefined;
    }
    call(message.method, message.args)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
    return true;
  });
})();
