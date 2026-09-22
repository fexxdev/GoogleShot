import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanTitle, sanitizeFilename } from '../shared/filename.js';
import { docComposeLayout } from '../shared/doc.js';
import {
  buildCsv,
  collectThread,
  mimeParts,
  toMboxEntry,
} from '../extension/src/gmail.js';

test('cleanTitle strips the Google suffix in any language', () => {
  assert.equal(cleanTitle('My deck - Google Slides'), 'My deck');
  assert.equal(cleanTitle('Verbale - Documenti Google'), 'Verbale');
  assert.equal(cleanTitle('Compte-rendu - Google Docs'), 'Compte-rendu');
  assert.equal(cleanTitle('Bericht - Google Präsentationen'), 'Bericht');
  assert.equal(cleanTitle('Report Google Q3 - Google Docs'), 'Report Google Q3');
  assert.equal(cleanTitle('No suffix here'), 'No suffix here');
  assert.equal(cleanTitle(''), '');
  assert.equal(cleanTitle(null, 'fallback'), 'fallback');
});

test('docComposeLayout keeps device-pixel slices at their true height', () => {
  // A 816 CSS px page captured on a 2x display: the CDP bitmap is 1632 px
  // wide, so the canvas must be 2x and each slice drawn at its real size.
  const slices = [
    { offset: 0, clipWidth: 816, pixelWidth: 1632, pixelHeight: 1200 },
    { offset: 600, clipWidth: 816, pixelWidth: 1632, pixelHeight: 912 },
  ];
  const layout = docComposeLayout(slices, 816, 1056);
  assert.equal(layout.width, 1632);
  assert.equal(layout.height, 2112);
  assert.deepEqual(layout.placements, [
    { y: 0, width: 1632, height: 1200 },
    { y: 1200, width: 1632, height: 912 },
  ]);
});

test('docComposeLayout handles CSS-scale bitmaps and a scrolled first slice', () => {
  const slices = [{ offset: 400, clipWidth: 816, pixelWidth: 816, pixelHeight: 656 }];
  const layout = docComposeLayout(slices, 816, 1056);
  assert.equal(layout.width, 816);
  assert.equal(layout.height, 1056);
  assert.deepEqual(layout.placements, [{ y: 0, width: 816, height: 656 }]);
});

test('docComposeLayout falls back to 1 when the clip width is unknown', () => {
  const slices = [{ offset: 0, clipWidth: 0, pixelWidth: 816, pixelHeight: 1056 }];
  const layout = docComposeLayout(slices, 816, 1056);
  assert.equal(layout.width, 816);
  assert.equal(layout.height, 1056);
});

test('sanitizeFilename keeps the caller fallback', () => {
  assert.equal(sanitizeFilename('a/b', 'fallback'), 'a-b');
  assert.equal(sanitizeFilename('', 'gmail-thread'), 'gmail-thread');
  assert.equal(sanitizeFilename(null), 'googleshot');
});

test('sanitizeFilename drops control characters and trailing dots', () => {
  assert.equal(sanitizeFilename('re\u0000port\u001f.pdf'), 'report.pdf');
  assert.equal(sanitizeFilename('Ends with dots...'), 'Ends with dots');
  assert.equal(sanitizeFilename('...'), 'googleshot');
});

test('toMboxEntry escapes body lines starting with From', () => {
  const entry = toMboxEntry('From: a@b.c\nDate: Tue, 1 Sep 2026 12:40:42 +0000\n\nHello\nFrom mars\n');
  assert.match(entry, /^From a@b\.c /m);
  assert.match(entry, /^>From mars$/m);
  assert.doesNotMatch(entry, /^From mars$/m);
});

test('buildCsv starts with a BOM for Excel', () => {
  const csv = buildCsv([
    { date: 'd', from: 'f', to: 't', cc: '', subject: 'sà', attachments: [], body: 'b' },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv.slice(1), /^date,from,to,cc,subject,attachments,body$/m);
});

test('collectThread counts skipped messages', async () => {
  const entries = await collectThread({
    ik: 'ik1',
    authuser: 0,
    messages: [{ id: 'msg-f:1', attachments: [] }],
    fetchText: async () => '<html><body>no pre block here</body></html>',
    fetchBytes: async () => new Uint8Array(),
  });
  assert.equal(entries.length, 0);
  assert.equal(entries.skipped, 1);
});

test('mimeParts decodes RFC 2231 filenames', () => {
  const message = [
    'Content-Type: multipart/mixed; boundary="B1"',
    '',
    '--B1',
    'Content-Type: application/pdf',
    "Content-Disposition: attachment; filename*=utf-8''%E2%82%ACrates.pdf",
    'Content-Transfer-Encoding: base64',
    '',
    'JVBERg==',
    '',
    '--B1--',
  ].join('\n');
  const parts = mimeParts(message);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].filename, '€rates.pdf');
});
