import { sleep } from './util.js';

const CANVAS_SELECTOR = '#canvas';
const FILMSTRIP_SELECTOR = '.punch-filmstrip-scroll';
const DOC_EDITOR_SELECTOR = '.kix-appview-editor';
const DOC_PAGE_SELECTOR = '.kix-page-paginated';

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

async function scrollDocToPage(page, index) {
  await page.evaluate(
    ({ pageIndex, editorSelector, tilesSelector, pageSelector }) => {
      const editor = document.querySelector(editorSelector);
      const tiles = editor?.querySelector(tilesSelector);
      const target = document.querySelectorAll(pageSelector)[pageIndex];
      if (!editor || !tiles || !target) {
        return;
      }
      let top = 0;
      let node = target;
      while (node && node !== tiles) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
      editor.scrollTop = Math.max(0, top - tiles.offsetTop - 20);
    },
    {
      pageIndex: index,
      editorSelector: DOC_EDITOR_SELECTOR,
      tilesSelector: '.kix-rotatingtilemanager',
      pageSelector: DOC_PAGE_SELECTOR,
    }
  );
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

    if ((await page.locator(DOC_EDITOR_SELECTOR).count()) === 0) {
      throw new Error('Cannot find the document editor.');
    }

    const total = await page.locator(DOC_PAGE_SELECTOR).count();
    if (total === 0) {
      throw new Error('No pages found.');
    }
    onProgress(`Document: ${title || documentId}`);

    const pages = [];
    for (let index = 0; index < total; index += 1) {
      await scrollDocToPage(page, index);
      const canvas = page.locator(DOC_PAGE_SELECTOR).nth(index).locator('canvas').first();
      await canvas.waitFor({ state: 'visible', timeout: 30000 });
      await sleep(400);
      pages.push(
        await page.locator(DOC_PAGE_SELECTOR).nth(index).screenshot({ type: 'jpeg', quality })
      );
      onProgress(`Page ${pages.length} of ${total} captured`);
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
