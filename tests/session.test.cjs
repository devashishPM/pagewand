const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const runtimeFiles = [
  'css_export.js', 'downloads.js', 'edit_manager.js', 'capture.js',
  'screenshot_editor.js', 'ui.js', 'content.js'
];
let browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { if (browser) await browser.close(); });

async function fixture(html, viewport = { width: 900, height: 700 }) {
  const page = await browser.newPage({ viewport });
  await page.addInitScript(() => {
    window.__messages = [];
    window.__runtimeListeners = [];
    window.chrome = {
      runtime: {
        lastError: null,
        onMessage: {
          addListener(listener) { window.__runtimeListeners.push(listener); },
          removeListener(listener) {
            window.__runtimeListeners = window.__runtimeListeners.filter((item) => item !== listener);
          }
        },
        sendMessage(message, callback) {
          window.__messages.push(message);
          if (!callback) return;
          if (message.action === 'DOWNLOAD_ASSET') queueMicrotask(() => callback({ success: true, downloadId: 7 }));
          if (message.action === 'SHOOT_TAB') queueMicrotask(() => callback({
            requestId: message.requestId,
            dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X9WewAAAAABJRU5ErkJggg=='
          }));
        }
      }
    };
  });
  await page.goto(`data:text/html,${encodeURIComponent(`<style>body{padding-top:80px}</style>${html}`)}`);
  await page.addStyleTag({ path: path.join(root, 'styles.css') });
  for (const file of runtimeFiles) await page.addScriptTag({ path: path.join(root, file) });
  return page;
}

async function start(page, key = 'z') {
  await page.keyboard.press(key);
  await page.waitForFunction(() => !document.querySelector('#pw-ui-host').shadowRoot.querySelector('.overlay'));
}

test('onboarding is responsive, keyboard-focusable, and Escape exits', async () => {
  const page = await fixture('<main><p>Example</p></main>', { width: 375, height: 640 });
  const metrics = await page.evaluate(() => {
    const host = document.querySelector('#pw-ui-host');
    const root = host.shadowRoot;
    const rect = root.querySelector('.card').getBoundingClientRect();
    return {
      left: rect.left, right: rect.right,
      focusedMode: root.activeElement && root.activeElement.dataset.mode,
      firstTag: root.querySelector('.mode').tagName,
      toolbarHidden: root.querySelector('.toolbar').hidden
    };
  });
  assert.ok(metrics.left >= 0 && metrics.right <= 375);
  assert.equal(metrics.focusedMode, 'zap');
  assert.equal(metrics.firstTag, 'BUTTON');
  assert.equal(metrics.toolbarHidden, true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pw-ui-host').count(), 0);
  assert.equal(await page.evaluate(() => window.__pageWandActive), false);
  await page.close();
});

test('typing in controls does not switch modes and transitions clear cursor state', async () => {
  const page = await fixture('<input id="field"><p>Example</p>');
  await start(page, 'z');
  await page.locator('#field').fill('cats');
  assert.equal(await page.evaluate(() => window.__pageWandSession.getMode()), 'zap');
  await page.keyboard.press('d');
  await page.keyboard.press('z');
  assert.deepEqual(await page.evaluate(() => [...document.body.classList].filter((name) => name.startsWith('pw-cursor-'))), ['pw-cursor-crosshair']);
  await page.close();
});

test('toolbar reveals only actions that fit the current tool', async () => {
  const page = await fixture('<main id="parent"><p id="child">Example</p></main>', { width: 320, height: 640 });
  await start(page, 'z');
  const host = page.locator('#pw-ui-host');

  const initial = await host.evaluate((node) => {
    const root = node.shadowRoot;
    return {
      currentTool: root.querySelector('[data-role="current-label"]').textContent,
      toolbarModeButtons: root.querySelectorAll('.toolbar [data-mode]').length,
      visiblePageHidden: root.querySelector('[data-action="visible-page"]').hidden,
      selectedAreaHidden: root.querySelector('[data-action="area"]').hidden,
      parentHidden: root.querySelector('[data-action="parent"]').hidden,
      parentDisabled: root.querySelector('[data-action="parent"]').disabled,
      undoHidden: root.querySelector('[data-action="undo"]').hidden,
      usesTechnicalLabel: /viewport/i.test(root.querySelector('.toolbar').textContent)
    };
  });
  assert.deepEqual(initial, {
    currentTool: 'Zap', toolbarModeButtons: 0, visiblePageHidden: true,
    selectedAreaHidden: true, parentHidden: false, parentDisabled: true,
    undoHidden: true, usesTechnicalLabel: false
  });

  await page.locator('#child').hover();
  assert.equal(await host.locator('[data-action="parent"]').isDisabled(), false);
  await host.locator('[data-action="parent"]').click();
  assert.equal(await page.locator('#parent').evaluate((node) => node.classList.contains('pw-highlight')), true);

  await host.locator('[data-action="choose-mode"]').click();
  assert.equal(await host.locator('[data-action="choose-mode"]').getAttribute('aria-expanded'), 'true');
  await page.keyboard.press('Escape');
  assert.equal(await host.locator('[data-action="choose-mode"]').getAttribute('aria-expanded'), 'false');
  assert.equal(await host.count(), 1);

  await host.locator('[data-action="choose-mode"]').click();
  await host.locator('.picker-mode[data-mode="screenshot"]').click();
  const capture = await host.evaluate((node) => {
    const root = node.shadowRoot;
    const toolbar = root.querySelector('.toolbar').getBoundingClientRect();
    return {
      currentTool: root.querySelector('[data-role="current-label"]').textContent,
      visiblePageHidden: root.querySelector('[data-action="visible-page"]').hidden,
      selectedAreaHidden: root.querySelector('[data-action="area"]').hidden,
      parentHidden: root.querySelector('[data-action="parent"]').hidden,
      toolbarLeft: toolbar.left,
      toolbarRight: toolbar.right,
      toolbarScrollWidth: root.querySelector('.toolbar').scrollWidth,
      toolbarClientWidth: root.querySelector('.toolbar').clientWidth
    };
  });
  assert.equal(capture.currentTool, 'Capture');
  assert.equal(capture.visiblePageHidden, false);
  assert.equal(capture.selectedAreaHidden, false);
  assert.equal(capture.parentHidden, true);
  assert.ok(capture.toolbarLeft >= 0 && capture.toolbarRight <= 320);
  assert.ok(capture.toolbarScrollWidth <= capture.toolbarClientWidth, JSON.stringify(capture));

  await host.locator('[data-action="area"]').click();
  assert.equal(await page.locator('#pw-area-overlay').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pw-area-overlay').count(), 0);
  assert.equal(await host.count(), 1);
  assert.equal(await page.evaluate(() => window.__pageWandSession.getMode()), 'screenshot');

  await host.locator('[data-action="choose-mode"]').click();
  await host.locator('.picker-mode[data-mode="download"]').click();
  const download = await host.evaluate((node) => {
    const root = node.shadowRoot;
    return {
      currentTool: root.querySelector('[data-role="current-label"]').textContent,
      hintHidden: root.querySelector('[data-context="download"]').hidden,
      hint: root.querySelector('[data-context="download"]').textContent.trim(),
      visiblePageHidden: root.querySelector('[data-action="visible-page"]').hidden
    };
  });
  assert.deepEqual(download, {
    currentTool: 'Download', hintHidden: false,
    hint: 'Choose an asset on the page', visiblePageHidden: true
  });
  await page.close();
});

test('Cancel restores text and saved edits join multi-step undo', async () => {
  const page = await fixture('<p id="one">Original</p><p id="two">Second</p>');
  await start(page, 'e');
  await page.locator('#one').hover();
  await page.locator('#one').click();
  await page.locator('#one').evaluate((node) => { node.textContent = 'Changed'; });
  await page.locator('#one').press('Escape');
  assert.equal(await page.locator('#one').textContent(), 'Original');

  await page.locator('#one').hover();
  await page.locator('#one').click();
  await page.locator('#one').evaluate((node) => {
    const selection = window.getSelection();
    selection.selectAllChildren(node);
    selection.collapseToEnd();
    const data = new DataTransfer();
    data.setData('text/plain', ' pasted');
    node.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  });
  assert.equal(await page.locator('#one').textContent(), 'Original pasted');
  await page.locator('#one').press('Enter');
  assert.notEqual(await page.locator('#one').getAttribute('contenteditable'), null);
  await page.locator('#one').press('Escape');
  assert.equal(await page.locator('#one').textContent(), 'Original');

  await page.locator('#one').hover();
  await page.locator('#one').click();
  await page.locator('#one').evaluate((node) => { node.textContent = 'Saved'; });
  await page.locator('#pw-ui-host').evaluate((host) => host.shadowRoot.querySelector('.save').click());
  assert.equal(await page.locator('#one').textContent(), 'Saved');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  assert.equal(await page.locator('#one').textContent(), 'Original');
  await page.close();
});

test('zap supports multiple undos and never removes document roots', async () => {
  const page = await fixture('<main><p id="one">One</p><p id="two">Two</p></main>');
  await start(page, 'z');
  await page.locator('#one').hover();
  await page.locator('#one').click();
  await page.locator('#two').hover();
  await page.locator('#two').click();
  assert.equal(await page.locator('main p').count(), 0);
  assert.equal(await page.locator('#pw-ui-host').evaluate((host) => host.shadowRoot.querySelector('[data-action="undo"]').hidden), false);
  const chord = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
  await page.keyboard.press(chord);
  await page.keyboard.press(chord);
  assert.deepEqual(await page.locator('main p').allTextContents(), ['One', 'Two']);
  assert.equal(await page.locator('#pw-ui-host').evaluate((host) => host.shadowRoot.querySelector('[data-action="undo"]').hidden), true);
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  assert.equal(await page.locator('body').count(), 1);
  await page.close();
});

test('CSS export retains authored values and emits an escapable selector', async () => {
  const page = await fixture('<style>p{color:rgb(12,34,56);font-size:20px}</style><p id="target" class="hover:bg-red-500 w-1/2">Text</p>');
  const output = await page.evaluate(() => window.__pageWandModules.createCssExporter().getCssOutput(document.querySelector('#target')));
  assert.match(output.cssText, /color: rgb\(12, 34, 56\)/);
  assert.match(output.cssText, /font-size: 20px/);
  assert.equal(await page.evaluate((selector) => document.querySelectorAll(selector).length, output.selector), 1);
  await page.close();
});

test('download uses currentSrc, preserves extension, and sends exactly one request', async () => {
  const page = await fixture('<img id="asset" src="https://example.test/fallback.png" alt="asset">');
  await page.locator('#asset').evaluate((image) => {
    Object.defineProperty(image, 'currentSrc', { configurable: true, value: 'https://cdn.example.test/displayed.gif' });
  });
  await start(page, 'd');
  await page.locator('#asset').hover();
  await page.locator('#asset').click();
  await page.waitForFunction(() => window.__messages.some((message) => message.action === 'DOWNLOAD_ASSET'));
  const downloads = await page.evaluate(() => window.__messages.filter((message) => message.action === 'DOWNLOAD_ASSET'));
  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].url, 'https://cdn.example.test/displayed.gif');
  assert.equal(downloads[0].filename, 'displayed.gif');
  await page.close();
});

test('repeated capture shortcuts serialize to one in-flight request', async () => {
  const page = await fixture('<p>Capture</p>');
  await start(page, 's');
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true }));
  });
  await page.waitForFunction(() => window.__messages.some((message) => message.action === 'SHOOT_TAB'));
  const requests = await page.evaluate(() => window.__messages.filter((message) => message.action === 'SHOOT_TAB'));
  assert.equal(requests.length, 1);
  await page.close();
});

test('cleanup owns edit, area-selection, and screenshot-editor state', async () => {
  const page = await fixture('<p id="target">Original</p>');
  await start(page, 'e');
  await page.locator('#target').hover();
  await page.locator('#target').click();
  await page.locator('#target').evaluate((node) => { node.textContent = 'Unsaved'; });
  await page.evaluate(() => window.__pageWandSession.cleanup());
  assert.equal(await page.locator('#target').textContent(), 'Original');
  assert.equal(await page.locator('#target').getAttribute('contenteditable'), null);
  assert.equal(await page.locator('.pw-editing').count(), 0);

  const page2 = await fixture('<p>Area</p>');
  await start(page2, 's');
  await page2.locator('#pw-ui-host').evaluate((host) => host.shadowRoot.querySelector('[data-action="area"]').click());
  assert.equal(await page2.locator('#pw-area-overlay').count(), 1);
  await page2.evaluate(() => window.__pageWandSession.cleanup());
  assert.equal(await page2.locator('#pw-area-overlay').count(), 0);

  const page3 = await fixture('<p>Editor</p>');
  await page3.evaluate(() => new window.ScreenshotEditor('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X9WewAAAAABJRU5ErkJggg=='));
  assert.equal(await page3.locator('#pw-screenshot-host').count(), 1);
  await page3.evaluate(() => window.__pageWandSession.cleanup());
  assert.equal(await page3.locator('#pw-screenshot-host').count(), 0);
  assert.equal(await page3.evaluate(() => window.__pwScreenshotEditorActive), false);
  await Promise.all([page.close(), page2.close(), page3.close()]);
});

test('screenshot editor exposes accessible tools, opaque redaction, and Escape close', async () => {
  const page = await fixture('<p>Editor</p>');
  await page.evaluate(() => new window.ScreenshotEditor('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X9WewAAAAABJRU5ErkJggg=='));
  await page.waitForFunction(() => document.querySelector('#pw-screenshot-host').shadowRoot.querySelector('canvas').width === 1);
  const labels = await page.locator('#pw-screenshot-host').evaluate((host) => [...host.shadowRoot.querySelectorAll('button')].map((button) => button.getAttribute('aria-label')));
  assert.ok(labels.includes('Cover an area with an opaque redaction'));
  assert.ok(labels.every(Boolean));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#pw-screenshot-host').count(), 0);
  await page.close();
});
