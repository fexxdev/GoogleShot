export function parsePresentationId(input) {
  if (!input) {
    throw new Error('Missing presentation URL or ID.');
  }
  const match = input.match(/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return match[1];
  }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) {
    return input;
  }
  throw new Error(`Cannot find a presentation ID in: ${input}`);
}

export function sanitizeFilename(name) {
  const cleaned = (name || 'presentation')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return cleaned || 'presentation';
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
