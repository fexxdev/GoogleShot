const MAX_LOGS = 400;
const logs = [];
let debugEnabled = false;

function output(entry, raw) {
  if (!debugEnabled) {
    return;
  }
  try {
    console.log('[GS]', entry.step, raw === undefined ? '' : raw);
  } catch {
    // ignore
  }
}

function safe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function setDebug(enabled) {
  debugEnabled = Boolean(enabled);
}

export function log(step, data) {
  const entry = {
    t: new Date().toISOString().slice(11, 23),
    step,
    ...(data === undefined ? {} : { data: safe(data) }),
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
  output(entry, data);
  return entry;
}

export function error(step, err) {
  return log(step, {
    error: err && (err.message || String(err)),
    stack:
      err && err.stack
        ? String(err.stack).split('\n').slice(0, 3).join(' | ')
        : undefined,
  });
}

export function getLogs() {
  return logs.slice();
}
