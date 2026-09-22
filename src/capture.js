import { sleep } from './util.js';

const EDIT_BASE = (id) => `https://docs.google.com/presentation/d/${id}`;

export async function capturePresentation(context, presentationId, { onProgress = () => {} } = {}) {
  const page = await context.newPage();
  try {
    await page.goto(`${EDIT_BASE(presentationId)}/edit`, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('accounts.google.com')) {
      throw new Error('Google login required. Run "googleshot login" first.');
    }

    const thumbnails = page.locator('[aria-label^="Slide "][role="listitem"], .punch-filmstrip-thumbnail');
    await thumbnails.first().waitFor({ state: 'visible', timeout: 60000 });

    const title = await readTitle(page);
    const labels = await thumbnails.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('aria-label') || '')
    );
    const total = labels.length;
    onProgress(`Presentation: ${title}`);
    onProgress(`Slides found: ${total}`);

    const pageIds = [];
    for (let index = 0; index < total; index += 1) {
      const label = index === 0 ? /^Slide 1\b/ : new RegExp(`^Slide ${index + 1}\\b`);
      const thumbnail = page.locator('[aria-label]', { hasText: label }).first();
      await thumbnail.scrollIntoViewIfNeeded();
      await thumbnail.click();
      const pageId = await waitForHash(page, index);
      pageIds.push(pageId);
      onProgress(`Slide ${index + 1}/${total}`);
    }

    const slides = [];
    for (let index = 0; index < pageIds.length; index += 1) {
      const response = await context.request.get(
        `${EDIT_BASE(presentationId)}/export/png?pageid=${encodeURIComponent(pageIds[index])}`
      );
      if (!response.ok()) {
        throw new Error(`PNG export failed for slide ${index + 1}: HTTP ${response.status()}`);
      }
      const buffer = await response.body();
      if (buffer.length < 8 || buffer[1] !== 0x50 || buffer[2] !== 0x4e || buffer[3] !== 0x47) {
        throw new Error(`PNG export returned no image for slide ${index + 1}.`);
      }
      slides.push(buffer);
    }

    return { title, slides };
  } finally {
    await page.close();
  }
}

async function readTitle(page) {
  const raw = await page.title();
  return raw.replace(/\s*-\s*Google Slides\s*$/, '').trim() || 'presentation';
}

async function waitForHash(page, index) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const match = page.url().match(/#slide=id\.([a-zA-Z0-9_-]+)/);
    if (match) {
      return match[1];
    }
    await sleep(250);
  }
  throw new Error(`Cannot read the page id of slide ${index + 1}.`);
}
