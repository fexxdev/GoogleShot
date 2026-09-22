import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildAttachmentsZip,
  buildCsv,
  buildHtml,
  buildJson,
  buildMbox,
  buildPdf,
  buildText,
  buildThreadsZip,
  buildXml,
  collectThread,
  extractOriginalMessage,
  mergeAttachments,
  mimeParts,
  originalMessageUrl,
  toMboxEntry,
  unescapeHtml,
} from '../extension/src/gmail.js';

const SKELETON = [
  'Delivered-To: team.ledges@gmail.com',
  'Subject: =?iso-8859-1?Q?sito_Campo_-_Can=F9?=',
  'From: Erika <erika@coopcampo.it>',
  'To: team.ledges@gmail.com',
  'Date: Tue, 1 Sep 2026 12:40:42 +0000',
  'Message-ID: <abc@outlook.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="B1"',
  '',
  '--B1',
  'Content-Type: text/plain; charset="UTF-8"',
  'Content-Transfer-Encoding: base64',
  '',
  'Q2lhbyBSYWdhenppLA==',
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

const PDF_B64 = 'JVBERg==';

test('unescapeHtml restores the entities Gmail uses', () => {
  assert.equal(unescapeHtml('a &lt;b&gt; &amp; &quot;c&quot;'), 'a <b> & "c"');
});

test('extractOriginalMessage returns the raw source from the pre block', () => {
  const escaped = SKELETON.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<html><body><div class="page-wrapper"><pre>${escaped}</pre></div></body></html>`;
  const message = extractOriginalMessage(html);
  assert.match(message, /Subject:/);
  assert.match(message, /filename="aiuti-2025\.pdf"/);
});

test('mergeAttachments fills the empty attachment bodies with the real base64', () => {
  const merged = mergeAttachments(SKELETON, [PDF_B64, 'iVBORw0KGgo=']);
  assert.match(merged, /JVBERg==/);
  assert.match(merged, /iVBORw0KGgo=/);
});

test('mimeParts parses the attachments of the raw message', () => {
  const merged = mergeAttachments(SKELETON, [PDF_B64, 'iVBORw0KGgo=']);
  const parts = mimeParts(merged);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].filename, 'aiuti-2025.pdf');
  assert.equal(parts[0].mimeType, 'application/pdf');
  assert.equal(parts[0].base64, PDF_B64);
  assert.equal(parts[1].filename, 'image001.png');
});

test('toMboxEntry uses the real sender and date in the separator', () => {
  const entry = toMboxEntry(SKELETON);
  assert.match(entry, /^From Erika <erika@coopcampo\.it> Tue, 1 Sep 2026 12:40:42 \+0000\n/);
});

async function collected() {
  const escaped = SKELETON.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<html><body><pre>${escaped}</pre></body></html>`;
  return collectThread({
    ik: 'ik1',
    authuser: 2,
    messages: [{ id: 'msg-f:111', attachments: [{ attid: '0.1', url: 'https://x/att1' }] }],
    fetchText: async () => html,
    fetchBytes: async () => new Uint8Array([37, 80, 68, 70]),
  });
}

test('collectThread returns structured entries', async () => {
  const entries = await collected();
  assert.equal(entries.length, 1);
  const entry = entries[0];
  assert.equal(entry.subject, 'sito Campo - Canù');
  assert.match(entry.from, /erika@coopcampo\.it/);
  assert.equal(entry.body.trim(), 'Ciao Ragazzi,');
  assert.equal(entry.attachments.length, 1);
  assert.equal(entry.attachments[0].filename, 'aiuti-2025.pdf');
  assert.equal(entry.attachments[0].base64, PDF_B64);
});

test('buildMbox produces one entry per message with a From separator', async () => {
  const entries = await collected();
  const mbox = buildMbox(entries);
  assert.equal((mbox.match(/^From /gm) || []).length, 1);
  assert.match(mbox, /JVBERg==/);
});

test('buildMbox still accepts raw strings', () => {
  const mbox = buildMbox([SKELETON]);
  assert.equal((mbox.match(/^From /gm) || []).length, 1);
});

test('buildJson includes metadata and base64 attachments', async () => {
  const entries = await collected();
  const json = JSON.parse(buildJson(entries, { account: 'team.ledges@gmail.com' }));
  assert.equal(json.messageCount, 1);
  assert.equal(json.account, 'team.ledges@gmail.com');
  assert.equal(json.messages[0].subject, 'sito Campo - Canù');
  assert.equal(json.messages[0].attachments[0].filename, 'aiuti-2025.pdf');
  assert.equal(json.messages[0].attachments[0].contentBase64, PDF_B64);
  assert.equal(json.messages[0].attachments[0].size, 4);
});

test('buildXml is valid and escapes the content', async () => {
  const entries = await collected();
  const xml = buildXml(entries, { account: 'a@b.c' });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<subject>sito Campo - Canù<\/subject>/);
  assert.match(xml, /<attachment filename="aiuti-2025\.pdf" mimeType="application\/pdf" encoding="base64">JVBERg==<\/attachment>/);
  assert.equal((xml.match(/<message>/g) || []).length, 1);
});

test('buildCsv produces a header and one row per message', async () => {
  const entries = await collected();
  const csv = buildCsv(entries);
  const lines = csv.split('\n');
  assert.match(lines[0], /^date,from,to,cc,subject,attachments,body$/);
  assert.match(lines[1], /aiuti-2025\.pdf/);
  assert.match(lines[1], /"Ciao Ragazzi,/);
});

test('buildHtml escapes the body and lists attachments', async () => {
  const entries = await collected();
  const html = buildHtml(entries);
  assert.match(html, /<!doctype html>/);
  assert.match(html, /sito Campo - Canù/);
  assert.match(html, /aiuti-2025\.pdf/);
});

test('originalMessageUrl keeps the permmsgid colon literal', () => {
  const url = originalMessageUrl({ authuser: 2, ik: 'abc', permmsgid: 'msg-f:123' });
  assert.equal(url, 'https://mail.google.com/mail/u/2/?ik=abc&view=om&permmsgid=msg-f:123');
});

test('buildText writes a readable thread with attachments', async () => {
  const entries = await collected();
  const text = buildText(entries);
  assert.match(text, /Da: .*erika@coopcampo\.it/);
  assert.match(text, /Oggetto: sito Campo - Canù/);
  assert.match(text, /Ciao Ragazzi,/);
  assert.match(text, /\[allegato\] aiuti-2025\.pdf/);
});

test('buildPdf produces a valid PDF', async () => {
  const entries = await collected();
  const pdf = await buildPdf(entries);
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-');
  assert.ok(pdf.length > 500);
});

test('buildAttachmentsZip packs the attachments', async () => {
  const entries = await collected();
  const zip = buildAttachmentsZip(entries);
  assert.equal(Buffer.from(zip.slice(0, 2)).toString(), 'PK');
  assert.ok(zip.length > 50);
});

test('buildAttachmentsZip renames duplicates', async () => {
  const entries = await collected();
  const doubled = [entries[0], entries[0]];
  const zip = buildAttachmentsZip(doubled);
  assert.equal(Buffer.from(zip.slice(0, 2)).toString(), 'PK');
  assert.ok(zip.length > 50);
});

test('buildThreadsZip packs one file per thread', () => {
  const zip = buildThreadsZip({
    'thread one.mbox': new TextEncoder().encode('x'),
    'thread two.mbox': new TextEncoder().encode('y'),
  });
  assert.equal(Buffer.from(zip.slice(0, 2)).toString(), 'PK');
  assert.ok(zip.length > 50);
});
