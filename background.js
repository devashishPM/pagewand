// PageWand - Manifest V3 service worker.
// Content-script reconciliation is the source of truth because worker globals
// are intentionally disposable.

const tabQueues = new Map();
const captureQueues = new Map();
let nextCaptureAt = Date.now() + 600;
const tabEpochs = new Map();

const RUNTIME_FILES = [
  'css_export.js',
  'downloads.js',
  'edit_manager.js',
  'capture.js',
  'screenshot_editor.js',
  'ui.js',
  'content.js'
];

function enqueue(map, key, task) {
  const previous = map.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  map.set(key, next);
  const cleanup = () => {
    if (map.get(key) === next) map.delete(key);
  };
  next.then(cleanup, cleanup);
  return next;
}

async function querySession(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return Boolean(response && response.active);
  } catch (_error) {
    return false;
  }
}

async function setActiveBadge(tabId) {
  await chrome.action.setBadgeText({ tabId, text: 'ON' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#e53935' });
  await chrome.action.setTitle({ tabId, title: 'PageWand - Click to deactivate' });
}

async function setInactiveBadge(tabId) {
  await chrome.action.setBadgeText({ tabId, text: '' });
  await chrome.action.setTitle({ tabId, title: 'PageWand - Click to activate' });
}

async function setErrorBadge(tabId, error) {
  await chrome.action.setBadgeText({ tabId, text: '!' });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#b91c1c' });
  await chrome.action.setTitle({
    tabId,
    title: `PageWand could not run here: ${error && error.message ? error.message : 'unsupported page'}`
  });
}

async function activatePageWand(tabId) {
  let cssInserted = false;
  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
    cssInserted = true;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: RUNTIME_FILES
    });

    if (!(await querySession(tabId))) {
      throw new Error('The page did not start a PageWand session');
    }
    await setActiveBadge(tabId);
  } catch (error) {
    if (cssInserted) {
      try {
        await chrome.scripting.removeCSS({ target: { tabId }, files: ['styles.css'] });
      } catch (_removeError) {
        // Best-effort rollback; the page may have navigated.
      }
    }
    await setErrorBadge(tabId, error);
    console.error('PageWand: activation failed', error);
  }
}

async function deactivatePageWand(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'cleanup' });
  } catch (_error) {
    // The page may have navigated or already cleaned itself up.
  }

  try {
    await chrome.scripting.removeCSS({ target: { tabId }, files: ['styles.css'] });
  } catch (_error) {
    // The stylesheet may not be present on this page.
  }
  await setInactiveBadge(tabId);
}

chrome.action.onClicked.addListener((tab) => {
  if (!Number.isInteger(tab.id)) return;
  enqueue(tabQueues, tab.id, async () => {
    if (await querySession(tab.id)) {
      await deactivatePageWand(tab.id);
    } else {
      await activatePageWand(tab.id);
    }
  });
});

function senderStillOwnsActiveTab(sender) {
  if (!sender.tab || !Number.isInteger(sender.tab.id)) {
    return Promise.reject(new Error('Missing sender tab'));
  }
  return chrome.tabs.get(sender.tab.id).then((tab) => {
    const sameDocument = !sender.tab.url || tab.url === sender.tab.url;
    if (!tab.active || tab.windowId !== sender.tab.windowId || !sameDocument) {
      throw new Error('Capture cancelled because the active tab changed');
    }
    return tab;
  });
}

async function captureSenderTab(sender, message, epoch) {
  const validate = async () => {
    await senderStillOwnsActiveTab(sender);
    if ((tabEpochs.get(sender.tab.id) || 0) !== epoch) throw new Error('Capture cancelled because the tab changed');
    if (message.fullPage) {
      const state = await chrome.tabs.sendMessage(sender.tab.id, { action: 'CHECK_CAPTURE', requestId: message.requestId },
        sender.documentId ? { documentId: sender.documentId } : { frameId: 0 });
      if (!state?.valid) throw new Error('Capture session is no longer active');
    }
  };
  await validate();
  const delay = nextCaptureAt - Date.now();
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  await validate();
  nextCaptureAt = Date.now() + 600;
  const dataUrl = await chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' });
  await validate();
  return dataUrl;
}

function safeDownloadFilename(value) {
  const cleaned = String(value || 'asset')
    .replace(/[\\/:*?\"<>|\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return cleaned || 'asset';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.action !== 'string') return undefined;

  if (message.action === 'deactivate' && sender.tab) {
    enqueue(tabQueues, sender.tab.id, () => deactivatePageWand(sender.tab.id));
    return undefined;
  }

  if (message.action === 'SHOOT_TAB' && sender.tab) {
    const epoch = tabEpochs.get(sender.tab.id) || 0;
    tabEpochs.set(sender.tab.id, epoch);
    enqueue(captureQueues, 'all', () => captureSenderTab(sender, message, epoch))
      .then((dataUrl) => sendResponse({ dataUrl, requestId: message.requestId, ...(message.fullPage ? { tileId: message.tileId } : {}) }))
      .catch((error) => sendResponse({ error: error.message, requestId: message.requestId }));
    return true;
  }

  if (message.action === 'DOWNLOAD_ASSET' && sender.tab) {
    const url = String(message.url || '');
    if (!/^(https?:|data:image\/|blob:)/i.test(url)) {
      sendResponse({ success: false, error: 'Unsupported asset URL' });
      return undefined;
    }
    chrome.downloads.download({
      url,
      filename: safeDownloadFilename(message.filename),
      saveAs: false
    }, (downloadId) => {
      const error = chrome.runtime.lastError;
      sendResponse(error
        ? { success: false, error: error.message }
        : { success: true, downloadId });
    });
    return true;
  }

  return undefined;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabQueues.delete(tabId);
  tabEpochs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') tabEpochs.set(tabId, (tabEpochs.get(tabId) || 0) + 1);
  if (changeInfo.status === 'loading') setInactiveBadge(tabId).catch(() => {});
});

chrome.tabs.onActivated?.addListener(() => {
  for (const [id, epoch] of tabEpochs) tabEpochs.set(id, epoch + 1);
});
