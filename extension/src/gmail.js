const GMAIL_ORIGIN = 'https://mail.google.com';

function decodeBase64Url(data) {
  const normalized = String(data || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeUtf8(bytes) {
  return new TextDecoder('utf-8').decode(bytes);
}

function encodeBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function headerValue(headers, name) {
  const wanted = name.toLowerCase();
  const found = (headers || []).find((header) => String(header.name || '').toLowerCase() === wanted);
  return found ? String(found.value || '') : '';
}

function normalizeNewlines(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function escapeFromBody(body) {
  return normalizeNewlines(body)
    .split('\n')
    .map((line) => (line.startsWith('From ') ? `>${line}` : line))
    .join('\n');
}

function walkParts(payload, basePath) {
  const parts = [];
  const visit = (node, path) => {
    if (!node) {
      return;
    }
    const filename = node.filename || '';
    const mimeType = node.mimeType || '';
    if (node.body && node.body.attachmentId) {
      parts.push({ node, path, filename, mimeType });
    }
    for (let index = 0; index < (node.parts || []).length; index += 1) {
      visit(node.parts[index], `${path}.${index}`);
    }
  };
  visit(payload, basePath);
  return parts;
}

export function extractBody(payload) {
  const candidates = [];
  const visit = (node, isAttachment) => {
    if (!node) {
      return;
    }
    const filename = node.filename || '';
    const attachmentId = node.body && node.body.attachmentId;
    if (!attachmentId && !filename && node.mimeType === 'text/plain' && node.body && node.body.data) {
      candidates.push(decodeUtf8(decodeBase64Url(node.body.data)));
    }
    if (!attachmentId && !filename && node.mimeType === 'text/html' && node.body && node.body.data) {
      candidates.push(decodeUtf8(decodeBase64Url(node.body.data)));
    }
    for (const part of node.parts || []) {
      visit(part, Boolean(attachmentId || filename));
    }
  };
  visit(payload, false);
  if (candidates.length === 0) {
    return '';
  }
  return candidates[0];
}

function formatAddress(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function messageToMbox(message, options = {}) {
  const payload = message.payload || {};
  const headers = payload.headers || [];
  const subject = headerValue(headers, 'subject');
  const from = formatAddress(headerValue(headers, 'from'));
  const to = formatAddress(headerValue(headers, 'to'));
  const cc = formatAddress(headerValue(headers, 'cc'));
  const date = headerValue(headers, 'date') || new Date(Number(message.internalDate) || Date.now()).toUTCString();
  const messageId = headerValue(headers, 'message-id') || `${message.id}@mail.gmail.com`;
  const body = escapeFromBody(options.body || '');
  const attachments = options.attachments || [];

  const mimeParts = [];
  const hasPlain = Boolean(body);
  if (attachments.length === 0) {
    mimeParts.push({
      headers: ['Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64'],
      content: encodeBody(body),
    });
  } else {
    const boundary = `----googleshot-${message.id || Date.now()}`;
    const blocks = [encodeTextBlock(boundary, body)];
    for (const attachment of attachments) {
      blocks.push(
        [
          `--${boundary}`,
          `Content-Type: ${attachment.mimeType || 'application/octet-stream'}; name="${attachment.filename || 'file'}"`,
          'Content-Transfer-Encoding: base64',
          `Content-Disposition: attachment; filename="${attachment.filename || 'file'}"`,
          '',
          encodeBody(attachment.bytes),
        ].join('\r\n')
      );
    }
    mimeParts.push({
      headers: [`Content-Type: multipart/mixed; boundary="${boundary}"`],
      content: `${blocks.join('\r\n')}\r\n--${boundary}--`,
    });
  }

  const lines = [
    `From ${from || 'nobody@example.com'} ${date}`,
    `Subject: ${subject}`,
    `From: ${from}`,
    `To: ${to}`,
  ];
  if (cc) {
    lines.push(`Cc: ${cc}`);
  }
  lines.push(`Date: ${date}`, `Message-ID: ${messageId}`, 'MIME-Version: 1.0');
  for (const part of mimeParts) {
    lines.push(...part.headers, '', part.content);
  }
  return `${lines.join('\r\n')}\r\n\r\n`;
}

function encodeBody(value) {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(normalizeNewlines(value));
  const encoded = encodeBase64(bytes);
  return (encoded.match(/.{1,76}/g) || ['']).join('\r\n');
}

function encodeTextBlock(boundary, body) {
  return [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeBody(body),
  ].join('\r\n');
}

export function buildMbox(messages) {
  return messages.map((entry) => messageToMbox(entry.message, entry)).join('\n');
}

function gmailUrl(path, ik) {
  const base = `${GMAIL_ORIGIN}/mail/u/0/gmail/v1/${path}`;
  return ik ? `${base}${base.includes('?') ? '&' : '?'}ik=${encodeURIComponent(ik)}` : base;
}

export async function fetchThread({ ik, account, threadId, fetchFn = fetch }) {
  const url = gmailUrl(
    `users/${encodeURIComponent(account)}/threads/${threadId}?format=full`,
    ik
  );
  const response = await fetchFn(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Gmail API error ${response.status}`);
  }
  return response.json();
}

export async function fetchAttachment({ ik, account, messageId, attachmentId, fetchFn = fetch }) {
  const url = gmailUrl(
    `users/${encodeURIComponent(account)}/messages/${messageId}/attachments/${attachmentId}`,
    ik
  );
  const response = await fetchFn(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`Gmail attachment error ${response.status}`);
  }
  const json = await response.json();
  return decodeBase64Url(json.data || '');
}

export async function collectThread({ ik, account, threadId, fetchFn = fetch, onProgress }) {
  const thread = await fetchThread({ ik, account, threadId, fetchFn });
  const messages = thread.messages || [];
  const entries = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    const body = extractBody(message.payload);
    const attachmentParts = walkParts(message.payload, '0');
    const attachments = [];
    for (const part of attachmentParts) {
      const bytes = await fetchAttachment({
        ik,
        account,
        messageId: message.id,
        attachmentId: part.node.body.attachmentId,
        fetchFn,
      });
      attachments.push({ filename: part.filename, mimeType: part.mimeType, bytes });
    }
    entries.push({ message, body, attachments });
    if (onProgress) {
      onProgress(index + 1, messages.length);
    }
  }
  return entries;
}
