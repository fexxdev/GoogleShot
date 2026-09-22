import { sleep } from './util.js';

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
    return { title: title || presentationId, slides };
  } finally {
    if (succeeded) {
      await page.close();
    }
  }
}
