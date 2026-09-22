import assert from 'node:assert/strict';
import test from 'node:test';
import { isDocSource, parseDocId, parseSlidesId, sanitizeFilename } from '../src/util.js';
import { systemColorScheme } from '../src/theme.js';

test('parseDocId accepts a document URL', () => {
  const id = '1uby7lvQyJtnuIioLKNPHqoo_p2eR6YHN1l2h73CzZIc';
  assert.equal(parseDocId(`https://docs.google.com/document/d/${id}/edit?tab=t.0`), id);
  assert.equal(parseDocId(id), id);
  assert.equal(parseDocId(`https://docs.google.com/document/d/${id}/preview`), id);
});

test('parseDocId rejects a presentation URL', () => {
  assert.throws(() => parseDocId('https://docs.google.com/presentation/d/abc1234567890123456789012/edit'));
});

test('parseSlidesId accepts a presentation URL', () => {
  const id = '1NvGU2Ms_hDI6mB9_JbS7lURscUyT59DY';
  assert.equal(parseSlidesId(`https://docs.google.com/presentation/d/${id}/edit#slide=id.p1`), id);
  assert.equal(parseSlidesId(id), id);
});

test('isDocSource detects documents only', () => {
  assert.equal(isDocSource('https://docs.google.com/document/d/abcdefghijklmnopqrstuvwx/edit'), true);
  assert.equal(isDocSource('https://docs.google.com/presentation/d/abcdefghijklmnopqrstuvwx/edit'), false);
  assert.equal(isDocSource(''), false);
  assert.equal(isDocSource(null), false);
});

test('sanitizeFilename cleans path characters', () => {
  assert.equal(sanitizeFilename('a/b:c*d?e"f<g>h|i'), 'a-b-c-d-e-f-g-h-i');
  assert.equal(sanitizeFilename('  spaced   name  '), 'spaced name');
  assert.equal(sanitizeFilename(''), 'presentation');
  assert.equal(sanitizeFilename(null), 'presentation');
  assert.equal(sanitizeFilename('x'.repeat(300)).length, 120);
});

test('systemColorScheme returns light or dark', () => {
  const scheme = systemColorScheme();
  assert.ok(scheme === 'light' || scheme === 'dark', `unexpected scheme: ${scheme}`);
  const previous = process.env.GOOGLESHOT_COLOR_SCHEME;
  process.env.GOOGLESHOT_COLOR_SCHEME = 'dark';
  assert.equal(systemColorScheme(), 'dark');
  process.env.GOOGLESHOT_COLOR_SCHEME = 'light';
  assert.equal(systemColorScheme(), 'light');
  if (previous === undefined) {
    delete process.env.GOOGLESHOT_COLOR_SCHEME;
  } else {
    process.env.GOOGLESHOT_COLOR_SCHEME = previous;
  }
});
