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

export function extractOriginalMessage(html) {
  const source = String(html || '');
  const match = source.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) {
    throw new Error('The original message is not in the page.');
  }
  const message = unescapeHtml(match[1]).replace(/\r\n/g, '\n').replace(/\n+$/, '\n');
  const separator = /^From .*\n/.test(message) ? '' : `From nobody@example.com\n`;
  return `${separator}${message}\n`;
}

export function originalMessageUrl({ authuser = 0, ik, permmsgid }) {
  // Gmail wants the raw permmsgid (msg-f:123), the colon must stay literal
  const parts = ['view=om', `permmsgid=${permmsgid}`];
  if (ik) {
    parts.unshift(`ik=${ik}`);
  }
  return `${GMAIL_ORIGIN}/mail/u/${Number(authuser) || 0}/?${parts.join('&')}`;
}

export async function collectThread({ ik, authuser = 0, messageIds, fetchText, onProgress }) {
  const blocks = [];
  for (let index = 0; index < messageIds.length; index += 1) {
    const url = originalMessageUrl({ authuser, ik, permmsgid: `msg-f:${messageIds[index]}` });
    const html = await fetchText(url);
    blocks.push(extractOriginalMessage(html));
    if (onProgress) {
      onProgress(index + 1, messageIds.length);
    }
  }
  return blocks;
}

export function buildMbox(blocks) {
  return blocks.map((block) => block.replace(/\r\n/g, '\n')).join('\n');
}
