import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMbox, collectThread, extractBody, messageToMbox } from '../extension/src/gmail.js';

function part(mimeType, data, extra = {}) {
  return {
    mimeType,
    filename: extra.filename || '',
    body: data === null ? {} : { data },
    ...(extra.parts ? { parts: extra.parts } : {}),
  };
}

const b64 = (text) => Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_');

function decodeBodyText(mbox) {
  const separator = mbox.indexOf('\r\n\r\n');
  if (separator === -1) {
    return '';
  }
  const headers = mbox.slice(0, separator);
  if (!headers.includes('Content-Transfer-Encoding: base64')) {
    return '';
  }
  const payload = mbox.slice(separator + 4).split(/\r\n--/)[0].trim();
  return Buffer.from(payload, 'base64').toString('utf8');
}

test('extractBody reads a simple text/plain payload', () => {
  const payload = part('text/plain', b64('Ciao mondo'));
  assert.equal(extractBody(payload), 'Ciao mondo');
});

test('extractBody reads a multipart payload and prefers the first text part', () => {
  const payload = {
    mimeType: 'multipart/alternative',
    parts: [part('text/plain', b64('plain body')), part('text/html', b64('<p>html body</p>'))],
  };
  assert.equal(extractBody(payload), 'plain body');
});

test('extractBody ignores attachments', () => {
  const payload = {
    mimeType: 'multipart/mixed',
    parts: [
      part('text/plain', b64('the body')),
      { mimeType: 'application/pdf', filename: 'a.pdf', body: { attachmentId: 'att-1' } },
    ],
  };
  assert.equal(extractBody(payload), 'the body');
});

test('messageToMbox writes headers and a body', () => {
  const message = {
    id: 'm1',
    internalDate: '1700000000000',
    payload: {
      headers: [
        { name: 'Subject', value: 'Preventivo' },
        { name: 'From', value: 'Ledges <team.ledges@gmail.com>' },
        { name: 'To', value: 'cliente@example.com' },
        { name: 'Date', value: 'Wed, 13 Sep 2026 10:00:00 +0200' },
        { name: 'Message-ID', value: '<abc@mail.gmail.com>' },
      ],
    },
  };
  const mbox = messageToMbox(message, { body: 'Testo\nseconda riga', attachments: [] });
  assert.match(mbox, /^From Ledges <team\.ledges@gmail\.com> Wed, 13 Sep 2026/);
  assert.match(mbox, /Subject: Preventivo/);
  assert.match(mbox, /Message-ID: <abc@mail\.gmail\.com>/);
  assert.match(mbox, /Content-Type: text\/plain/);
  assert.match(mbox, /\r\n\r\n$/);
});

test('messageToMbox escapes From lines in the body', () => {
  const message = { id: 'm2', payload: { headers: [{ name: 'From', value: 'a@b.c' }] } };
  const mbox = messageToMbox(message, { body: 'From here\n>From there', attachments: [] });
  const body = decodeBodyText(mbox);
  assert.match(body, />From here/);
  assert.match(body, /^>From there/m);
});

test('messageToMbox includes attachments as multipart blocks', () => {
  const message = { id: 'm3', payload: { headers: [{ name: 'From', value: 'a@b.c' }] } };
  const mbox = messageToMbox(message, {
    body: 'see attached',
    attachments: [
      { filename: 'doc.pdf', mimeType: 'application/pdf', bytes: new Uint8Array([1, 2, 3, 4]) },
    ],
  });
  assert.match(mbox, /multipart\/mixed/);
  assert.match(mbox, /Content-Disposition: attachment; filename="doc\.pdf"/);
  assert.match(mbox, /Content-Type: application\/pdf/);
});

test('buildMbox concatenates messages with From separators', () => {
  const entry = (id) => ({
    message: { id, payload: { headers: [{ name: 'From', value: `${id}@x.y` }] } },
    body: `body ${id}`,
    attachments: [],
  });
  const mbox = buildMbox([entry('m1'), entry('m2')]);
  const separators = mbox.match(/^From /gm) || [];
  assert.equal(separators.length, 2);
  const parts = mbox.split(/(?=^From )/m);
  const decoded = parts.map((part) => decodeBodyText(part));
  assert.deepEqual(decoded, ['body m1', 'body m2']);
});

test('collectThread walks messages and downloads attachments', async () => {
  const attachmentBytes = new Uint8Array([72, 105]);
  const thread = {
    messages: [
      {
        id: 'm1',
        payload: {
          headers: [{ name: 'Subject', value: 'Hi' }, { name: 'From', value: 'a@b.c' }],
          mimeType: 'multipart/mixed',
          parts: [
            part('text/plain', b64('hello')),
            { mimeType: 'image/jpeg', filename: 'image001.jpg', body: { attachmentId: 'att-9' } },
          ],
        },
      },
    ],
  };
  const jsonResponse = (payload) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload),
  });
  const calls = [];
  const fetchFn = async (url) => {
    calls.push(url);
    if (url.includes('/threads/')) {
      return jsonResponse(thread);
    }
    if (url.includes('/attachments/att-9')) {
      return jsonResponse({
        data: Buffer.from(attachmentBytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      });
    }
    return { ok: false, status: 404, text: async () => 'not found' };
  };
  const progress = [];
  const entries = await collectThread({
    ik: 'ik',
    account: 'me@x.y',
    threadId: 't1',
    fetchFn,
    onProgress: (done, total) => progress.push([done, total]),
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].body, 'hello');
  assert.equal(entries[0].attachments.length, 1);
  assert.equal(entries[0].attachments[0].filename, 'image001.jpg');
  assert.deepEqual(Array.from(entries[0].attachments[0].bytes), [72, 105]);
  assert.deepEqual(progress, [[1, 1]]);
  assert.equal(calls.length, 2);
});
