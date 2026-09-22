export function sanitizeFilename(name, fallback = 'googleshot') {
  const cleaned = (name || fallback)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[/\\:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    // Windows refuses names that end with a dot or a space.
    .replace(/[. ]+$/, '');
  return cleaned || fallback;
}

// Google appends " - Google Docs", " - Documenti Google", ... to the tab
// title. Every locale keeps the word "Google" in that suffix, so dropping
// the last " - ..." segment when it mentions Google works in all languages.
export function cleanTitle(title, fallback = '') {
  const cleaned = String(title || '')
    .replace(/\s*-\s*[^-]*Google[^-]*$/i, '')
    .trim();
  return cleaned || fallback;
}
