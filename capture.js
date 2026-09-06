(function () {
  'use strict';

  const modules = window.__pageWandModules = window.__pageWandModules || {};
  if (modules.CaptureController) return;

  function nextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  class CaptureController {
    constructor({ ui, isSessionActive, clearTarget, showToast }) {
      this.ui = ui;
      this.isSessionActive = isSessionActive;
      this.clearTarget = clearTarget;
      this.showToast = showToast;
      this.inFlight = false;
      this.sequence = 0;
      this.overlay = null;
      this.escapeHandler = null;
      this.areaCleanup = null;
    }

    async captureViewport(cropRect = null) {
      if (this.inFlight) {
        this.showToast('A capture is already in progress', true);
        return;
      }
      this.inFlight = true;
      const requestId = ++this.sequence;
      this.clearTarget();
      this.ui.setHidden(true);

      try {
        await nextPaint();
        if (!this.isSessionActive() || requestId !== this.sequence) return;
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'SHOOT_TAB', requestId }, (result) => {
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError) reject(new Error(runtimeError.message));
            else resolve(result);
          });
        });
        if (!this.isSessionActive() || requestId !== this.sequence) return;
        if (!response || response.requestId !== requestId) throw new Error('Stale capture response');
        if (response.error) throw new Error(response.error);
        if (!response.dataUrl) throw new Error('Chrome returned no screenshot');
        if (!window.ScreenshotEditor) throw new Error('Screenshot editor is unavailable');
        new window.ScreenshotEditor(response.dataUrl, cropRect);
      } catch (error) {
        if (this.isSessionActive() && requestId === this.sequence) {
          this.showToast(`Capture failed: ${error.message}`, true);
        }
      } finally {
        if (this.isSessionActive() && requestId === this.sequence) this.ui.setHidden(false);
        this.inFlight = false;
      }
    }

    startAreaCapture() {
      if (this.overlay || this.inFlight) {
        this.showToast('Finish the current capture first', true);
        return;
      }

      const overlay = document.createElement('div');
      overlay.id = 'pw-area-overlay';
      overlay.dataset.pwOwned = 'true';
      const box = document.createElement('div');
      box.className = 'pw-selection-box';
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      this.overlay = overlay;

      let startX = 0;
      let startY = 0;
      let dragging = false;
      const cleanupOverlay = () => {
        if (this.escapeHandler) window.removeEventListener('keydown', this.escapeHandler, true);
        this.escapeHandler = null;
        if (this.areaCleanup === cleanupOverlay) this.areaCleanup = null;
        if (overlay.isConnected) overlay.remove();
        if (this.overlay === overlay) this.overlay = null;
      };
      this.areaCleanup = cleanupOverlay;

      overlay.addEventListener('pointerdown', (event) => {
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        overlay.setPointerCapture(event.pointerId);
        Object.assign(box.style, { left: `${startX}px`, top: `${startY}px`, width: '0px', height: '0px' });
      });
      overlay.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        const left = Math.min(startX, event.clientX);
        const top = Math.min(startY, event.clientY);
        Object.assign(box.style, {
          left: `${left}px`, top: `${top}px`,
          width: `${Math.abs(event.clientX - startX)}px`,
          height: `${Math.abs(event.clientY - startY)}px`
        });
      });
      overlay.addEventListener('pointerup', () => {
        if (!dragging) return;
        dragging = false;
        const rect = box.getBoundingClientRect();
        cleanupOverlay();
        if (rect.width < 5 || rect.height < 5) {
          this.showToast('Selection was too small', true);
          return;
        }
        this.captureViewport({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
      });

      this.escapeHandler = (event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.cancelAreaCapture();
      };
      window.addEventListener('keydown', this.escapeHandler, true);
    }

    cancelAreaCapture(announce = true) {
      if (!this.overlay) return false;
      if (this.areaCleanup) this.areaCleanup();
      else {
        if (this.escapeHandler) window.removeEventListener('keydown', this.escapeHandler, true);
        this.escapeHandler = null;
        this.overlay.remove();
        this.overlay = null;
      }
      if (announce) this.showToast('Selected area cancelled');
      return true;
    }

    cleanup() {
      this.sequence += 1;
      this.inFlight = false;
      this.cancelAreaCapture(false);
    }
  }

  modules.CaptureController = CaptureController;
})();
