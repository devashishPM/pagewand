import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 }, deviceScaleFactor: 1 });
await page.addInitScript(() => {
  const listeners = [];
  window.chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener(listener) { listeners.push(listener); }, removeListener() {} },
      sendMessage(_message, callback) { if (callback) callback({ success: true }); }
    }
  };
});
await page.goto(`data:text/html,${encodeURIComponent(`
  <style>
    body { margin: 0; min-height: 100vh; color: #18181b; font-family: Inter, -apple-system, sans-serif; background: #fafafa; }
    main { max-width: 980px; margin: 0 auto; padding: 120px 36px; }
    .eyebrow { color: #dc2626; font-weight: 700; letter-spacing: .08em; }
    h1 { max-width: 760px; margin: 12px 0; font-size: 58px; line-height: 1.02; }
    p { max-width: 650px; color: #52525b; font-size: 19px; line-height: 1.6; }
  </style>
  <main><div class="eyebrow">DEMO PAGE</div><h1>Shape the page in front of you.</h1><p>Remove distractions, try copy changes, inspect computed styles, capture what you see, and retrieve the displayed original asset.</p></main>
`)}`);
await page.addStyleTag({ path: path.join(root, 'styles.css') });
for (const file of ['css_export.js', 'downloads.js', 'edit_manager.js', 'capture.js', 'screenshot_editor.js', 'ui.js', 'content.js']) {
  await page.addScriptTag({ path: path.join(root, file) });
}
await page.waitForTimeout(100);
await mkdir(path.join(root, 'docs'), { recursive: true });
await page.screenshot({ path: path.join(root, 'docs/onboarding.png') });
await page.keyboard.press('s');
await page.waitForTimeout(100);
await page.screenshot({ path: path.join(root, 'docs/toolbar.png') });
await browser.close();
console.log('Updated docs/onboarding.png and docs/toolbar.png');
