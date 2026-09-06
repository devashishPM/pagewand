import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const svg = await readFile(path.join(root, 'icons/icon.svg'), 'utf8');
const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const browser = await chromium.launch({ headless: true });

try {
  for (const size of [16, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>*{margin:0}img{display:block;width:${size}px;height:${size}px}</style><img alt="" src="${source}">`);
    await page.locator('img').screenshot({ path: path.join(root, `icons/icon${size}.png`), omitBackground: true });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log('Generated PageWand icons at 16px, 48px, and 128px.');
