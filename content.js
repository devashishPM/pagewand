(function () {
  'use strict';

  if (window.__pageWandSession && window.__pageWandSession.isActive()) return;

  const modules = window.__pageWandModules || {};
  const required = ['createCssExporter', 'AssetDownloader', 'EditManager', 'CaptureController', 'ZapUI'];
  if (required.some((name) => !modules[name])) {
    console.error('PageWand: runtime modules were not loaded');
    return;
  }

  const MODES = new Set(['zap', 'edit', 'css', 'screenshot', 'download']);
  const MODE_KEYS = { z: 'zap', e: 'edit', c: 'css', s: 'screenshot', d: 'download' };
  const CURSOR_CLASSES = ['pw-cursor-crosshair', 'pw-cursor-text', 'pw-cursor-copy', 'pw-cursor-download'];
  const HIGHLIGHT_CLASSES = ['pw-highlight', 'pw-highlight-edit', 'pw-highlight-css', 'pw-highlight-download'];
  const HIGHLIGHT_BY_MODE = {
    zap: 'pw-highlight', edit: 'pw-highlight-edit', css: 'pw-highlight-css', download: 'pw-highlight-download'
  };

  let active = true;
  let currentMode = 'zap';
  let highlightedElement = null;
  const undoStack = [];
  const cssExporter = modules.createCssExporter();

  let ui;
  let editor;
  let downloader;
  let capture;

  function showToast(message, isError = false) {
    if (ui) ui.showToast(message, isError);
  }

  function isOwnedElement(element) {
    return Boolean(element && element.nodeType === Node.ELEMENT_NODE &&
      (element.dataset.pwOwned === 'true' || element.closest('[data-pw-owned="true"]')));
  }

  function isOwnedEvent(event) {
    return event.composedPath().some((node) => isOwnedElement(node));
  }

  function isTypingContext(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    const tag = element.tagName.toLowerCase();
    return ['input', 'textarea', 'select'].includes(tag) || element.isContentEditable;
  }

  function clearTarget() {
    if (highlightedElement) HIGHLIGHT_CLASSES.forEach((name) => highlightedElement.classList.remove(name));
    highlightedElement = null;
    if (ui) {
      ui.updateParentTarget(false);
      ui.hideCssPreview();
      ui.hideAssetTooltip();
    }
  }

  function canTarget(element) {
    if (!element || !element.isConnected || isOwnedElement(element)) return false;
    const tag = element.tagName.toLowerCase();
    return tag !== 'html' && tag !== 'body';
  }

  function highlight(element, clientX, clientY) {
    if (!canTarget(element) || currentMode === 'screenshot') {
      clearTarget();
      return;
    }
    if (currentMode === 'download' && !modules.assetTools.isDownloadableAsset(element)) {
      clearTarget();
      return;
    }
    if (highlightedElement !== element) clearTarget();
    highlightedElement = element;
    element.classList.add(HIGHLIGHT_BY_MODE[currentMode]);
    ui.updateParentTarget(canTarget(element.parentElement));

    if (currentMode === 'css') {
      const output = cssExporter.getCssOutput(element);
      if (output) ui.showCssPreview(output, clientX, clientY);
    } else if (currentMode === 'download') {
      ui.showAssetTooltip(modules.assetTools.getAssetInfo(element), element);
    }
  }

  function handleMouseOver(event) {
    if (!active || ui.isStarting() || editor.isActive() || capture.overlay || window.__pwScreenshotEditorActive || isOwnedEvent(event)) return;
    highlight(event.target, event.clientX, event.clientY);
  }

  function handleMouseOut(event) {
    if (!highlightedElement || event.target !== highlightedElement) return;
    if (event.relatedTarget && highlightedElement.contains(event.relatedTarget)) return;
    if (event.relatedTarget && isOwnedElement(event.relatedTarget)) return;
    clearTarget();
  }

  function pushUndo(operation) {
    undoStack.push(operation);
    if (undoStack.length > 50) undoStack.shift();
    ui.updateUndo(undoStack.length);
  }

  function undoLast() {
    const operation = undoStack.pop();
    if (!operation) {
      showToast('Nothing to undo');
      return;
    }
    let restored = false;
    try {
      restored = operation.undo() !== false;
    } catch (error) {
      console.error('PageWand: undo failed', error);
    }
    ui.updateUndo(undoStack.length);
    showToast(restored ? `Undid: ${operation.label}` : `Could not undo: ${operation.label}`, !restored);
  }

  function zapElement(target) {
    if (!canTarget(target) || !target.parentNode) {
      showToast('That page root cannot be removed', true);
      return;
    }
    const parent = target.parentNode;
    const nextSibling = target.nextSibling;
    const label = target.tagName.toLowerCase();
    target.remove();
    clearTarget();
    pushUndo({
      label: `Remove ${label}`,
      undo: () => {
        if (!parent.isConnected) return false;
        if (nextSibling && nextSibling.parentNode === parent) parent.insertBefore(target, nextSibling);
        else parent.appendChild(target);
        return true;
      }
    });
    showToast(`Removed ${label}`);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied computed CSS');
    } catch (_clipboardError) {
      const area = document.createElement('textarea');
      area.dataset.pwOwned = 'true';
      area.value = text;
      area.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(area);
      area.select();
      try {
        if (!document.execCommand('copy')) throw new Error('Copy command failed');
        showToast('Copied computed CSS');
      } catch (error) {
        showToast(`Copy failed: ${error.message}`, true);
      } finally {
        area.remove();
      }
    }
  }

  function copyCss(target) {
    const output = cssExporter.getCssOutput(target);
    if (!output) {
      showToast('Could not compute styles for that element', true);
      return;
    }
    copyText(output.cssText);
  }

  function handlePageClick(event) {
    if (!active || ui.isStarting() || ui.isChoosingMode() || editor.isActive() || capture.overlay || window.__pwScreenshotEditorActive || isOwnedEvent(event)) return;
    if (currentMode === 'screenshot') return;

    const target = highlightedElement || event.target;
    if (!canTarget(target)) return;
    if (currentMode === 'download' && !modules.assetTools.isDownloadableAsset(target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (currentMode === 'zap') zapElement(target);
    if (currentMode === 'edit') {
      clearTarget();
      editor.start(target);
    }
    if (currentMode === 'css') copyCss(target);
    if (currentMode === 'download') downloader.download(target);
  }

  function cursorForMode(mode) {
    if (mode === 'edit') return 'pw-cursor-text';
    if (mode === 'css') return 'pw-cursor-copy';
    if (mode === 'download') return 'pw-cursor-download';
    return 'pw-cursor-crosshair';
  }

  function setMode(mode, announce = true) {
    if (!MODES.has(mode)) return;
    if (editor && editor.isActive()) editor.finish(false);
    clearTarget();
    currentMode = mode;
    CURSOR_CLASSES.forEach((name) => document.body.classList.remove(name));
    document.body.classList.add(cursorForMode(mode));
    ui.setMode(mode);
    if (!announce) return;
    const messages = {
      zap: 'Zap: click an element to remove it',
      edit: 'Edit: click a text-only element',
      css: 'CSS: click an element to copy its computed snapshot',
      screenshot: 'Capture: choose Visible page or Selected area, or press 1 or 2',
      download: 'Download: click an image, SVG, icon, or background image'
    };
    showToast(messages[mode]);
  }

  function selectParent() {
    if (!highlightedElement) {
      showToast('Hover an element first', true);
      return;
    }
    const parent = highlightedElement.parentElement;
    if (!canTarget(parent)) {
      showToast('Already at the page root', true);
      return;
    }
    const rect = parent.getBoundingClientRect();
    highlight(parent, rect.left, rect.top);
    showToast(`Selected parent: ${parent.tagName.toLowerCase()}`);
  }

  function requestDeactivate() {
    if (!active) return;
    cleanup();
    try {
      chrome.runtime.sendMessage({ action: 'deactivate' });
    } catch (_error) {
      // The session is already locally cleaned up.
    }
  }

  function handleKeyDown(event) {
    if (!active || window.__pwScreenshotEditorActive || editor.isActive()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (ui.isChoosingMode()) {
        ui.closeModePicker(true);
        return;
      }
      if (capture.overlay) {
        capture.cancelAreaCapture();
        return;
      }
      requestDeactivate();
      return;
    }
    if (isTypingContext(event.target)) return;
    if (capture.overlay) return;

    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'z') {
      event.preventDefault();
      event.stopPropagation();
      undoLast();
      return;
    }

    const noModifiers = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
    if (!noModifiers) return;
    if (MODE_KEYS[key]) {
      event.preventDefault();
      setMode(MODE_KEYS[key]);
      ui.closeStart();
      return;
    }
    if (currentMode === 'screenshot' && event.key === '1') {
      event.preventDefault();
      capture.captureViewport();
    } else if (currentMode === 'screenshot' && event.key === '2') {
      event.preventDefault();
      capture.startAreaCapture();
    }
  }

  function messageHandler(message, _sender, sendResponse) {
    if (!message || typeof message.action !== 'string') return undefined;
    if (message.action === 'ping') {
      sendResponse({ active });
      return undefined;
    }
    if (message.action === 'cleanup') {
      cleanup();
      sendResponse({ active: false });
    }
    return undefined;
  }

  function cleanup() {
    if (!active) return;
    active = false;
    document.removeEventListener('mouseover', handleMouseOver, true);
    document.removeEventListener('mouseout', handleMouseOut, true);
    document.removeEventListener('click', handlePageClick, true);
    window.removeEventListener('keydown', handleKeyDown, true);
    chrome.runtime.onMessage.removeListener(messageHandler);
    if (editor) editor.cleanup();
    if (capture) capture.cleanup();
    if (window.ScreenshotEditor && typeof window.ScreenshotEditor.closeActive === 'function') {
      window.ScreenshotEditor.closeActive();
    }
    clearTarget();
    document.querySelectorAll(HIGHLIGHT_CLASSES.map((name) => `.${name}`).join(','))
      .forEach((element) => HIGHLIGHT_CLASSES.forEach((name) => element.classList.remove(name)));
    document.querySelectorAll('.pw-editing,.pw-download-flash').forEach((element) => {
      element.classList.remove('pw-editing', 'pw-download-flash');
    });
    CURSOR_CLASSES.forEach((name) => document.body.classList.remove(name));
    document.body.classList.remove('pw-active');
    if (ui) ui.destroy();
    undoStack.length = 0;
    window.__pageWandActive = false;
    window.__pageWandSession = null;
  }

  ui = new modules.ZapUI({
    onMode: (mode) => setMode(mode),
    onChooserOpen: clearTarget,
    onUndo: undoLast,
    onParent: selectParent,
    onVisiblePage: () => capture.captureViewport(),
    onArea: () => capture.startAreaCapture(),
    onExit: requestDeactivate
  });
  editor = new modules.EditManager({ ui, onCommit: pushUndo, showToast });
  downloader = new modules.AssetDownloader(showToast);
  capture = new modules.CaptureController({ ui, isSessionActive: () => active, clearTarget, showToast });

  window.__pageWandActive = true;
  window.__pageWandSession = { isActive: () => active, cleanup, getMode: () => currentMode };
  document.body.classList.add('pw-active');
  setMode('zap', false);
  ui.updateUndo(0);
  window.setTimeout(() => active && ui.focusStart(), 0);

  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('click', handlePageClick, true);
  window.addEventListener('keydown', handleKeyDown, true);
  chrome.runtime.onMessage.addListener(messageHandler);
})();
