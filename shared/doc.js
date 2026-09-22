export const DOC_EDITOR_SELECTOR = '.kix-appview-editor';
export const DOC_TILES_SELECTOR = '.kix-rotatingtilemanager';
export const DOC_CONTENT_SELECTOR = '.kix-rotatingtilemanager-content';
export const DOC_PAGE_SELECTOR = '.kix-page-paginated';
export const DOC_SCROLL_STEP = 400;

export function collectDocPages() {
  const tiles = document.querySelector('.kix-rotatingtilemanager');
  const content = tiles ? tiles.querySelector('.kix-rotatingtilemanager-content') : null;
  if (!tiles || !content) {
    return [];
  }
  const base = tiles.offsetTop + content.offsetTop;
  return Array.from(document.querySelectorAll('.kix-page-paginated')).map((element) => ({
    index: Number(element.style.zIndex || 0),
    position: Math.round(base + element.offsetTop),
  }));
}

export function docSliceFor(index) {
  const editor = document.querySelector('.kix-appview-editor');
  if (!editor) {
    return null;
  }
  const editorRect = editor.getBoundingClientRect();
  for (const element of document.querySelectorAll('.kix-page-paginated')) {
    if (Number(element.style.zIndex || 0) !== index) {
      continue;
    }
    const rect = element.getBoundingClientRect();
    const top = Math.max(rect.top, editorRect.top + 1, 0);
    const bottom = Math.min(rect.bottom, editorRect.bottom - 1, window.innerHeight);
    if (bottom <= top) {
      return null;
    }
    const canvas = element.querySelector('canvas.kix-canvas-tile-content');
    return {
      x: rect.x,
      width: rect.width,
      height: rect.height,
      scale: canvas && rect.width > 0 ? canvas.width / rect.width : window.devicePixelRatio || 1,
      visibleTop: top - rect.top,
      visibleHeight: bottom - top,
      clipTop: top,
      clientHeight: editor.clientHeight,
    };
  }
  return null;
}

export function docScrollToPosition(value) {
  const editor = document.querySelector('.kix-appview-editor');
  if (!editor) {
    throw new Error('Cannot find the document editor.');
  }
  editor.scrollTop = Math.max(0, value);
}

export function docScrollByValue(value) {
  const editor = document.querySelector('.kix-appview-editor');
  if (!editor) {
    throw new Error('Cannot find the document editor.');
  }
  editor.scrollTop += value;
}

export function docPageElementFor(index) {
  const pages = Array.from(document.querySelectorAll('.kix-page-paginated'));
  let best = -1;
  let bestDistance = Infinity;
  for (let position = 0; position < pages.length; position += 1) {
    if (Number(pages[position].style.zIndex || 0) !== index) {
      continue;
    }
    const rect = pages[position].getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      continue;
    }
    const distance = Math.abs(rect.top - 150);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = position;
    }
  }
  return best;
}

export function slideIdFromHash() {
  const match = location.hash.match(/slide=id\.([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function slideThumbId(thumbnail) {
  const direct = thumbnail.getAttribute('data-slide-page-id');
  if (direct) {
    return direct;
  }
  const match = (thumbnail.getAttribute('aria-label') || '').match(/#slide=id\.([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}
