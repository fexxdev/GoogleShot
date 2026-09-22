import assert from 'node:assert/strict';
import test from 'node:test';
import { isDocSource, parseDocId, parseSlidesId, sanitizeFilename } from '../src/util.js';
import { systemColorScheme } from '../src/theme.js';
import { filterSelection, parseRange } from '../shared/range.js';
import { t } from '../src/i18n.js';

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

test('parseRange handles lists and intervals', () => {
  assert.deepEqual(parseRange(''), null);
  assert.deepEqual(parseRange('2'), [2]);
  assert.deepEqual(parseRange('1-3'), [1, 2, 3]);
  assert.deepEqual(parseRange('3,1-2,5'), [1, 2, 3, 5]);
  assert.deepEqual(parseRange(' 2 - 4 '), [2, 3, 4]);
  assert.throws(() => parseRange('0'));
  assert.throws(() => parseRange('4-2'));
  assert.throws(() => parseRange('x'));
});

test('filterSelection keeps the chosen pages', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(filterSelection(items, null), items);
  assert.deepEqual(filterSelection(items, [2, 4]), ['b', 'd']);
  assert.deepEqual(filterSelection(items, [9]), []);
});

test('t localizes and substitutes', () => {
  const previous = process.env.GOOGLESHOT_LANG;
  process.env.GOOGLESHOT_LANG = 'it';
  assert.equal(t('noPages'), 'Nessuna pagina trovata.');
  assert.equal(t('cannotFindPage', 3), 'Impossibile trovare la pagina 3 nel documento.');
  process.env.GOOGLESHOT_LANG = 'en';
  assert.equal(t('noPages'), 'No pages found.');
  assert.equal(t('cannotFindPage', 3), 'Cannot find page 3 in the document.');
  assert.equal(t('unknownKey'), 'unknownKey');
  if (previous === undefined) {
    delete process.env.GOOGLESHOT_LANG;
  } else {
    process.env.GOOGLESHOT_LANG = previous;
  }
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
