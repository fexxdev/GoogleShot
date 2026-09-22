import { sleep } from './util.js';
import {
  DOC_EDITOR_SELECTOR,
  DOC_PAGE_SELECTOR,
  DOC_SCROLL_STEP,
  collectDocPages,
  docPageElementFor,
  docScrollByValue,
  docScrollToPosition,
  docSliceFor,
} from '../shared/doc.js';

const CANVAS_SELECTOR = '#canvas';
const FILMSTRIP_SELECTOR = '.punch-filmstrip-scroll';

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

async function docCapturePage(page, number, quality) {
  const editor = page.locator(DOC_EDITOR_SELECTOR).first();
  const slices = [];
  let covered = 0;
  let pageHeight = null;
  let pageWidth = null;
  let pageScale = 1;
  let guard = 0;
  while (guard < 20 && (pageHeight === null || covered < pageHeight - 2)) {
    guard += 1;
    const slice = await page.evaluate(docSliceFor, number);
    if (!slice) {
      break;
    }
    pageHeight = slice.height;
    pageWidth = slice.width;
    pageScale = slice.scale;
    const sliceEnd = slice.visibleTop + slice.visibleHeight;
    if (sliceEnd <= covered + 2) {
      break;
    }
    const skip = Math.max(0, covered - slice.visibleTop);
    const clipHeight = slice.visibleHeight - skip;
    if (clipHeight <= 0) {
      break;
    }
    const image = await page.screenshot({
      type: 'jpeg',
      quality,
      clip: {
        x: slice.x,
        y: slice.clipTop + skip,
        width: slice.width,
        height: clipHeight,
      },
    });
    slices.push({
      offset: Math.round(slice.visibleTop + skip),
      image: image.toString('base64'),
    });
    covered = sliceEnd;
    if (covered >= pageHeight - 2) {
      break;
    }
    await page.evaluate(docScrollByValue, slice.clientHeight - 80);
    await sleep(700);
  }
  if (slices.length === 0 || pageHeight === null || pageWidth === null) {
    return null;
  }
  const base64 = await page.evaluate(
    async ({ parts, height, width, scale, quality: jpegQuality }) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const anchor = Math.min(...parts.map((part) => part.offset));
      for (const part of parts) {
        const image = new Image();
        image.src = `data:image/jpeg;base64,${part.image}`;
        await image.decode();
        ctx.drawImage(image, 0, Math.round((part.offset - anchor) * scale), canvas.width, image.height);
      }
      return canvas.toDataURL('image/jpeg', jpegQuality / 100).split(',')[1];
    },
    { parts: slices, height: Math.round(pageHeight), width: pageWidth, scale: pageScale, quality }
  );
  return Buffer.from(base64, 'base64');
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
    remember(await page.evaluate(collectDocPages));
    const scrollHeight = await editor.evaluate((element) => element.scrollHeight);
    let position = 0;
    let guard = 0;
    while (position < scrollHeight && guard < 2000) {
      guard += 1;
      await page.evaluate(docScrollToPosition, position);
      await sleep(350);
      remember(await page.evaluate(collectDocPages));
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
      await page.evaluate(docScrollToPosition, target.position - 70);
      await sleep(400);
      let locator = null;
      for (let attempt = 0; attempt < 3 && !locator; attempt += 1) {
        const domIndex = await page.evaluate(docPageElementFor, target.index);
        if (domIndex !== -1) {
          locator = page.locator(DOC_PAGE_SELECTOR).nth(domIndex);
        } else {
          await sleep(400);
        }
      }
      if (!locator) {
        throw new Error(`Cannot find page ${target.index + 1} in the document.`);
      }
      await locator.locator('canvas').first().waitFor({ state: 'visible', timeout: 15000 });
      const image = await docCapturePage(page, target.index, quality);
      if (!image) {
        throw new Error(`Cannot capture page ${target.index + 1}.`);
      }
      pages.push(image);
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
