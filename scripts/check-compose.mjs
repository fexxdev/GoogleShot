// Verification for the Docs compose pipeline against a mock Docs DOM.
//
// Checks both capture paths on a page of 816x1600 CSS px with 200px bands:
//   A. the real CLI function (src/capture.js docCapturePage)
//   B. the extension path (CDP clip at scale 1 + docComposeLayout + canvas)
//
// At DPR 2 the composed JPEG must be 1632x3200 (no stretch) and every sampled
// point must sit on a band colour (no white gaps, no overlapping slices).
//
// Run: npm run check:compose
import { chromium } from 'playwright';
import { docCapturePage } from '../src/capture.js';
import { docComposeLayout } from '../shared/doc.js';
import { jpegDimensions } from '../shared/jpeg.js';

const DPR = 2;
const PAGE_WIDTH = 816;
const PAGE_HEIGHT = 1600;
const BAND = 200;
const VIEWPORT = { width: 1200, height: 800 };

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function sampleColumn(page, base64) {
  return page.evaluate(
    async (data) => {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const points = [];
      for (let y = 10; y < canvas.height; y += 20) {
        const pixel = ctx.getImageData(Math.floor(canvas.width / 2), y, 1, 1).data;
        points.push([pixel[0], pixel[1], pixel[2]]);
      }
      return points;
    },
    base64
  );
}

function countMismatches(samples) {
  let mismatches = 0;
  for (const [red, green, blue] of samples) {
    const max = Math.max(red, green, blue);
    const min = Math.min(red, green, blue);
    if (max === 0 || (max - min) / max < 0.5) {
      mismatches += 1;
    }
  }
  return mismatches;
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: [`--force-device-scale-factor=${DPR}`],
});
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
const page = await context.newPage();

const bands = Array.from({ length: PAGE_HEIGHT / BAND }, (_, index) => {
  const hue = index * 40;
  return `<div style="height:${BAND}px;background:hsl(${hue},70%,50%)"></div>`;
}).join('');

// The parts of the Docs DOM the capture code reads: an editor to scroll and a
// paginated page whose number lives in style.zIndex.
await page.setContent(`
  <body style="margin:0">
    <div class="kix-appview-editor" style="position:absolute;inset:0;overflow-y:scroll;background:#eee">
      <div class="kix-page-paginated" style="z-index:0;position:relative;width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;margin:0 auto;background:#fff">
        ${bands}
      </div>
    </div>
  </body>
`);

// A. the CLI path
const cliImage = await docCapturePage(page, 0, 90);
assert(cliImage, 'docCapturePage returned null');
const cliSize = jpegDimensions(cliImage);
console.log(`CLI: ${cliSize.width}x${cliSize.height}`);
assert(cliSize.width === PAGE_WIDTH * DPR, `CLI width: expected ${PAGE_WIDTH * DPR}, got ${cliSize.width}`);
assert(cliSize.height === PAGE_HEIGHT * DPR, `CLI height: expected ${PAGE_HEIGHT * DPR}, got ${cliSize.height}`);
const cliMismatches = countMismatches(await sampleColumn(page, cliImage.toString('base64')));
assert(cliMismatches <= 2, `CLI: ${cliMismatches} sampled points are not on a band`);

// B. the extension path: CDP Page.captureScreenshot with clip scale 1, exactly
// like captureClip, then the same docComposeLayout the service worker uses.
await page.evaluate(() => {
  document.querySelector('.kix-appview-editor').scrollTop = 0;
});
const cdp = await context.newCDPSession(page);
const slices = [];
let covered = 0;
let guard = 0;
while (guard < 20 && covered < PAGE_HEIGHT - 2) {
  guard += 1;
  const slice = await page.evaluate(() => {
    const editor = document.querySelector('.kix-appview-editor');
    const rect = document.querySelector('.kix-page-paginated').getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    const top = Math.max(rect.top, editorRect.top + 1, 0);
    const bottom = Math.min(rect.bottom, editorRect.bottom - 1, window.innerHeight);
    return {
      x: rect.x,
      width: rect.width,
      height: rect.height,
      visibleTop: top - rect.top,
      visibleHeight: bottom - top,
      clipTop: top,
      clientHeight: editor.clientHeight,
    };
  });
  const sliceEnd = slice.visibleTop + slice.visibleHeight;
  const skip = Math.max(0, covered - slice.visibleTop);
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 90,
    fromSurface: true,
    captureBeyondViewport: false,
    clip: {
      x: Math.round(slice.x),
      y: Math.round(slice.clipTop + skip),
      width: Math.round(slice.width),
      height: Math.round(slice.visibleHeight - skip),
      scale: 1,
    },
  });
  const bytes = Buffer.from(shot.data, 'base64');
  const size = jpegDimensions(bytes);
  slices.push({
    offset: Math.round(slice.visibleTop + skip),
    clipWidth: Math.round(slice.width),
    pixelWidth: size.width,
    pixelHeight: size.height,
    image: shot.data,
  });
  covered = sliceEnd;
  if (covered >= PAGE_HEIGHT - 2) {
    break;
  }
  await page.evaluate((value) => {
    document.querySelector('.kix-appview-editor').scrollTop += value;
  }, slice.clientHeight - 80);
  await page.waitForTimeout(150);
}

const layout = docComposeLayout(slices, PAGE_WIDTH, PAGE_HEIGHT);
console.log(`extension: ${slices.length} slices, ${layout.width}x${layout.height}`);
assert(
  layout.width === PAGE_WIDTH * DPR && layout.height === PAGE_HEIGHT * DPR,
  `extension size: expected ${PAGE_WIDTH * DPR}x${PAGE_HEIGHT * DPR}, got ${layout.width}x${layout.height}`
);

const extBase64 = await page.evaluate(
  async ({ parts, plan }) => {
    const canvas = document.createElement('canvas');
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, plan.width, plan.height);
    for (let index = 0; index < parts.length; index += 1) {
      const image = new Image();
      image.src = `data:image/jpeg;base64,${parts[index].image}`;
      await image.decode();
      const placement = plan.placements[index];
      ctx.drawImage(image, 0, placement.y, placement.width, placement.height);
    }
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
  },
  { parts: slices, plan: layout }
);
const extMismatches = countMismatches(await sampleColumn(page, extBase64));
assert(extMismatches <= 2, `extension: ${extMismatches} sampled points are not on a band`);

await browser.close();
console.log('OK: both compose pipelines keep the page geometry');
