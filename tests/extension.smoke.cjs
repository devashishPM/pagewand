const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

test('loaded extension runs in an isolated world and exits cleanly', async () => {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'pagewand-profile-'));
  const sourceRoot = path.resolve(__dirname, '..');
  const extensionPath = path.join(profile, 'extension');
  await fs.mkdir(path.join(extensionPath, 'icons'), { recursive: true });
  const runtime = [
    'background.js', 'css_export.js', 'downloads.js', 'edit_manager.js', 'capture.js',
    'screenshot_editor.js', 'ui.js', 'content.js', 'styles.css',
    'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'
  ];
  for (const relative of runtime) {
    await fs.copyFile(path.join(sourceRoot, relative), path.join(extensionPath, relative));
  }
  const manifest = JSON.parse(await fs.readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'));
  manifest.content_scripts = [{
    matches: ['http://127.0.0.1/*'],
    css: ['styles.css'],
    js: ['css_export.js', 'downloads.js', 'edit_manager.js', 'capture.js', 'screenshot_editor.js', 'ui.js', 'content.js'],
    run_at: 'document_idle'
  }];
  await fs.writeFile(path.join(extensionPath, 'manifest.json'), JSON.stringify(manifest));
  const server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<main style="padding:100px"><h1>Extension smoke test</h1><p id="target">Target</p></main>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`]
    });
    const workers = context.serviceWorkers();
    const worker = workers[0] || await context.waitForEvent('serviceworker');
    assert.match(worker.url(), /chrome-extension:\/\//);

    const page = context.pages()[0] || await context.newPage();
    await page.goto(`http://127.0.0.1:${port}`);
    await page.locator('#pw-ui-host').waitFor({ state: 'attached' });
    const firstMode = page.locator('#pw-ui-host').locator('.start-mode[data-mode="zap"]');
    assert.equal(await firstMode.getAttribute('aria-label'), 'Zap: Remove an element');
    await firstMode.click();
    await page.locator('#target').hover();
    await page.locator('#target').click();
    assert.equal(await page.locator('#target').count(), 0);
    await page.locator('#pw-ui-host').locator('[data-action="undo"]').click();
    assert.equal(await page.locator('#target').textContent(), 'Target');
    await page.locator('#pw-ui-host').locator('[data-action="exit"]').click();
    await page.locator('#pw-ui-host').waitFor({ state: 'detached' });
  } finally {
    if (context) await context.close();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(profile, { recursive: true, force: true });
  }
});
