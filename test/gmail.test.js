import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMbox,
  collectThread,
  extractOriginalMessage,
  mergeAttachments,
  originalMessageUrl,
  toMboxEntry,
  unescapeHtml,
} from '../extension/src/gmail.js';

// a truncated message as Gmail returns it from view=om: attachment headers, no data
const SKELETON = [
  'Delivered-To: team.ledges@gmail.com',
  'Subject: sito Campo - Canu',
  'From: Erika <erika@coopcampo.it>',
  'To: team.ledges@gmail.com',
  'Date: Tue, 1 Sep 2026 12:40:42 +0000',
  'Message-ID: <abc@outlook.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="B1"',
  '',
  '--B1',
  'Content-Type: text/plain; charset="UTF-8"',
  '',
  'Ciao Ragazzi,',
  '',
  '--B1',
  'Content-Type: application/pdf; name="aiuti-2025.pdf"',
  'Content-Disposition: attachment; filename="aiuti-2025.pdf"; size=418532',
  'Content-Transfer-Encoding: base64',
  '',
  '',
  '--B1',
  'Content-Type: image/png; name="image001.png"',
  'Content-Disposition: attachment; filename="image001.png"',
  'Content-Transfer-Encoding: base64',
  '',
  '',
  '--B1--',
].join('\n');

test('unescapeHtml restores the entities Gmail uses', () => {
  assert.equal(unescapeHtml('a &lt;b&gt; &amp; &quot;c&quot;'), 'a <b> & "c"');
});

test('extractOriginalMessage returns the raw source from the pre block', () => {
  const escaped = SKELETON.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<html><body><div class="page-wrapper"><pre>${escaped}</pre></div></body></html>`;
  const message = extractOriginalMessage(html);
  assert.match(message, /Subject: sito Campo - Canu/);
  assert.match(message, /filename="aiuti-2025\.pdf"/);
  assert.match(message, /filename="image001\.png"/);
});

test('mergeAttachments fills the empty attachment bodies with the real base64', () => {
  const merged = mergeAttachments(SKELETON, ['JVBERi0xLjQK', 'iVBORw0KGgo=']);
  assert.match(merged, /filename="aiuti-2025\.pdf"; size=418532\nContent-Transfer-Encoding: base64\n\nJVBERi0xLjQK\n/);
  assert.match(merged, /filename="image001\.png"\nContent-Transfer-Encoding: base64\n\niVBORw0KGgo=\n/);
  // the text part must be untouched
  assert.match(merged, /Ciao Ragazzi,/);
});

test('mergeAttachments leaves the message alone without boundary or data', () => {
  assert.equal(mergeAttachments('Subject: x\n\nbody', []), 'Subject: x\n\nbody');
});

test('toMboxEntry uses the real sender and date in the separator', () => {
  const entry = toMboxEntry(SKELETON);
  assert.match(entry, /^From Erika <erika@coopcampo\.it> Tue, 1 Sep 2026 12:40:42 \+0000\n/);
});

test('buildMbox concatenates entries', () => {
  const mbox = buildMbox([SKELETON, SKELETON]);
  const separators = mbox.match(/^From /gm) || [];
  assert.equal(separators.length, 2);
});

test('originalMessageUrl keeps the permmsgid colon literal', () => {
  const url = originalMessageUrl({ authuser: 2, ik: 'abc', permmsgid: 'msg-f:123' });
  assert.equal(url, 'https://mail.google.com/mail/u/2/?ik=abc&view=om&permmsgid=msg-f:123');
});

test('collectThread stitches messages and their attachments', async () => {
  const escaped = SKELETON.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<html><body><pre>${escaped}</pre></body></html>`;
  const progress = [];
  const attachmentCalls = [];
  const entries = await collectThread({
    ik: 'ik1',
    authuser: 2,
    messages: [
      { id: 'msg-f:111', attachments: [{ attid: '0.1', url: 'https://x/att1' }] },
      { id: 'msg-a:222', attachments: [] },
    ],
    fetchText: async (url) => {
      assert.match(url, /permmsgid=msg-(f|a):(111|222)/);
      return html;
    },
    fetchBytes: async (url) => {
      attachmentCalls.push(url);
      return new Uint8Array([37, 80, 68, 70]); // %PDF
    },
    onProgress: (done, total) => progress.push([done, total]),
  });
  assert.equal(entries.length, 2);
  assert.deepEqual(attachmentCalls, ['https://x/att1']);
  assert.deepEqual(progress, [[1, 2], [2, 2]]);
  assert.match(entries[0], /JVBERg==/);
  const mbox = buildMbox(entries);
  assert.equal((mbox.match(/^From /gm) || []).length, 2);
});
