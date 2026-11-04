// Rasterize the website's actual favicon for Chrome's PNG extension icons.
// Run from the repository: node extension/icons/generate_icons.js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const svg = await readFile(new URL('../../public/talentdesk.svg', import.meta.url), 'utf8');
await writeFile(new URL('./talentdesk.svg', import.meta.url), svg);
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const size of [16, 32, 48, 128]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(`./icon-${size}.png`, import.meta.url)), omitBackground: true });
    console.log(`Generated favicon icon ${size}×${size}`);
  }
} finally {
  await browser.close();
}
