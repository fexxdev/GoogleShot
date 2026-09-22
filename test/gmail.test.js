import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMbox,
  collectThread,
  extractOriginalMessage,
  originalMessageUrl,
  unescapeHtml,
} from '../extension/src/gmail.js';

const SAMPLE_RFC822 = [
  'Return-Path: <erika@example.com>',
  'Received: from example.com',
  'Subject: sito Campo - Canu',
  'From: Erika <erika@example.com>',
  'To: team.ledges@gmail.com',
  'Date: Tue, 1 Sep 2026 14:40:00 +0200',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset="UTF-8"',
  '',
  'Ciao Ragazzi,',
  '',
  '--b1',
  'Content-Type: application/pdf; name="aiuti-2025.pdf"',
  'Content-Disposition: attachment; filename="aiuti-2025.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  'JVBERi0xLjQK',
  '--b1--',
].join('\n');

test('unescapeHtml restores the entities Gmail uses', () => {
  assert.equal(unescapeHtml('a &lt;b&gt; &amp; &quot;c&quot;'), 'a <b> & "c"');
});

test('extractOriginalMessage unescapes the entities inside the pre block', () => {
  // Gmail escapes < > as entities but keeps quotes readable
  const escaped = SAMPLE_RFC822.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<html><body><div class="page-wrapper"><pre>${escaped}</pre></div></body></html>`;
  const message = extractOriginalMessage(html);
  assert.match(message, /^From nobody@example\.com\n/);
  assert.match(message, /Subject: sito Campo - Canu/);
  assert.match(message, /Content-Disposition: attachment; filename="aiuti-2025\.pdf"/);
  assert.match(message, /JVBERi0xLjQK/);
});

test('extractOriginalMessage rejects a page without the source', () => {
  assert.throws(() => extractOriginalMessage('<html><body>nothing</body></html>'));
});

test('originalMessageUrl builds the view=om url', () => {
  const url = originalMessageUrl({ authuser: 2, ik: 'abc', permmsgid: 'msg-f:123' });
  assert.match(url, /\/mail\/u\/2\//);
  assert.match(url, /view=om/);
  assert.match(url, /permmsgid=msg-f%3A123/);
  assert.match(url, /ik=abc/);
});

test('collectThread fetches every message and joins them', async () => {
  const html = (subject) => {
    const raw = SAMPLE_RFC822.replace('sito Campo - Canu', subject);
    const escaped = raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    return `<html><body><pre>${escaped}</pre></body></html>`;
  };
  const calls = [];
  const progress = [];
  const blocks = await collectThread({
    ik: 'ik1',
    authuser: 2,
    messageIds: ['111', '222', '333'],
    fetchText: async (url) => {
      calls.push(url);
      return html(`msg ${calls.length}`);
    },
    onProgress: (done, total) => progress.push([done, total]),
  });
  assert.equal(blocks.length, 3);
  assert.equal(calls.length, 3);
  assert.deepEqual(progress, [[1, 3], [2, 3], [3, 3]]);
  const mbox = buildMbox(blocks);
  const separators = mbox.match(/^From /gm) || [];
  assert.equal(separators.length, 3);
  assert.match(mbox, /msg 1/);
  assert.match(mbox, /msg 3/);
});
