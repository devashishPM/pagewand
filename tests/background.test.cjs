const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'background.js'), 'utf8');

function worker(shared) {
  const listeners = {};
  const chrome = {
    action: {
      onClicked: { addListener(listener) { listeners.clicked = listener; } },
      async setBadgeText(value) { shared.badges.push(value); },
      async setBadgeBackgroundColor() {},
      async setTitle() {}
    },
    scripting: {
      async insertCSS() { shared.insertions += 1; },
      async executeScript() {
        shared.executions += 1;
        if (shared.executeError) throw new Error(shared.executeError);
        shared.active = true;
      },
      async removeCSS() { shared.removals += 1; }
    },
    tabs: {
      onRemoved: { addListener() {} },
      onUpdated: { addListener() {} },
      async sendMessage(_tabId, message) {
        if (message.action === 'ping') return { active: shared.active };
        if (message.action === 'cleanup') { shared.active = false; shared.cleanups += 1; return { active: false }; }
        return undefined;
      },
      async get() {
        if (shared.tabStates && shared.tabStates.length) return shared.tabStates.shift();
        return { id: 4, active: true, windowId: 2, url: 'https://example.test/' };
      },
      async captureVisibleTab() { return 'data:image/png;base64,ok'; }
    },
    runtime: { lastError: null, onMessage: { addListener(listener) { listeners.message = listener; } } },
    downloads: { download(_options, callback) { callback(1); } }
  };
  vm.runInNewContext(source, { chrome, console, Promise, Map, String, Number, RegExp, Error });
  return listeners;
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('toolbar state reconciles after service-worker restart', async () => {
  const shared = { active: false, insertions: 0, executions: 0, removals: 0, cleanups: 0, badges: [] };
  const first = worker(shared);
  first.clicked({ id: 4 });
  await settle();
  assert.equal(shared.active, true);
  assert.equal(shared.executions, 1);

  const restarted = worker(shared);
  restarted.clicked({ id: 4 });
  await settle();
  assert.equal(shared.active, false);
  assert.equal(shared.executions, 1);
  assert.equal(shared.cleanups, 1);
  assert.equal(shared.removals, 1);
});

test('capture response preserves request identity', async () => {
  const shared = { active: true, insertions: 0, executions: 0, removals: 0, cleanups: 0, badges: [] };
  const listeners = worker(shared);
  const response = await new Promise((resolve) => {
    const keepAlive = listeners.message(
      { action: 'SHOOT_TAB', requestId: 42 },
      { tab: { id: 4, active: true, windowId: 2, url: 'https://example.test/' } },
      resolve
    );
    assert.equal(keepAlive, true);
  });
  assert.equal(response.requestId, 42);
  assert.equal(response.dataUrl, 'data:image/png;base64,ok');
});

test('rapid toolbar actions serialize into activation then deactivation', async () => {
  const shared = { active: false, insertions: 0, executions: 0, removals: 0, cleanups: 0, badges: [] };
  const listeners = worker(shared);
  listeners.clicked({ id: 4 });
  listeners.clicked({ id: 4 });
  await settle();
  await settle();
  assert.equal(shared.executions, 1);
  assert.equal(shared.cleanups, 1);
  assert.equal(shared.active, false);
});

test('asynchronous injection failure rolls back CSS and reports an error badge', async () => {
  const shared = { active: false, executeError: 'blocked page', insertions: 0, executions: 0, removals: 0, cleanups: 0, badges: [] };
  const listeners = worker(shared);
  listeners.clicked({ id: 4 });
  await settle();
  assert.equal(shared.removals, 1);
  assert.equal(shared.badges.at(-1).text, '!');
});

test('capture is discarded when active tab identity changes', async () => {
  const shared = {
    active: true, insertions: 0, executions: 0, removals: 0, cleanups: 0, badges: [],
    tabStates: [
      { id: 4, active: true, windowId: 2, url: 'https://example.test/' },
      { id: 4, active: false, windowId: 2, url: 'https://example.test/' }
    ]
  };
  const listeners = worker(shared);
  const response = await new Promise((resolve) => listeners.message(
    { action: 'SHOOT_TAB', requestId: 99 },
    { tab: { id: 4, active: true, windowId: 2, url: 'https://example.test/' } },
    resolve
  ));
  assert.equal(response.requestId, 99);
  assert.match(response.error, /active tab changed/);
});
