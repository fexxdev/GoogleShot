export function parseRange(input) {
  const text = String(input || '').trim();
  if (!text) {
    return null;
  }
  const selected = new Set();
  for (const part of text.split(',')) {
    const piece = part.trim();
    if (!piece) {
      continue;
    }
    const match = piece.match(/^(\d+)\s*-\s*(\d+)$/);
    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (start < 1 || end < start) {
        throw new Error(`Invalid range: ${piece}`);
      }
      for (let value = start; value <= end; value += 1) {
        selected.add(value);
      }
      continue;
    }
    if (/^\d+$/.test(piece)) {
      const value = Number(piece);
      if (value < 1) {
        throw new Error(`Invalid range: ${piece}`);
      }
      selected.add(value);
      continue;
    }
    throw new Error(`Invalid range: ${piece}`);
  }
  return selected.size ? Array.from(selected).sort((a, b) => a - b) : null;
}

export function filterSelection(items, range) {
  if (!range || range.length === 0) {
    return items;
  }
  const wanted = new Set(range);
  return items.filter((item, index) => wanted.has(index + 1));
}
