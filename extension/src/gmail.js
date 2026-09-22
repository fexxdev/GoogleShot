import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { zipSync } from 'fflate';
const GMAIL_ORIGIN = 'https://mail.google.com';

const HTML_ENTITIES = {
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function unescapeHtml(value) {
  return String(value || '').replace(
    /&(?:lt|gt|amp|quot|#39|apos|nbsp);/g,
    (entity) => HTML_ENTITIES[entity] || entity
  );
}

export function extractOriginalMessage(html, label = '') {
  const source = String(html || '');
  const match = source.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) {
    throw new Error(`No original message for ${label || 'a message'} (drafts and some message types have none).`);
  }
  const message = unescapeHtml(match[1]).replace(/\r\n/g, '\n').replace(/\n+$/, '\n');
  const separator = /^From .*\n/.test(message) ? '' : `From nobody@example.com\n`;
  return `${separator}${message}\n`;
}

export function originalMessageUrl({ authuser = 0, ik, permmsgid }) {
  const parts = ['view=om', `permmsgid=${permmsgid}`];
  if (ik) {
    parts.unshift(`ik=${ik}`);
  }
  return `${GMAIL_ORIGIN}/mail/u/${Number(authuser) || 0}/?${parts.join('&')}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function splitHeaderBody(part) {
  const index = part.indexOf('\n\n');
  if (index === -1) {
    return { headers: part, body: '' };
  }
  return { headers: part.slice(0, index), body: part.slice(index + 2) };
}

export function mergeAttachments(message, attachmentData) {
  const boundaryMatch = message.match(/boundary="?([^"\s;]+)"?/);
  if (!boundaryMatch) {
    return message;
  }
  const boundary = boundaryMatch[1];
  let dataIndex = 0;
  const chunks = message.split(`--${boundary}`);
  const rebuilt = chunks.map((chunk) => {
    const { headers, body } = splitHeaderBody(chunk);
    if (!/filename="/.test(headers) || !/base64/i.test(headers)) {
      return chunk;
    }
    const base64 = attachmentData[dataIndex];
    dataIndex += 1;
    if (!base64) {
      return chunk;
    }
    const wrapped = (base64.match(/.{1,76}/g) || ['']).join('\n');
    return `${headers}\n\n${wrapped}\n`;
  });
  return rebuilt.join(`--${boundary}`);
}

export function toMboxEntry(message) {
  const normalized = message.replace(/\r\n/g, '\n').replace(/\n+$/, '\n');
  const fromMatch = normalized.match(/^From:\s*(.+)$/m);
  const dateMatch = normalized.match(/^Date:\s*(.+)$/m);
  const sender = fromMatch ? fromMatch[1].trim() : 'nobody@example.com';
  const date = dateMatch ? dateMatch[1].trim() : new Date().toUTCString();
  const separator = /^From .*\n/.test(normalized) ? '' : `From ${sender} ${date}\n`;
  return `${separator}${normalized}\n`;
}

function entryRaw(entry) {
  return typeof entry === 'string' ? entry : entry.raw;
}

export function buildMbox(entries) {
  return entries.map((entry) => toMboxEntry(entryRaw(entry))).join('\n');
}

export function base64Size(base64) {
  const value = String(base64 || '').replace(/\s+/g, '');
  if (!value) {
    return 0;
  }
  const padding = (value.match(/=+$/) || [''])[0].length;
  return (value.length * 3) / 4 - padding;
}

function escapeXml(value) {
  return String(value || '').replace(
    /[<>&'"]/g,
    (char) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char]
  );
}

function escapeHtml(value) {
  return escapeXml(value);
}

export function buildJson(entries, meta = {}) {
  return JSON.stringify(
    {
      exportedBy: 'GoogleShot',
      exportedAt: new Date().toISOString(),
      thread: meta.threadId || null,
      account: meta.account || null,
      messageCount: entries.length,
      messages: entries.map((entry) => ({
        subject: entry.subject,
        from: entry.from,
        to: entry.to,
        cc: entry.cc,
        date: entry.date,
        messageId: entry.messageId,
        body: entry.body,
        attachments: entry.attachments.map((attachment) => ({
          filename: attachment.filename,
          mimeType: attachment.mimeType,
          size: base64Size(attachment.base64),
          contentBase64: attachment.base64,
        })),
      })),
    },
    null,
    2
  );
}

export function buildXml(entries, meta = {}) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<thread>'];
  lines.push(`  <exportedAt>${escapeXml(new Date().toISOString())}</exportedAt>`);
  if (meta.account) {
    lines.push(`  <account>${escapeXml(meta.account)}</account>`);
  }
  for (const entry of entries) {
    lines.push('  <message>');
    lines.push(`    <subject>${escapeXml(entry.subject)}</subject>`);
    lines.push(`    <from>${escapeXml(entry.from)}</from>`);
    lines.push(`    <to>${escapeXml(entry.to)}</to>`);
    if (entry.cc) {
      lines.push(`    <cc>${escapeXml(entry.cc)}</cc>`);
    }
    lines.push(`    <date>${escapeXml(entry.date)}</date>`);
    lines.push(`    <messageId>${escapeXml(entry.messageId)}</messageId>`);
    lines.push(`    <body>${escapeXml(entry.body)}</body>`);
    lines.push('    <attachments>');
    for (const attachment of entry.attachments) {
      lines.push(
        `      <attachment filename="${escapeXml(attachment.filename)}" mimeType="${escapeXml(
          attachment.mimeType
        )}" encoding="base64">${attachment.base64}</attachment>`
      );
    }
    lines.push('    </attachments>');
    lines.push('  </message>');
  }
  lines.push('</thread>');
  return lines.join('\n');
}

function csvCell(value) {
  const text = String(value || '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(entries) {
  const rows = [['date', 'from', 'to', 'cc', 'subject', 'attachments', 'body']];
  for (const entry of entries) {
    rows.push([
      entry.date,
      entry.from,
      entry.to,
      entry.cc,
      entry.subject,
      entry.attachments.map((attachment) => attachment.filename).join('; '),
      entry.body,
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

export function buildHtml(entries) {
  const parts = [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><title>Gmail thread export</title>',
    '<style>body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#202124}',
    'article{border:1px solid #dadce0;border-radius:12px;padding:16px;margin:0 0 16px}',
    'h2{margin:0 0 4px;font-size:16px}.meta{color:#5f6368;font-size:12px;margin-bottom:12px}',
    'pre{white-space:pre-wrap;word-break:break-word;background:#f8fafd;border-radius:8px;padding:12px;margin:0}',
    'ul{margin:12px 0 0;padding-left:20px;font-size:12px;color:#5f6368}</style></head><body>',
  ];
  parts.push(`<h1>Gmail thread</h1><p class="meta">Exported ${escapeHtml(new Date().toISOString())}</p>`);
  for (const entry of entries) {
    parts.push('<article>');
    parts.push(`<h2>${escapeHtml(entry.subject)}</h2>`);
    parts.push(
      `<div class="meta">${escapeHtml(entry.from)} → ${escapeHtml(entry.to)}${
        entry.date ? ` · ${escapeHtml(entry.date)}` : ''
      }</div>`
    );
    parts.push(`<pre>${escapeHtml(entry.body)}</pre>`);
    if (entry.attachments.length) {
      parts.push('<ul>');
      for (const attachment of entry.attachments) {
        parts.push(`<li>${escapeHtml(attachment.filename)} (${escapeHtml(attachment.mimeType)})</li>`);
      }
      parts.push('</ul>');
    }
    parts.push('</article>');
  }
  parts.push('</body></html>');
  return parts.join('\n');
}

export function buildText(entries) {
  return entries
    .map((entry) => {
      const lines = [
        '────────────────────────────────────────',
        `Da: ${entry.from}`,
        `A: ${entry.to}`,
        ...(entry.cc ? [`Cc: ${entry.cc}`] : []),
        `Data: ${entry.date}`,
        `Oggetto: ${entry.subject}`,
        '────────────────────────────────────────',
        '',
        entry.body.trim(),
        '',
        ...entry.attachments.map((attachment) => `[allegato] ${attachment.filename}`),
      ];
      return lines.join('\n');
    })
    .join('\n\n');
}

function sanitizePdfText(value) {
  return String(value || '')
    .replace(/[\u2192\u27A1]/g, '->')
    .replace(/[\u2018\u2019\u201A]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2022\u25CF\u25AA]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2713\u2714]/g, 'v')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '?');
}

function wrapText(text, font, size, maxWidth) {
  const lines = [];
  for (const rawLine of sanitizePdfText(text).split('\n')) {
    if (!rawLine) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of rawLine.split(' ')) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) {
        lines.push(current);
      }
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        current = word;
        continue;
      }
      // break very long words
      let chunk = '';
      for (const char of word) {
        if (font.widthOfTextAtSize(chunk + char, size) <= maxWidth) {
          chunk += char;
        } else {
          lines.push(chunk);
          chunk = char;
        }
      }
      current = chunk;
    }
    lines.push(current);
  }
  return lines;
}

export async function buildPdf(entries) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 56;
  const maxWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed) => {
    if (y - needed < margin) {
      page = pdf.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };
  const write = (text, size, useBold, color) => {
    for (const line of wrapText(text, useBold ? bold : font, size, maxWidth)) {
      ensureSpace(size + 6);
      page.drawText(line, {
        x: margin,
        y: y - size,
        size,
        font: useBold ? bold : font,
        color: color || rgb(0.12, 0.12, 0.15),
      });
      y -= size + 6;
    }
  };

  for (const entry of entries) {
    write(entry.subject || '(no subject)', 16, true);
    write(`${entry.from}  →  ${entry.to}`, 9, false, rgb(0.35, 0.36, 0.4));
    if (entry.cc) {
      write(`Cc: ${entry.cc}`, 9, false, rgb(0.35, 0.36, 0.4));
    }
    write(entry.date || '', 9, false, rgb(0.35, 0.36, 0.4));
    y -= 6;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.7,
      color: rgb(0.85, 0.86, 0.88),
    });
    y -= 14;
    write(entry.body.trim(), 10.5, false);
    if (entry.attachments.length) {
      y -= 10;
      write(`Allegati (${entry.attachments.length})`, 10.5, true);
      for (const attachment of entry.attachments) {
        write(`• ${attachment.filename} (${attachment.mimeType}, ${base64Size(attachment.base64)} bytes)`, 9.5, false, rgb(0.3, 0.31, 0.35));
      }
    }
    y -= 24;
  }
  return await pdf.save();
}

export function buildAttachmentsZip(entries) {
  const files = {};
  const used = new Set();
  for (const entry of entries) {
    for (const attachment of entry.attachments) {
      let name = attachment.filename || 'attachment';
      if (used.has(name)) {
        const dot = name.lastIndexOf('.');
        const base = dot > 0 ? name.slice(0, dot) : name;
        const extension = dot > 0 ? name.slice(dot) : '';
        let counter = 2;
        while (used.has(`${base}-${counter}${extension}`)) {
          counter += 1;
        }
        name = `${base}-${counter}${extension}`;
      }
      used.add(name);
      const binary = atob(attachment.base64 || '');
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      files[name] = bytes;
    }
  }
  return zipSync(files, { level: 0 });
}

export function buildThreadsZip(files) {
  return zipSync(files, { level: 6 });
}

export const EXPORT_FORMATS = {
  mbox: { extension: 'mbox', mime: 'application/mbox', build: buildMbox },
  json: { extension: 'json', mime: 'application/json', build: buildJson },
  xml: { extension: 'xml', mime: 'application/xml', build: buildXml },
  csv: { extension: 'csv', mime: 'text/csv', build: buildCsv },
  html: { extension: 'html', mime: 'text/html', build: buildHtml },
  pdf: { extension: 'pdf', mime: 'application/pdf', build: buildPdf },
  txt: { extension: 'txt', mime: 'text/plain', build: buildText },
};

function messageHeader(message, name) {
  const match = message.match(new RegExp(`^${name}:\\s*(.+)$`, 'mi'));
  return match ? match[1].trim() : '';
}

function decodeMimeWord(value) {
  return String(value || '').replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (match, charset, encoding, text) => {
      try {
        if (encoding.toUpperCase() === 'B') {
          const binary = atob(text);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          return new TextDecoder(charset).decode(bytes);
        }
        const normalized = text.replace(/_/g, ' ');
        const bytes = [];
        for (let index = 0; index < normalized.length; index += 1) {
          if (normalized[index] === '=' && index + 2 < normalized.length) {
            bytes.push(parseInt(normalized.slice(index + 1, index + 3), 16));
            index += 2;
          } else {
            bytes.push(normalized.charCodeAt(index));
          }
        }
        return new TextDecoder(charset).decode(Uint8Array.from(bytes));
      } catch {
        return match;
      }
    }
  );
}

function decodeBase64Text(value) {
  try {
    const binary = atob(String(value || '').replace(/\s+/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return '';
  }
}

export function mimeParts(message) {
  const boundaryMatch = message.match(/boundary="?([^"\s;]+)"?/);
  if (!boundaryMatch) {
    return [];
  }
  const boundary = boundaryMatch[1];
  const parts = [];
  for (const chunk of message.split(`--${boundary}`)) {
    const index = chunk.indexOf('\n\n');
    if (index === -1) {
      continue;
    }
    const headers = chunk.slice(0, index);
    const body = chunk.slice(index + 2);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    if (!filenameMatch) {
      continue;
    }
    const contentType = headers.match(/Content-Type:\s*([^\s;]+)/i);
    const encoding = headers.match(/Content-Transfer-Encoding:\s*(\S+)/i);
    parts.push({
      filename: filenameMatch[1],
      mimeType: contentType ? contentType[1] : 'application/octet-stream',
      base64: /base64/i.test(encoding ? encoding[1] : '')
        ? body.replace(/[^A-Za-z0-9+/=]/g, '')
        : bytesToBase64(new TextEncoder().encode(body)),
    });
  }
  return parts;
}

export async function collectThread({ ik, authuser = 0, messages, fetchText, fetchBytes, onProgress }) {
  const entries = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const url = originalMessageUrl({ authuser, ik, permmsgid: message.id });
    const html = await fetchText(url);
    let original = null;
    try {
      original = extractOriginalMessage(html, message.id);
    } catch {
      original = null;
    }
    if (original) {
      const attachments = message.attachments || [];
      const attachmentBase64 = new Array(attachments.length);
      const BATCH = 4;
      for (let offset = 0; offset < attachments.length; offset += BATCH) {
        const batch = attachments.slice(offset, offset + BATCH);
        const results = await Promise.all(
          batch.map(async (attachment, position) => {
            const bytes = await fetchBytes(attachment.url);
            return [offset + position, bytesToBase64(bytes)];
          })
        );
        for (const [position, base64] of results) {
          attachmentBase64[position] = base64;
        }
      }
      const raw = mergeAttachments(original, attachmentBase64);
      const partInfo = mimeParts(raw);
      entries.push({
        raw,
        subject: decodeMimeWord(messageHeader(raw, 'Subject')),
        from: decodeMimeWord(messageHeader(raw, 'From')),
        to: messageHeader(raw, 'To'),
        cc: messageHeader(raw, 'Cc'),
        date: messageHeader(raw, 'Date'),
        messageId: messageHeader(raw, 'Message-ID'),
        body: extractBodyText(raw),
        attachments: attachments.map((attachment, position) => ({
          filename: partInfo[position] ? partInfo[position].filename : `attachment-${position + 1}`,
          mimeType: partInfo[position] ? partInfo[position].mimeType : 'application/octet-stream',
          base64: attachmentBase64[position] || '',
          url: attachment.url,
        })),
      });
    }
    if (onProgress) {
      onProgress(index + 1, messages.length);
    }
  }
  return entries;
}

function extractBodyText(message) {
  for (const chunk of message.split(/\n--/)) {
    const index = chunk.indexOf('\n\n');
    if (index === -1) {
      continue;
    }
    const headers = chunk.slice(0, index);
    const body = chunk.slice(index + 2);
    if (/Content-Type:\s*text\/plain/i.test(headers) && !/filename="/i.test(headers)) {
      if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) {
        return decodeBase64Text(body);
      }
      return body.trim();
    }
  }
  return '';
}
