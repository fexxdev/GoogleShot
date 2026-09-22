import readline from 'node:readline/promises';

export async function chooseBrowser(browsers, { savedId = null } = {}) {
  const savedIndex = browsers.findIndex((browser) => browser.id === savedId);
  const initial = savedIndex >= 0 ? savedIndex : 0;

  console.log('\nWhich browser must GoogleShot open?');
  browsers.forEach((browser, index) => {
    const tags = [];
    if (index === initial) {
      tags.push('default');
    }
    if (browser.id === savedId) {
      tags.push('last used');
    }
    console.log(`  ${index + 1}) ${browser.label}${tags.length ? ` (${tags.join(', ')})` : ''}`);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`\nEnter 1-${browsers.length} [${initial + 1}]: `)).trim();
    const choice = answer === '' ? initial : Number(answer) - 1;
    if (!Number.isInteger(choice) || choice < 0 || choice >= browsers.length) {
      throw new Error(`Invalid choice: ${answer}`);
    }
    return browsers[choice];
  } finally {
    rl.close();
  }
}
