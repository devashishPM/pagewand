(function () {
  'use strict';

  const modules = window.__pageWandModules = window.__pageWandModules || {};
  if (modules.ZapUI) return;

  const MODES = [
    ['zap', '⚡', 'Zap', 'Z', 'Remove an element'],
    ['edit', '✎', 'Edit', 'E', 'Edit text-only elements'],
    ['css', '{}', 'CSS', 'C', 'Copy a computed-style snapshot'],
    ['screenshot', '▣', 'Capture', 'S', 'Capture what you see or select an area'],
    ['download', '↓', 'Download', 'D', 'Download the displayed original asset']
  ];

  const COLORS = {
    zap: '#dc2626', edit: '#2563eb', css: '#9333ea', screenshot: '#15803d', download: '#d97706'
  };

  const STYLES = `
    :host { all: initial; color-scheme: light; }
    *, *::before, *::after { box-sizing: border-box; }
    button { font: inherit; }
    [hidden] { display: none !important; }
    .toolbar {
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; pointer-events: auto; display: flex; align-items: center;
      gap: 4px; padding: 6px; max-width: calc(100vw - 16px); overflow-x: auto;
      border: 1px solid #d4d4d8; border-radius: 12px; background: rgba(255,255,255,.97);
      box-shadow: 0 10px 30px rgba(0,0,0,.2); font: 600 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
    }
    .toolbar button { border: 0; border-radius: 8px; background: transparent; color: #3f3f46; padding: 7px 9px; cursor: pointer; white-space: nowrap; }
    .toolbar button:hover { background: #f4f4f5; }
    .toolbar .tool-switcher { display: inline-flex; align-items: center; gap: 6px; color: white; background: var(--mode-color); }
    .toolbar .tool-switcher:hover { background: var(--mode-color); filter: brightness(.94); }
    .toolbar .caret { opacity: .82; font-size: 9px; }
    .toolbar .divider { width: 1px; height: 24px; background: #e4e4e7; flex: 0 0 auto; }
    .toolbar .spacer { flex: 1 0 2px; }
    .toolbar .context-hint { padding: 0 5px; color: #71717a; font-weight: 500; white-space: nowrap; }
    .toolbar kbd { margin-left: 3px; color: #71717a; font: 600 10px ui-monospace,monospace; }
    .toolbar button:focus-visible, .mode:focus-visible, .picker-heading button:focus-visible, .edit-controls button:focus-visible { outline: 3px solid #0ea5e9; outline-offset: 2px; }
    .toolbar button:disabled { opacity: .4; cursor: default; }
    .overlay { position: fixed; inset: 0; z-index: 2147483646; pointer-events: auto; display: grid; place-items: center; padding: 16px; background: rgba(9,9,11,.68); backdrop-filter: blur(3px); }
    .picker-backdrop { position: fixed; inset: 0; z-index: 2147483646; pointer-events: auto; background: transparent; }
    .picker { position: absolute; top: 58px; left: 50%; transform: translateX(-50%); width: min(440px, calc(100vw - 16px)); max-height: calc(100vh - 70px); overflow: auto; border: 1px solid #d4d4d8; border-radius: 14px; background: white; padding: 14px; box-shadow: 0 18px 54px rgba(0,0,0,.28); color: #18181b; font: 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .picker-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 10px; }
    .picker-heading strong { font-size: 15px; }
    .picker-heading button { border: 0; border-radius: 7px; background: transparent; color: #52525b; padding: 5px 8px; cursor: pointer; }
    .picker-heading button:hover { background: #f4f4f5; }
    .card { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; border-radius: 18px; background: white; padding: 24px; box-shadow: 0 24px 80px rgba(0,0,0,.35); font: 14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color: #18181b; }
    .card h1 { margin: 0 0 4px; font-size: 22px; }
    .card p { margin: 0 0 18px; color: #71717a; }
    .modes { display: grid; gap: 8px; }
    .mode { width: 100%; display: grid; grid-template-columns: 28px minmax(76px,auto) 26px 1fr; align-items: center; gap: 10px; border: 1px solid #e4e4e7; border-left: 4px solid var(--mode-color); border-radius: 10px; background: white; padding: 10px 12px; color: #27272a; cursor: pointer; text-align: left; }
    .mode:hover, .mode[aria-current="true"] { background: #fafafa; }
    .mode:hover { transform: translateY(-1px); }
    .mode[aria-current="true"] { box-shadow: inset 0 0 0 1px var(--mode-color); }
    .mode kbd { justify-self: center; border: 1px solid #d4d4d8; border-bottom-width: 2px; border-radius: 4px; background: #f4f4f5; padding: 1px 5px; font: 600 11px ui-monospace,monospace; }
    .mode .desc { color: #71717a; font-size: 12px; }
    .footer { margin-top: 18px; padding-top: 14px; border-top: 1px solid #e4e4e7; color: #71717a; font-size: 12px; }
    .preview, .asset { position: fixed; z-index: 2147483647; pointer-events: none; display: none; max-width: min(560px, calc(100vw - 24px)); max-height: min(420px, calc(100vh - 70px)); overflow: auto; border: 1px solid #d4d4d8; border-left: 4px solid var(--mode-color); border-radius: 10px; background: white; padding: 10px 12px; color: #27272a; box-shadow: 0 14px 36px rgba(0,0,0,.22); font: 12px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .preview strong, .asset strong { display: block; margin-bottom: 6px; color: var(--mode-color); }
    .preview pre { margin: 0; white-space: pre; font: 11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .toast { position: fixed; z-index: 2147483647; left: 50%; bottom: 24px; transform: translateX(-50%); pointer-events: none; max-width: calc(100vw - 24px); border-radius: 8px; background: #27272a; color: white; padding: 9px 14px; box-shadow: 0 8px 24px rgba(0,0,0,.22); font: 500 13px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .toast.error { background: #b91c1c; }
    .edit-controls { position: fixed; z-index: 2147483647; pointer-events: auto; display: none; gap: 6px; padding: 6px; border: 1px solid #d4d4d8; border-radius: 8px; background: white; box-shadow: 0 8px 24px rgba(0,0,0,.2); font: 600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .edit-controls button { border: 0; border-radius: 6px; padding: 7px 11px; cursor: pointer; }
    .edit-controls .save { background: #2563eb; color: white; }
    .edit-controls .cancel { background: #f4f4f5; color: #27272a; }
    @media (max-width: 560px) {
      .toolbar { left: 8px; right: 8px; transform: none; justify-content: flex-start; gap: 2px; padding: 5px; }
      .toolbar button { padding-inline: 6px; }
      .toolbar kbd, .toolbar .action-icon { display: none; }
      .card { padding: 18px; }
      .mode { grid-template-columns: 26px minmax(64px,auto) 24px; }
      .mode .desc { grid-column: 2 / -1; }
    }
    @media (max-width: 340px) {
      .toolbar { flex-wrap: wrap; justify-content: center; overflow: visible; }
      .toolbar .spacer { display: none; }
    }
    @media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; transition: none !important; } }
  `;

  function modeButtons(className) {
    return MODES.map(([mode, icon, label, key, description]) => `
      <button class="${className}" type="button" data-mode="${mode}" style="--mode-color:${COLORS[mode]}" aria-label="${label}: ${description}">
        <span aria-hidden="true">${icon}</span><span class="label">${label}</span><kbd>${key}</kbd><span class="desc">${description}</span>
      </button>`).join('');
  }

  class ZapUI {
    constructor(handlers) {
      this.handlers = handlers;
      this.toastTimer = null;
      this.currentMode = 'zap';
      this.undoCount = 0;
      this.hasParentTarget = false;
      this.host = document.createElement('div');
      this.host.id = 'pw-ui-host';
      this.host.dataset.pwOwned = 'true';
      this.host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      this.root = this.host.attachShadow({ mode: 'open' });
      this.root.innerHTML = `
        <style>${STYLES}</style>
        <nav class="toolbar" aria-label="PageWand toolbar" hidden>
          <button class="tool-switcher" type="button" data-action="choose-mode" aria-haspopup="dialog" aria-expanded="false" aria-label="Current tool: Zap. Choose another tool" style="--mode-color:${COLORS.zap}">
            <span data-role="current-icon" aria-hidden="true">⚡</span><span data-role="current-label">Zap</span><span class="caret" aria-hidden="true">▼</span>
          </button>
          <span class="divider" data-role="context-divider" aria-hidden="true"></span>
          <button type="button" data-action="visible-page" data-context="screenshot" aria-label="Capture the visible part of the page" title="Capture the visible part of the page (1)" hidden><span class="action-icon" aria-hidden="true">▣</span> <span class="label">Visible page</span><kbd>1</kbd></button>
          <button type="button" data-action="area" data-context="screenshot" aria-label="Capture a selected area" title="Capture a selected area (2)" hidden><span class="action-icon" aria-hidden="true">⌗</span> <span class="label">Selected area</span><kbd>2</kbd></button>
          <button type="button" data-action="parent" data-context="zap edit css" aria-label="Select the parent of the highlighted element" title="Hover an element first" disabled><span class="action-icon" aria-hidden="true">↑</span> <span class="label">Parent</span></button>
          <button type="button" data-action="undo" data-context="history" aria-label="Nothing to undo" title="Nothing to undo" hidden disabled><span class="action-icon" aria-hidden="true">↶</span> <span class="label">Undo</span></button>
          <span class="context-hint" data-context="download" hidden>Choose an asset on the page</span>
          <span class="spacer" aria-hidden="true"></span>
          <button type="button" data-action="exit" title="Exit PageWand">× <span class="label">Exit</span></button>
        </nav>
        <div class="picker-backdrop" hidden>
          <section class="picker" role="dialog" aria-labelledby="pw-picker-title">
            <div class="picker-heading"><strong id="pw-picker-title">Choose a tool</strong><button type="button" data-action="close-picker" aria-label="Close tool chooser">×</button></div>
            <div class="modes">${modeButtons('mode picker-mode')}</div>
          </section>
        </div>
        <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="pw-start-title">
          <section class="card">
            <h1 id="pw-start-title">Choose a tool</h1>
            <p>Changes are temporary and stay in this tab.</p>
            <div class="modes">${modeButtons('mode start-mode')}</div>
            <div class="footer">Use the toolbar or Z / E / C / S / D to switch tools. Press Escape to exit.</div>
          </section>
        </div>
        <aside class="preview" style="--mode-color:${COLORS.css}" aria-hidden="true"><strong></strong><pre></pre></aside>
        <aside class="asset" style="--mode-color:${COLORS.download}" aria-hidden="true"><strong></strong><span></span></aside>
        <div class="edit-controls"><button class="save" type="button">Save</button><button class="cancel" type="button">Cancel</button></div>
        <div class="live" role="status" aria-live="polite"></div>`;
      document.documentElement.appendChild(this.host);

      this.overlay = this.root.querySelector('.overlay');
      this.toolbar = this.root.querySelector('.toolbar');
      this.preview = this.root.querySelector('.preview');
      this.asset = this.root.querySelector('.asset');
      this.editControls = this.root.querySelector('.edit-controls');
      this.toolSwitcher = this.root.querySelector('.tool-switcher');
      this.currentIcon = this.root.querySelector('[data-role="current-icon"]');
      this.currentLabel = this.root.querySelector('[data-role="current-label"]');
      this.pickerBackdrop = this.root.querySelector('.picker-backdrop');
      this.contextDivider = this.root.querySelector('[data-role="context-divider"]');
      this.parentButton = this.root.querySelector('[data-action="parent"]');
      this.undoButton = this.root.querySelector('[data-action="undo"]');

      this.root.addEventListener('click', (event) => {
        if (event.target === this.pickerBackdrop) {
          this.closeModePicker(true);
          return;
        }
        const button = event.target.closest('button');
        if (!button) return;
        const mode = button.dataset.mode;
        if (mode) {
          this.handlers.onMode(mode);
          this.closeStart();
          return;
        }
        const action = button.dataset.action;
        if (action === 'undo') this.handlers.onUndo();
        if (action === 'parent') this.handlers.onParent();
        if (action === 'visible-page') this.handlers.onVisiblePage();
        if (action === 'area') this.handlers.onArea();
        if (action === 'exit') this.handlers.onExit();
        if (action === 'choose-mode') {
          if (!this.isChoosingMode() && !this.isStarting() && this.handlers.onChooserOpen) this.handlers.onChooserOpen();
          this.toggleModePicker();
        }
        if (action === 'close-picker') this.closeModePicker(true);
      });
    }

    focusStart() {
      const button = this.root.querySelector('.start-mode[data-mode="zap"]');
      if (button) button.focus();
    }

    closeStart() {
      if (this.overlay) this.overlay.remove();
      this.overlay = null;
      this.toolbar.hidden = false;
    }

    isStarting() {
      return Boolean(this.overlay && this.overlay.isConnected);
    }

    isChoosingMode() {
      return !this.pickerBackdrop.hidden;
    }

    openModePicker() {
      if (this.isStarting()) {
        this.focusStart();
        return;
      }
      this.pickerBackdrop.hidden = false;
      this.toolSwitcher.setAttribute('aria-expanded', 'true');
      const current = this.root.querySelector(`.picker-mode[data-mode="${this.currentMode}"]`);
      if (current) current.focus();
    }

    closeModePicker(returnFocus = false) {
      if (this.pickerBackdrop.hidden) return;
      this.pickerBackdrop.hidden = true;
      this.toolSwitcher.setAttribute('aria-expanded', 'false');
      if (returnFocus) this.toolSwitcher.focus();
    }

    toggleModePicker() {
      if (this.isChoosingMode()) this.closeModePicker(true);
      else this.openModePicker();
    }

    setMode(mode) {
      const details = MODES.find(([value]) => value === mode);
      if (!details) return;
      const [, icon, label] = details;
      this.currentMode = mode;
      this.currentIcon.textContent = icon;
      this.currentLabel.textContent = label;
      this.toolSwitcher.style.setProperty('--mode-color', COLORS[mode]);
      this.toolSwitcher.setAttribute('aria-label', `Current tool: ${label}. Choose another tool`);
      this.root.querySelectorAll('.picker-mode').forEach((button) => {
        if (button.dataset.mode === mode) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      });
      this.closeModePicker();
      this.refreshContext();
    }

    updateUndo(count) {
      this.undoCount = count;
      this.undoButton.disabled = count === 0;
      this.undoButton.title = count ? `Undo last change (${count} available)` : 'Nothing to undo';
      this.undoButton.setAttribute('aria-label', count ? `Undo last change; ${count} available` : 'Nothing to undo');
      this.refreshContext();
    }

    updateParentTarget(available) {
      this.hasParentTarget = available;
      this.parentButton.disabled = !available;
      this.parentButton.title = available ? 'Select the parent of the highlighted element' : 'Hover an element first';
    }

    refreshContext() {
      this.root.querySelectorAll('[data-context]').forEach((element) => {
        const contexts = element.dataset.context.split(/\s+/);
        const visible = contexts.includes(this.currentMode) || (contexts.includes('history') && this.undoCount > 0);
        element.hidden = !visible;
      });
      const hasContext = [...this.root.querySelectorAll('[data-context]')].some((element) => !element.hidden);
      this.contextDivider.hidden = !hasContext;
    }

    showToast(message, isError = false) {
      if (this.toastTimer) window.clearTimeout(this.toastTimer);
      const previous = this.root.querySelector('.toast');
      if (previous) previous.remove();
      const toast = document.createElement('div');
      toast.className = `toast${isError ? ' error' : ''}`;
      toast.setAttribute('role', isError ? 'alert' : 'status');
      toast.textContent = message;
      this.root.appendChild(toast);
      this.toastTimer = window.setTimeout(() => toast.remove(), 2400);
    }

    showCssPreview(output, x, y) {
      this.preview.querySelector('strong').textContent = `${output.selector} · computed snapshot`;
      this.preview.querySelector('pre').textContent = output.cssText;
      this.position(this.preview, x, y);
    }

    hideCssPreview() {
      this.preview.style.display = 'none';
    }

    showAssetTooltip(info, element) {
      this.asset.querySelector('strong').textContent = `${info.format} · ${info.note}`;
      this.asset.querySelector('span').textContent = info.width && info.height ? `${info.width} × ${info.height}` : 'Dimensions unavailable';
      const rect = element.getBoundingClientRect();
      this.position(this.asset, rect.right - 160, rect.bottom);
    }

    hideAssetTooltip() {
      this.asset.style.display = 'none';
    }

    position(element, x, y) {
      element.style.display = 'block';
      element.style.left = `${Math.max(12, x + 14)}px`;
      element.style.top = `${Math.max(60, y + 14)}px`;
      const rect = element.getBoundingClientRect();
      element.style.left = `${Math.max(12, Math.min(x + 14, window.innerWidth - rect.width - 12))}px`;
      element.style.top = `${Math.max(60, Math.min(y + 14, window.innerHeight - rect.height - 12))}px`;
    }

    showEditControls(target, onSave, onCancel) {
      const rect = target.getBoundingClientRect();
      this.editControls.style.display = 'flex';
      this.editControls.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 150))}px`;
      this.editControls.style.top = `${Math.max(54, Math.min(rect.bottom + 6, window.innerHeight - 48))}px`;
      const save = this.editControls.querySelector('.save');
      const cancel = this.editControls.querySelector('.cancel');
      save.onclick = onSave;
      cancel.onclick = onCancel;
    }

    hideEditControls() {
      this.editControls.style.display = 'none';
      this.editControls.querySelector('.save').onclick = null;
      this.editControls.querySelector('.cancel').onclick = null;
    }

    setHidden(hidden) {
      this.host.style.display = hidden ? 'none' : 'block';
    }

    destroy() {
      if (this.toastTimer) window.clearTimeout(this.toastTimer);
      this.host.remove();
    }
  }

  modules.ZapUI = ZapUI;
})();
