(() => {
  window.__googleshotGmail = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.target !== 'googleshot-gmail') {
      return undefined;
    }
    if (message.method === 'auth') {
      sendResponse({ ok: true, result: authInfo() });
      return true;
    }
    return undefined;
  });

  function authInfo() {
    const globals = window.GLOBALS || [];
    let account = typeof globals[10] === 'string' ? globals[10] : null;
    if (!account) {
      const match = document.documentElement.innerHTML.match(
        /"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"\s*,\s*"\d+"/
      );
      account = match ? match[1] : null;
    }
    return {
      threadId: threadIdFromUrl(),
      ik: typeof globals[9] === 'string' ? globals[9] : null,
      account,
    };
  }

  function threadIdFromUrl() {
    const hash = location.hash.replace(/^#/, '').split('?')[0];
    if (!hash) {
      return null;
    }
    for (const segment of hash.split('/')) {
      if (/^[A-Za-z0-9_-]{12,}$/.test(segment)) {
        return segment;
      }
    }
    return null;
  }
})();
