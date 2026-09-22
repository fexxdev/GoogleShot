import { execFileSync } from 'node:child_process';

let cached = null;

export function systemColorScheme() {
  const override = process.env.GOOGLESHOT_COLOR_SCHEME;
  if (override === 'dark' || override === 'light') {
    return override;
  }
  if (cached) {
    return cached;
  }
  cached = detectColorScheme();
  return cached;
}

function detectColorScheme() {
  try {
    if (process.platform === 'darwin') {
      const style = execFileSync('defaults', ['read', '-g', 'AppleInterfaceStyle'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim();
      return /dark/i.test(style) ? 'dark' : 'light';
    }
    if (process.platform === 'win32') {
      const value = execFileSync(
        'reg',
        [
          'query',
          'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize',
          '/v',
          'AppsUseLightTheme',
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString();
      return /0x0\s*$/m.test(value) ? 'dark' : 'light';
    }
    const value = execFileSync('gsettings', ['get', 'org.gnome.desktop.interface', 'color-scheme'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    return /dark/i.test(value) ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}
