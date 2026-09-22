import {
  DOC_EDITOR_SELECTOR,
  DOC_PAGE_SELECTOR,
  DOC_SCROLL_STEP,
  collectDocPages,
  docScrollByValue,
  docScrollToPosition,
  docSliceFor,
  slideIdFromHash,
  slideThumbId,
} from '../../shared/doc.js';
import { cleanTitle } from '../../shared/filename.js';

(() => {
  if (window.__googleshotChannel) {
    return;
  }
  window.__googleshotChannel = true;

  const DEFAULTS = {
    scanning: 'Scanning the document... $COUNT$ pages found',
    pagesFound: '$COUNT$ pages found',
    slidesFound: '$COUNT$ slides found',
    cancel: 'Cancel',
    cancelling: 'Cancelling...',
    notFound: 'Cannot find $THING$.',
    needSource: 'Open a Google Doc or a Google Slides deck first.',
    unknownMethod: 'Unknown GoogleShot action: $METHOD$.',
  };

  // The content script publishes the localized strings on the <html> element:
  // the main world cannot use chrome.i18n, and the page CSP blocks inline
  // scripts written through textContent.
  function readMessages() {
    try {
      const raw = document.documentElement.dataset.googleshotStrings;
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  const messages = readMessages();
  const fill = (template, token, value) => String(template || '').replace(token, String(value));
  const format = (template, count) => fill(template, '$COUNT$', count);
  const strings = {
    scanning: (count) => format(messages.scanning, count),
    pagesFound: (count) => format(messages.pagesFound, count),
    slidesFound: (count) => format(messages.slidesFound, count),
  };

  const SLIDE_CANVAS = '#canvas';
  const SLIDE_STRIP = '.punch-filmstrip-scroll';

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const isDoc = () => location.pathname.startsWith('/document/d/');
  const isSlides = () => location.pathname.startsWith('/presentation/d/');

  const pageTitle = () => cleanTitle(document.title);

  let toolbar = null;

  function createToolbar() {
    if (toolbar) {
      return;
    }
    const host = document.createElement('div');
    host.id = '__googleshot-host';
    host.style.cssText =
      'position:fixed;top:14px;right:14px;z-index:2147483647;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = [
      '.box { font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: #fff;',
      'background: #1a73e8; border-radius: 10px; padding: 10px 14px; width: 200px;',
      'box-shadow: 0 4px 18px rgba(0,0,0,.35); }',
      '.title { font-weight: 600; margin-bottom: 3px; }',
      '.status { opacity: .92; font-size: 12px; min-height: 30px; }',
      '.bar { height: 4px; background: rgba(255,255,255,.3); border-radius: 2px; margin-top: 8px; overflow: hidden; }',
      '.fill { height: 100%; width: 0%; background: #fff; transition: width .2s ease; }',
      '.actions { display: flex; justify-content: flex-end; margin-top: 9px; pointer-events: auto; }',
      '.cancel { font: inherit; font-size: 11px; font-weight: 500; color: #fff; background: rgba(255,255,255,.18);',
      'border: 1px solid rgba(255,255,255,.45); border-radius: 7px; padding: 4px 10px; cursor: pointer; }',
      '.cancel:hover { background: rgba(255,255,255,.3); }',
    ].join(' ');
    shadow.appendChild(style);

    const box = document.createElement('div');
    box.className = 'box';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = 'GoogleShot';
    const status = document.createElement('div');
    status.className = 'status';
    status.textContent = 'Starting...';
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('div');
    fill.className = 'fill';
    bar.appendChild(fill);
    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancel = document.createElement('button');
    cancel.className = 'cancel';
    cancel.textContent = messages.cancel || 'Cancel';
    cancel.addEventListener('click', () => {
      window.postMessage({ __googleshot: 'cancel' }, '*');
      cancel.disabled = true;
      status.textContent = messages.cancelling || 'Cancelling...';
    });
    actions.appendChild(cancel);
    box.appendChild(title);
    box.appendChild(status);
    box.appendChild(bar);
    box.appendChild(actions);
    shadow.appendChild(box);

    document.documentElement.appendChild(host);
    toolbar = {
      status,
      fill,
      cancel,
      remove: () => {
        host.remove();
        toolbar = null;
      },
    };
  }

  function show(message, percent) {
    createToolbar();
    toolbar.status.textContent = message;
    if (typeof percent === 'number') {
      toolbar.fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    }
  }

  function hide() {
    if (toolbar) {
      toolbar.remove();
    }
  }

  async function waitFor(selector, timeout = 45000) {
    const start = Date.now();
    for (;;) {
      const element = document.querySelector(selector);
      if (element && element.getBoundingClientRect().height > 0) {
        return element;
      }
      if (Date.now() - start > timeout) {
        throw new Error(fill(messages.notFound, '$THING$', selector));
      }
      await sleep(200);
    }
  }

  async function docScrollTo(value) {
    docScrollToPosition(value);
    await sleep(300);
  }

  async function docDiscoverPages() {
    const editor = await waitFor(DOC_EDITOR_SELECTOR);
    const seen = new Map();
    await docScrollTo(0);
    const collect = () => {
      for (const entry of collectDocPages()) {
        if (!seen.has(entry.index)) {
          seen.set(entry.index, entry.position);
        }
      }
    };
    collect();
    const limit = editor.scrollHeight;
    // Scroll in viewport-sized steps instead of fixed 400px: discovery is
    // ~3x faster on tall viewports and just as reliable.
    const step = Math.max(DOC_SCROLL_STEP, Math.floor(editor.clientHeight * 0.8));
    let count = 0;
    for (let position = 0; position <= limit; position += step) {
      await docScrollTo(position);
      collect();
      count += 1;
      if (count % 6 === 0) {
        show(strings.scanning(seen.size), Math.min(95, (position / limit) * 100));
      }
    }
    await docScrollTo(0);
    return Array.from(seen, ([index, offset]) => ({ index, offset })).sort(
      (a, b) => a.index - b.index
    );
  }

  async function docScrollBy(value) {
    docScrollByValue(value);
    await sleep(500);
  }

  async function slidesReady() {
    const canvas = await waitFor(SLIDE_CANVAS);
    await waitFor(SLIDE_STRIP);
    return canvas;
  }

  function slidesCollectVisibleIds(ids) {
    for (const thumbnail of document.querySelectorAll('.punch-filmstrip-thumbnail')) {
      const id = slideThumbId(thumbnail);
      if (id && !ids.includes(id)) {
        ids.push(id);
      }
    }
  }

  async function slidesCollectIds() {
    const strip = await waitFor(SLIDE_STRIP);
    const ids = [];
    slidesCollectVisibleIds(ids);
    const start = strip.scrollTop;
    const limit = strip.scrollHeight;
    let position = 0;
    let guard = 0;
    while (position <= limit && guard < 300) {
      guard += 1;
      strip.scrollTop = position;
      await sleep(250);
      slidesCollectVisibleIds(ids);
      position += Math.max(200, Math.floor(strip.clientHeight * 0.8));
    }
    strip.scrollTop = start;
    return ids;
  }

  async function slidesGoTo(id) {
    location.hash = `slide=id.${id}`;
    const start = Date.now();
    while (Date.now() - start < 10000) {
      if (slideIdFromHash() === id) {
        await sleep(450);
        return true;
      }
      await sleep(150);
    }
    return false;
  }

  async function slidesRect() {
    const canvas = await waitFor(SLIDE_CANVAS);
    const rect = canvas.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }

  async function handler(method, args) {
    if (method === 'colorScheme') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    if (method === 'describe') {
      if (isDoc()) {
        await waitFor(DOC_PAGE_SELECTOR);
        await waitFor(DOC_EDITOR_SELECTOR);
        return { kind: 'doc', title: pageTitle() };
      }
      if (isSlides()) {
        await slidesReady();
        return { kind: 'slides', title: pageTitle() };
      }
      throw new Error(messages.needSource);
    }
    if (method === 'pages') {
      if (isDoc()) {
        const pages = await docDiscoverPages();
        show(strings.pagesFound(pages.length), 0);
        return { kind: 'doc', pages };
      }
      const ids = await slidesCollectIds();
      show(strings.slidesFound(ids.length), 0);
      return { kind: 'slides', slides: ids.map((id, index) => ({ index, id })) };
    }
    if (method === 'docSlice') {
      return docSliceFor(Number(args.index));
    }
    if (method === 'docScrollTo') {
      docScrollToPosition(Number(args.value));
      return true;
    }
    if (method === 'docScrollBy') {
      await docScrollBy(Number(args.value));
      return true;
    }
    if (method === 'slideGoTo') {
      return slidesGoTo(args.id);
    }
    if (method === 'slideRect') {
      return slidesRect();
    }
    if (method === 'show') {
      show(args.message, args.percent);
      return true;
    }
    if (method === 'hide') {
      hide();
      return true;
    }
    throw new Error(fill(messages.unknownMethod, '$METHOD$', method));
  }

  window.addEventListener('message', async (event) => {
    if (event.source !== window) {
      return;
    }
    const data = event.data;
    if (!data || data.__googleshot !== 'call') {
      return;
    }
    try {
      const result = await handler(data.method, data.args || {});
      window.postMessage({ __googleshot: 'result', id: data.id, result }, '*');
    } catch (error) {
      window.postMessage(
        { __googleshot: 'result', id: data.id, error: error.message || String(error) },
        '*'
      );
    }
  });

  window.postMessage({ __googleshot: 'ready' }, '*');
})();
