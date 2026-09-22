import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOptions, resolveSource, runCli } from '../src/cli.js';

const DOC_ID = '1uby7lvQyJtnuIioLKNPHqoo_p2eR6YHN1l2h73CzZIc';
const SLIDES_ID = '1NvGU2Ms_hDI6mB9_JbS7lURscUyT59DY';

test('parseOptions reads every flag', () => {
  const options = parseOptions(['src', '-o', 'out.pdf', '--images-dir', 'img', '--quality', '80', '--browser', 'chrome', '--restart', '--doc']);
  assert.equal(options.source, 'src');
  assert.equal(options.output, 'out.pdf');
  assert.equal(options.imagesDir, 'img');
  assert.equal(options.quality, '80');
  assert.equal(options.browser, 'chrome');
  assert.equal(options.restart, true);
  assert.equal(options.doc, true);
  assert.equal(options.slides, false);
});

test('parseOptions throws on a missing value', () => {
  for (const flag of ['-o', '--output', '--images-dir', '--quality', '--browser']) {
    assert.throws(() => parseOptions(['src', flag]), /Missing value/);
  }
});

test('parseOptions rejects --doc with --slides', () => {
  assert.throws(() => parseOptions(['src', '--doc', '--slides']), /either/);
});

test('parseOptions rejects a second positional argument', () => {
  assert.throws(() => parseOptions(['a', 'b']), /Unexpected argument/);
});

test('resolveSource detects the kind from the URL', () => {
  assert.deepEqual(
    resolveSource(`https://docs.google.com/document/d/${DOC_ID}/edit`),
    { kind: 'doc', id: DOC_ID }
  );
  assert.deepEqual(
    resolveSource(`https://docs.google.com/presentation/d/${SLIDES_ID}/edit`),
    { kind: 'slides', id: SLIDES_ID }
  );
});

test('resolveSource treats a bare ID as Slides unless --doc', () => {
  assert.deepEqual(resolveSource(SLIDES_ID), { kind: 'slides', id: SLIDES_ID });
  assert.deepEqual(resolveSource(DOC_ID, { doc: true }), { kind: 'doc', id: DOC_ID });
  assert.deepEqual(resolveSource(SLIDES_ID, { slides: true }), { kind: 'slides', id: SLIDES_ID });
});

test('resolveSource rejects garbage and empty input', () => {
  assert.throws(() => resolveSource('not-a-source'), /Cannot find/);
  assert.throws(() => resolveSource(null), /Missing/);
  assert.throws(() => resolveSource('https://example.com/foo'));
});

test('runCli prints help without exiting the process', async () => {
  assert.equal(await runCli(['--help'], { exit: false }), 0);
  assert.equal(await runCli([], { exit: false }), 0);
});

test('runCli rejects unknown commands', async () => {
  await assert.rejects(runCli(['frobnicate'], { exit: false }), /Unknown command/);
});
