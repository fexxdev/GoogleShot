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

export function buildMbox(entries) {
  return entries.map((entry) => toMboxEntry(entry)).join('\n');
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
      // drafts and some message types have no "original" view: skip them
      original = null;
    }
    if (original) {
      const attachmentBase64 = [];
      for (const attachment of message.attachments || []) {
        const bytes = await fetchBytes(attachment.url);
        attachmentBase64.push(bytesToBase64(bytes));
      }
      entries.push(mergeAttachments(original, attachmentBase64));
    }
    if (onProgress) {
      onProgress(index + 1, messages.length);
    }
  }
  return entries;
}
