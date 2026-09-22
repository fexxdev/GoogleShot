import { sleep } from './util.js';

const CANVAS_SELECTOR = '#canvas';
const FILMSTRIP_SELECTOR = '.punch-filmstrip-scroll';
const DOC_EDITOR_SELECTOR = '.kix-appview-editor';
const DOC_TILES_SELECTOR = '.kix-rotatingtilemanager';
const DOC_PAGE_SELECTOR = '.kix-page-paginated';
const DOC_SCROLL_STEP = 400;

async function currentSlideId(page) {
  const match = page.url().match(/#slide=id\.([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function setZoomTo100(page) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+0' : 'Control+0');
  await sleep(600);
  const value = await page.evaluate(
    () => document.querySelector('#zoomSelect input')?.value || ''
  );
  if (value === '100%') {
    return;
  }
  const select = await page.locator('#zoomSelect').boundingBox();
  if (!select) {
    return;
  }
  await page.mouse.click(select.x + select.width / 2, select.y + select.height / 2);
  await sleep(800);
  const items = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.goog-menuitem'))
      .filter((item) => item.getBoundingClientRect().height > 0)
      .map((item) => {
        const rect = item.getBoundingClientRect();
        return {
          text: item.textContent.trim(),
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2,
        };
      })
  );
  const target = items.find((item) => item.text === '100%');
  if (target) {
    await page.mouse.click(target.x, target.y);
    await sleep(800);
  }
}

async function docPagePositions(page) {
  return page.evaluate(
    ({ tilesSelector, pageSelector }) => {
      const tiles = document.querySelector(tilesSelector);
      const content = tiles?.querySelector('.kix-rotatingtilemanager-content');
      if (!tiles || !content) {
        return [];
      }
      const base = tiles.offsetTop + content.offsetTop;
      return Array.from(document.querySelectorAll(pageSelector)).map((element) => ({
        index: Number(element.style.zIndex || 0),
        position: Math.round(base + element.offsetTop),
      }));
    },
    { tilesSelector: DOC_TILES_SELECTOR, pageSelector: DOC_PAGE_SELECTOR }
  );
}

async function docPageElement(page, number) {
  const domIndex = await page.evaluate(
    ({ pageSelector, wanted }) => {
      const pages = Array.from(document.querySelectorAll(pageSelector));
      for (let index = 0; index < pages.length; index += 1) {
        const rect = pages[index].getBoundingClientRect();
        const atTop = rect.top < 150 && rect.bottom > 150;
        if (atTop && Number(pages[index].style.zIndex || 0) === wanted) {
          return index;
        }
      }
      return -1;
    },
    { pageSelector: DOC_PAGE_SELECTOR, wanted: number }
  );
  return domIndex === -1 ? null : page.locator(DOC_PAGE_SELECTOR).nth(domIndex);
}

export async function captureDocument(
  context,
  documentId,
  { onProgress = () => {}, quality = 90 } = {}
) {
  const page = await context.newPage();
  let succeeded = false;
  try {
    await page.goto(`https://docs.google.com/document/d/${documentId}/edit`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    if (page.url().includes('accounts.google.com')) {
      throw new Error('Google login required in the selected browser.');
    }
    const title = (await page.title())
      .replace(/\s*-\s*(Documenti Google|Google Docs)\s*$/i, '')
      .trim();
    await page.locator(DOC_PAGE_SELECTOR).first().waitFor({ state: 'visible', timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    await sleep(1000);

    const editor = page.locator(DOC_EDITOR_SELECTOR).first();
    if ((await editor.count()) === 0) {
      throw new Error('Cannot find the document editor.');
    }
    onProgress(`Document: ${title || documentId}`);

    const byIndex = new Map();
    const remember = (list) => {
      for (const entry of list) {
        if (!byIndex.has(entry.index)) {
          byIndex.set(entry.index, entry.position);
        }
      }
    };
    remember(await docPagePositions(page));
    const scrollHeight = await editor.evaluate((element) => element.scrollHeight);
    let position = 0;
    let guard = 0;
    while (position < scrollHeight && guard < 2000) {
      guard += 1;
      await editor.evaluate((element, value) => {
        element.scrollTop = value;
      }, position);
      await sleep(350);
      remember(await docPagePositions(page));
      position += DOC_SCROLL_STEP;
    }
    if (byIndex.size === 0) {
      throw new Error('No pages found.');
    }
    const targets = Array.from(byIndex, ([index, targetPosition]) => ({
      index,
      position: targetPosition,
    })).sort((a, b) => a.index - b.index);

    const pages = [];
    for (const target of targets) {
      await editor.evaluate((element, value) => {
        element.scrollTop = Math.max(0, value);
      }, target.position - 70);
      await sleep(400);
      const locator = await docPageElement(page, target.index);
      if (!locator) {
        continue;
      }
      await locator.locator('canvas').first().waitFor({ state: 'visible', timeout: 15000 });
      await sleep(350);
      pages.push(await locator.screenshot({ type: 'jpeg', quality }));
      onProgress(`Page ${pages.length} of ${targets.length} captured`);
    }
    if (pages.length === 0) {
      throw new Error('No pages found.');
    }
    succeeded = true;
    return { title: title || documentId, items: pages };
  } finally {
    if (succeeded) {
      await page.close();
    }
  }
}

export async function capturePresentation(
  context,
  presentationId,
  { onProgress = () => {}, quality = 90 } = {}
) {
  const page = await context.newPage();
  let succeeded = false;
  try {
    await page.goto(`https://docs.google.com/presentation/d/${presentationId}/edit`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    if (page.url().includes('accounts.google.com')) {
      throw new Error('Google login required in the selected browser.');
    }
    const title = (await page.title())
      .replace(/\s*-\s*(Presentazioni Google|Google Slides)\s*$/i, '')
      .trim();
    await page.locator(CANVAS_SELECTOR).first().waitFor({ state: 'visible', timeout: 60000 });
    await setZoomTo100(page);
    const strip = await page.locator(FILMSTRIP_SELECTOR).first().boundingBox();
    if (!strip) {
      throw new Error('Cannot find the slide filmstrip.');
    }
    await page.mouse.click(strip.x + 60, strip.y + 40);
    await sleep(600);
    onProgress(`Presentation: ${title || presentationId}`);

    let guard = 0;
    while (guard < 2000) {
      const before = await currentSlideId(page);
      await page.keyboard.press('ArrowUp');
      await sleep(300);
      if ((await currentSlideId(page)) === before) {
        break;
      }
      guard += 1;
    }

    const slides = [];
    await page.evaluate(() => document.fonts.ready);
    guard = 0;
    while (guard < 2000) {
      guard += 1;
      await sleep(250);
      slides.push(await page.locator(CANVAS_SELECTOR).first().screenshot({ type: 'jpeg', quality }));
      onProgress(`Slide ${slides.length} captured`);

      const before = await currentSlideId(page);
      let moved = false;
      for (let attempt = 0; attempt < 2 && !moved; attempt += 1) {
        await page.keyboard.press('ArrowDown');
        for (let wait = 0; wait < 60; wait += 1) {
          await sleep(100);
          if ((await currentSlideId(page)) !== before) {
            moved = true;
            break;
          }
        }
      }
      if (!moved) {
        break;
      }
    }
    if (slides.length === 0) {
      throw new Error('No slides found.');
    }
    succeeded = true;
    return { title: title || presentationId, items: slides };
  } finally {
    if (succeeded) {
      await page.close();
    }
  }
}
