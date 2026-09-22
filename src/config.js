import fs from 'node:fs';
import path from 'node:path';
import { PROFILE_ROOT } from './browsers.js';

const CONFIG_PATH = path.join(PROFILE_ROOT, 'config.json');

export function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function writeConfig(patch) {
  const config = { ...readConfig(), ...patch };
  fs.mkdirSync(PROFILE_ROOT, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  return config;
}
