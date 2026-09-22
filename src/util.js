import { t } from './i18n.js';
import { sanitizeFilename as cleanName } from '../shared/filename.js';

export { cleanTitle } from '../shared/filename.js';

export function parseSlidesId(input) {
  if (!input) {
    throw new Error(t('missingPresentation'));
  }
  const match = input.match(/presentation\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return match[1];
  }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) {
    return input;
  }
  throw new Error(t('cannotFindPresentationId', input));
}

export function parseDocId(input) {
  if (!input) {
    throw new Error(t('missingDocument'));
  }
  const match = input.match(/document\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return match[1];
  }
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) {
    return input;
  }
  throw new Error(t('cannotFindDocumentId', input));
}

export function isDocSource(input) {
  return Boolean(input && /\/document\/d\//.test(input));
}

export function sanitizeFilename(name) {
  return cleanName(name, 'presentation');
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
