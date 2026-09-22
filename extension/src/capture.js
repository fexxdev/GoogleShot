import { PDFDocument } from 'pdf-lib';
import { checkCancelled } from './cancel.js';
import { filterSelection, parseRange } from '../../shared/range.js';
import { sanitizeFilename } from '../../shared/filename.js';

const PAGE_WIDTH = 960;
const DEBUGGER_VERSION = '1.3';
const DEFAULT_QUALITY = 90;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeSleep(multiplier) {
  if (multiplier === 1) {
    return sleep;
  }
  return (ms) => new Promise((resolve) => setTimeout(resolve, ms * multiplier));
}


function sendCommand(target, method, params = {}, timeout = 60000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`${method} timed out.`));
      }
    }, timeout);
    chrome.debugger.sendCommand(target, method, params, (result) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(result);
    });
  });
}

async function pageCall(tabId, method, args = {}) {
  const response = await chrome.tabs.sendMessage(tabId, {
    target: 'googleshot-page',
    method,
    args,
  });
  if (!response) {
    throw new Error('The page did not answer. Reload the Google Doc or Slides tab.');
  }
  if (!response.ok) {
    throw new Error(response.error || 'Page error.');
  }
  return response.result;
}

async function ensurePageScript(tabId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => Boolean(window.__googleshotContent),
    });
    if (result && result[0] && result[0].result) {
      return;
    }
  } catch {
    // continue and try to inject
  }
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js'],
  });
}

function captureClip(target, clip, quality) {
  return sendCommand(target, 'Page.captureScreenshot', {
    format: 'jpeg',
    quality,
    fromSurface: true,
    captureBeyondViewport: false,
    clip: {
      x: Math.round(clip.x),
      y: Math.round(clip.y),
      width: Math.round(clip.width),
      height: Math.round(clip.height),
      scale: 1,
    },
  });
}

async function compose(slices, pageWidth, pageHeight, scale, quality) {
  const images = [];
  for (const slice of slices) {
    const blob = await (await fetch(`data:image/jpeg;base64,${slice.data}`)).blob();
    const bitmap = await createImageBitmap(blob);
    images.push({ bitmap, offset: slice.offset });
  }
  // Slices are captured at CSS pixel size (CDP clip scale 1); the canvas is
  // in tile backing-store pixels, so every bitmap is drawn scaled by the
  // same factor. Drawing at natural size here used to squash the page
  // whenever the tile scale differed from 1.
  const width = Math.ceil(pageWidth * scale);
  const height = Math.ceil(pageHeight * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  const anchor = Math.min(...images.map((image) => image.offset));
  for (const image of images) {
    ctx.drawImage(
      image.bitmap,
      0,
      Math.round((image.offset - anchor) * scale),
      width,
      Math.round(image.bitmap.height * scale)
    );
    image.bitmap.close();
  }
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality / 100 });
  return new Uint8Array(await blob.arrayBuffer());
}

async function captureDoc(target, tabId, settings) {
  const { onProgress, quality, strings, errors, range, sleep } = settings;
  onProgress(strings.findingPages, 2);
  const { pages: allPages } = await pageCall(tabId, 'pages');
  const pages = filterSelection(allPages, range);
  if (!pages.length) {
    throw new Error(errors.noPages);
  }
  const images = [];
  for (let position = 0; position < pages.length; position += 1) {
    checkCancelled();
    const page = pages[position];
    const pageNumber = (page.index ?? position) + 1;
    await pageCall(tabId, 'docScrollTo', { value: page.offset - 70 });
    await sleep(450);
    const slices = [];
    let covered = 0;
    let pageHeight = null;
    let pageWidth = null;
    let pageScale = 1;
    let guard = 0;
    for (;;) {
      checkCancelled();
      guard += 1;
      if (guard > 20 || (pageHeight !== null && covered >= pageHeight - 2)) {
        break;
      }
      const slice = await pageCall(tabId, 'docSlice', { index: page.index });
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
      const shot = await captureClip(
        target,
        {
          x: slice.x,
          y: slice.clipTop + skip,
          width: slice.width,
          height: clipHeight,
        },
        quality
      );
      slices.push({ offset: Math.round(slice.visibleTop + skip), data: shot.data });
      covered = sliceEnd;
      if (covered >= pageHeight - 2) {
        break;
      }
      await pageCall(tabId, 'docScrollBy', { value: slice.clientHeight - 80 });
    }
    if (slices.length === 0 || !pageHeight) {
      throw new Error(errors.pageCapture(pageNumber));
    }
    const image = await compose(slices, pageWidth, pageHeight, pageScale, quality);
    images.push(image);
    const message = strings.capturingPage(position + 1, pages.length);
    const percent = 5 + ((position + 1) / pages.length) * 80;
    onProgress(message, percent);
    pageCall(tabId, 'show', { message, percent }).catch(() => {});
  }
  return { images, itemName: 'page' };
}

async function captureSlides(target, tabId, settings) {
  const { onProgress, quality, strings, errors, range, sleep } = settings;
  onProgress(strings.findingSlides, 2);
  const { slides: allSlides } = await pageCall(tabId, 'pages');
  const slides = filterSelection(allSlides, range);
  if (!slides.length) {
    throw new Error(errors.noSlides);
  }
  const images = [];
  for (let position = 0; position < slides.length; position += 1) {
    checkCancelled();
    const slide = slides[position];
    const slideNumber = (slide.index ?? position) + 1;
    const arrived = await pageCall(tabId, 'slideGoTo', { id: slide.id });
    if (!arrived) {
      throw new Error(errors.slideOpen(slideNumber));
    }
    await sleep(600);
    const rect = await pageCall(tabId, 'slideRect');
    const shot = await captureClip(target, rect, quality);
    const blob = await (await fetch(`data:image/jpeg;base64,${shot.data}`)).blob();
    images.push(new Uint8Array(await blob.arrayBuffer()));
    const message = strings.capturingSlide(position + 1, slides.length);
    const percent = 5 + ((position + 1) / slides.length) * 80;
    onProgress(message, percent);
    pageCall(tabId, 'show', { message, percent }).catch(() => {});
  }
  return { images, itemName: 'slide' };
}

async function buildPdf(images) {
  const pdf = await PDFDocument.create();
  for (const bytes of images) {
    const image = await pdf.embedJpg(bytes);
    const width = PAGE_WIDTH;
    const height = (width * image.height) / image.width;
    const page = pdf.addPage([width, height]);
    page.drawImage(image, { x: 0, y: 0, width, height });
  }
  return new Blob([await pdf.save()], { type: 'application/pdf' });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Cannot read the file.'));
    reader.readAsDataURL(blob);
  });
}

async function downloadPdf(blob, filename) {
  const url = await blobToDataUrl(blob);
  await chrome.downloads.download({ url, filename });
}

async function downloadImages(images, folderName, itemName) {
  const queue = images.map((image, index) => ({
    bytes: image,
    filename: `${folderName}/${itemName}-${String(index + 1).padStart(3, '0')}.jpg`,
  }));
  for (let offset = 0; offset < queue.length; offset += 4) {
    const batch = queue.slice(offset, offset + 4);
    const results = await Promise.allSettled(
      batch.map(async (item) => {
        const blob = new Blob([item.bytes], { type: 'image/jpeg' });
        const url = await blobToDataUrl(blob);
        await chrome.downloads.download({ url, filename: item.filename });
      })
    );
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
      throw new Error(failed.reason && failed.reason.message
        ? `Cannot save ${batch[results.indexOf(failed)].filename}: ${failed.reason.message}`
        : 'Cannot save the JPEG images.');
    }
    if (offset + 4 < queue.length) {
      await sleep(200);
    }
  }
}

export async function captureTab(tabId, options = {}) {
  const { onProgress = () => {}, strings, errors } = options;
  if (!tabId) {
    throw new Error(errors.noActiveTab);
  }
  if (!strings || !errors) {
    throw new Error('Missing strings.');
  }
  const tab = await chrome.tabs.get(tabId);
  if (!tab || !tab.url || !tab.url.includes('docs.google.com')) {
    throw new Error(errors.unsupportedPage);
  }

  await ensurePageScript(tabId);
  const target = { tabId };
  let attached = false;
  try {
    await chrome.debugger.attach(target, DEBUGGER_VERSION);
    attached = true;

    const {
      quality: storedQuality,
      imageFolder,
      range,
      speed,
      filename,
    } = await chrome.storage.local.get({
      quality: DEFAULT_QUALITY,
      imageFolder: false,
      range: '',
      speed: 'normal',
      filename: '',
    });
    const quality = Math.min(100, Math.max(1, Number(storedQuality) || DEFAULT_QUALITY));
    const multiplier = speed === 'fast' ? 0.5 : speed === 'safe' ? 1.75 : 1;
    const sleep = makeSleep(multiplier);
    let selected;
    try {
      selected = parseRange(range);
    } catch {
      throw new Error(errors.invalidRange);
    }
    const description = await pageCall(tabId, 'describe');
    const settings = { onProgress, quality, strings, errors, range: selected, sleep };
    const result =
      description.kind === 'doc'
        ? await captureDoc(target, tabId, settings)
        : await captureSlides(target, tabId, settings);

    onProgress(strings.buildingPdf, 90);
    const baseName = sanitizeFilename(filename || description.title);
    const pdf = await buildPdf(result.images);
    if (imageFolder) {
      await downloadImages(result.images, `${baseName}_${result.itemName}s`, result.itemName);
    }
    await downloadPdf(pdf, `${baseName}.pdf`);
    await pageCall(tabId, 'hide');
    onProgress(strings.done, 100);
    return { count: result.images.length, itemName: result.itemName, title: description.title };
  } catch (error) {
    try {
      await pageCall(tabId, 'hide');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    if (attached) {
      try {
        await chrome.debugger.detach(target);
      } catch {
        // ignore
      }
    }
  }
}
