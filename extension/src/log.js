const MAX_LOGS = 400;
const logs = [];

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
  try {
    console.log('[GS]', step, data === undefined ? '' : data);
  } catch {
    // ignore
  }
  return entry;
}

export function error(step, err) {
  return log(step, { error: err && (err.message || String(err)), stack: err && err.stack ? String(err.stack).split('\n').slice(0, 3).join(' | ') : undefined });
}

function safe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export function getLogs() {
  return logs.slice();
}
