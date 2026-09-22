(() => {
  window.__googleshotGmail = true;

  let debugEnabled = false;
  try {
    chrome.storage.local.get({ debug: false }).then((values) => {
      debugEnabled = Boolean(values.debug);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.debug) {
        debugEnabled = Boolean(changes.debug.newValue);
      }
    });
  } catch {
    // storage not available
  }

  function debugLog(...args) {
    if (debugEnabled) {
      console.log('[GS]', ...args);
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.target !== 'googleshot-gmail') {
      return undefined;
    }
    if (message.method === 'auth') {
      const result = authInfo();
      debugLog('gmail-content:auth', result);
      sendResponse({ ok: true, result });
      return true;
    }
    if (message.method === 'messages') {
      const result = messages();
      debugLog('gmail-content:messages', result);
      sendResponse({ ok: true, result });
      return true;
    }
    return undefined;
  });

  function findIk() {
    if (typeof window.GM_ID_KEY === 'string' && window.GM_ID_KEY) {
      return window.GM_ID_KEY;
    }
    const globals = window.GLOBALS || [];
    if (typeof globals[9] === 'string' && globals[9]) {
      return globals[9];
    }
    const match = document.documentElement.outerHTML.match(/GM_ID_KEY\s*=\s*'([a-f0-9]+)'/i);
    return match ? match[1] : null;
  }

  function authInfo() {
    const globals = window.GLOBALS || [];
    let account = typeof globals[10] === 'string' ? globals[10] : null;
    if (!account) {
      const match = document.documentElement.innerHTML.match(
        /"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"\s*,\s*"\d+"/
      );
      account = match ? match[1] : null;
    }
    if (!account) {
      const fallback = document.documentElement.innerHTML.match(
        /[a-zA-Z0-9._%+-]+@(?:gmail|googlemail)\.[a-zA-Z]{2,}/
      );
      account = fallback ? fallback[0] : null;
    }
    return {
      threadId: threadIdFromUrl(),
      ik: findIk(),
      account,
      authuser: authuserFromUrl(),
    };
  }

  function authuserFromUrl() {
    const match = location.pathname.match(/^\/mail\/u\/(\d+)\//);
    return match ? Number(match[1]) : 0;
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

  function messages() {
    const byId = new Map();
    const addAttachment = (url) => {
      let parsed;
      try {
        parsed = new URL(url, location.origin);
      } catch {
        return;
      }
      const permmsgid = parsed.searchParams.get('permmsgid') || '';
      const attid = parsed.searchParams.get('attid') || '';
      const id = permmsgid.replace(/^#/, '');
      if (!id || !attid || !parsed.searchParams.get('view')?.startsWith('att')) {
        return;
      }
      if (!byId.has(id)) {
        byId.set(id, { id, attachments: [] });
      }
      const entry = byId.get(id);
      if (!entry.attachments.some((item) => item.attid === attid)) {
        entry.attachments.push({ attid, url: parsed.href });
      }
    };

    for (const element of document.querySelectorAll('[data-message-id]')) {
      const raw = element.getAttribute('data-message-id') || '';
      const id = raw.replace(/^#/, '');
      if (id && /^msg-(f|a|r)/.test(id) && !byId.has(id)) {
        byId.set(id, { id, attachments: [] });
      }
    }
    for (const anchor of document.querySelectorAll('a[href]')) {
      addAttachment(anchor.getAttribute('href'));
    }
    for (const element of document.querySelectorAll('*')) {
      for (const attribute of element.attributes || []) {
        if (/view=att|attid=/.test(attribute.value)) {
          addAttachment(attribute.value);
        }
      }
    }

    const items = Array.from(byId.values()).map((entry) => ({
      ...entry,
      attachments: entry.attachments
        .sort((a, b) => a.attid.localeCompare(b.attid, undefined, { numeric: true }))
        .map((attachment, index) => ({ ...attachment, index })),
    }));
    return items;
  }
})();
