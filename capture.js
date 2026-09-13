(function () {
  'use strict';

  const modules = window.__pageWandModules = window.__pageWandModules || {};
  if (modules.CaptureController) return;

  function nextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  // Prefer the document. Only fall back to a dominant, visible app workspace.
  function captureTarget() {
    const doc = (document.scrollingElement || document.documentElement);
    if (doc.scrollHeight > doc.clientHeight + 2) return doc;
    const candidates = [...document.querySelectorAll('*')].filter(el => {
      if (el === doc || el.closest('[data-pw-owned="true"]')) return false;
      const css = getComputedStyle(el), b = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(innerWidth, b.right) - Math.max(0, b.left));
      const h = Math.max(0, Math.min(innerHeight, b.bottom) - Math.max(0, b.top));
      return ['auto', 'scroll'].includes(css.overflowY) && css.visibility === 'visible' &&
        el.scrollHeight > el.clientHeight + 30 && w >= innerWidth * .45 && h >= innerHeight * .45 &&
        w * h >= innerWidth * innerHeight * .35;
    });
    const outer = candidates.filter(el => !candidates.some(parent => parent !== el && parent.contains(el)));
    const area = el => { const b = el.getBoundingClientRect(); return Math.min(b.width, innerWidth) * Math.min(b.height, innerHeight); };
    outer.sort((a, b) => area(b) - area(a));
    if (outer.length > 1 && area(outer[0]) < area(outer[1]) * 1.5) {
      throw new Error('Multiple scrolling panels found. Use Selected area for the panel you need');
    }
    return outer[0] || doc;
  }

  function captureBox(root) {
    if (root === (document.scrollingElement || document.documentElement)) return { x: 0, y: 0, width: root.clientWidth, height: root.clientHeight };
    const b = root.getBoundingClientRect();
    if (Math.abs(b.width - root.offsetWidth) > 1 || Math.abs(b.height - root.offsetHeight) > 1) {
      throw new Error('This scrolling panel is transformed. Use Selected area');
    }
    const x = b.left + root.clientLeft, y = b.top + root.clientTop;
    let right = Math.min(innerWidth, x + root.clientWidth), bottom = Math.min(innerHeight, y + root.clientHeight);
    let left = Math.max(0, x), top = Math.max(0, y);
    for (let parent = root.parentElement; parent; parent = parent.parentElement) {
      const css = getComputedStyle(parent), rect = parent.getBoundingClientRect();
      if (['hidden','clip','auto','scroll'].includes(css.overflowX)) {
        left = Math.max(left, rect.left + parent.clientLeft);
        right = Math.min(right, rect.left + parent.clientLeft + parent.clientWidth);
      }
      if (['hidden','clip','auto','scroll'].includes(css.overflowY)) {
        top = Math.max(top, rect.top + parent.clientTop);
        bottom = Math.min(bottom, rect.top + parent.clientTop + parent.clientHeight);
      }
    }
    if (left > x + 1 || top > y + 1 || bottom < y + root.clientHeight - 1 || right <= left) {
      throw new Error('Bring the scrolling panel fully into view before capturing');
    }
    return { x: left, y: top, width: right - left, height: root.clientHeight };
  }

  modules.captureTarget = captureTarget;

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

    cancelFullPage(reason = 'Full-page capture cancelled') {
      if (!this.fullSession) return false;
      this.fullSession.error = reason;
      return true;
    }

    async captureFullPage() {
      if (this.inFlight || this.overlay) return;
      if (!/^https?:$/.test(location.protocol)) {
        this.showToast('Full page works on ordinary HTTP and HTTPS pages.', true);
        return;
      }
      let root, box;
      try { root = captureTarget(); box = captureBox(root); }
      catch (error) { this.showToast(error.message, true); return; }
      const isPanel = root !== (document.scrollingElement || document.documentElement);
      const readY = () => isPanel ? root.scrollTop : scrollY;
      const scroll = (left, top) => (isPanel ? root : window).scrollTo({ left, top, behavior: 'instant' });
      const session = this.fullSession = {
        id: ++this.sequence, error: '', started: Date.now(),
        width: innerWidth, height: innerHeight, contentHeight: box.height, dpr: devicePixelRatio,
        x: isPanel ? root.scrollLeft : scrollX, y: readY(), focus: document.activeElement,
        styles: [], styled: new WeakMap(), animations: [], canvas: null
      };
      this.inFlight = true;
      this.clearTarget();
      const check = () => {
        if (!this.isSessionActive() || this.sequence !== session.id) throw new Error('Capture cancelled');
        if (session.error) throw new Error(session.error);
        if (!root.isConnected) throw new Error('The scrolling panel was removed');
        if (isPanel) {
          const current = captureBox(root);
          if (Object.keys(box).some(key => Math.abs(box[key] - current[key]) > 1)) {
            throw new Error('The scrolling panel moved or resized during capture');
          }
        }
        if (document.hidden) throw new Error('Capture cancelled because the tab changed');
        if (innerWidth !== session.width || innerHeight !== session.height || devicePixelRatio !== session.dpr) {
          throw new Error('Capture cancelled because the viewport or zoom changed');
        }
        if (Date.now() - session.started > 90000) throw new Error('This page took too long to capture');
      };
      const wait = async (ms = 0) => { await new Promise(resolve => setTimeout(resolve, ms)); check(); };
      const paint = async () => { await wait(40); await Promise.race([nextPaint(), new Promise(resolve => setTimeout(resolve, 250))]); check(); };
      const style = (el, name, value) => {
        let names = session.styled.get(el);
        if (!names) session.styled.set(el, names = new Set());
        if (names.has(name)) return;
        names.add(name);
        session.styles.push([el, name, el.style.getPropertyValue(name), el.style.getPropertyPriority(name), value]);
        el.style.setProperty(name, value, 'important');
      };
      const normalize = (hideFixed) => {
        for (const el of (isPanel ? root : document).querySelectorAll('*')) {
          if (el.dataset.pwOwned === 'true' || el.closest('[data-pw-owned="true"]')) continue;
          if (isPanel) {
            let ancestor = el.parentElement, nested = false;
            while (ancestor && ancestor !== root) {
              if (ancestor.scrollHeight > ancestor.clientHeight + 2 && ['auto','scroll'].includes(getComputedStyle(ancestor).overflowY)) { nested = true; break; }
              ancestor = ancestor.parentElement;
            }
            if (nested) continue;
          }
          const css = getComputedStyle(el);
          if (css.position === 'sticky') style(el, 'position', 'static');
          if (hideFixed && css.position === 'fixed') style(el, 'visibility', 'hidden');
        }
      };
      const height = () => Math.max(root.scrollHeight, session.contentHeight);
      const tileCount = h => 1 + Math.max(0, Math.ceil((h - session.contentHeight) / Math.max(1, session.contentHeight - 32)));
      const limits = (h, scale = session.dpr) => {
        const w = Math.round(box.width * scale), pixelsH = Math.round(h * scale);
        if (w * pixelsH > 24000000 || w > 30000 || pixelsH > 30000 || tileCount(h) > 60) {
          throw new Error('This page is too large for a single image. Try Selected area');
        }
      };
      const move = async y => {
        check();
        scroll(0, y);
        await paint();
        const actual = readY();
        await wait(40);
        if (Math.abs(readY() - actual) > 1) throw new Error('The page kept moving while capturing');
        return actual;
      };
      const imagesReady = async () => {
        const deadline = Date.now() + 1000;
        const images = [...document.images].filter(el => {
          const b = el.getBoundingClientRect(); return (!isPanel || root.contains(el)) && b.bottom > box.y && b.top < box.y + box.height;
        });
        while (images.some(el => !el.complete) && Date.now() < deadline) await wait(80);
        const decoded = await Promise.race([
          Promise.all(images.map(el => el.decode().then(() => true, () => false))),
          new Promise(resolve => setTimeout(() => resolve(null), Math.max(0, deadline - Date.now())))
        ]);
        check();
        if (!decoded || decoded.includes(false)) session.missingImages = true;
      };
      const abortHidden = () => { if (document.hidden) this.cancelFullPage('Capture cancelled because the tab changed'); };
      const abortPage = () => this.cancelFullPage('Capture cancelled because the page changed');
      const abortInput = event => {
        if (event.composedPath().includes(this.ui.host)) return;
        if (event.type === 'keydown' && !['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) return;
        this.cancelFullPage('Capture cancelled because you interacted with the page');
      };
      document.addEventListener('visibilitychange', abortHidden);
      window.addEventListener('pagehide', abortPage);
      for (const type of ['wheel','touchstart','pointerdown','keydown']) window.addEventListener(type, abortInput, true);
      session.restore = () => {
        if (session.restored) return;
        session.restored = true;
        for (const [el, name, value, priority, applied] of session.styles.reverse()) {
          if (el.style.getPropertyValue(name) === applied && el.style.getPropertyPriority(name) === 'important') {
            if (value) el.style.setProperty(name, value, priority); else el.style.removeProperty(name);
          }
        }
        for (const animation of session.animations) {
          try { if (animation.playState === 'paused') animation.play(); } catch (_error) { /* Site removed animation. */ }
        }
        scroll(session.x, session.y);
        if (session.focus?.isConnected) session.focus.focus({ preventScroll: true });
      };
      let output;
      try {
        this.ui.setCaptureProgress(isPanel ? 'Preparing main scrolling panel… Keep this tab active.' : 'Preparing page… Keep this tab active.', () => this.cancelFullPage());
        if (root.scrollWidth > box.width + 1) {
          this.ui.setCaptureProgress('Capturing viewport width only; content to the right is excluded. Esc to cancel.', () => this.cancelFullPage());
          await wait(2200);
        }
        for (const el of new Set(isPanel ? [root] : [root, document.documentElement, document.body])) {
          style(el, 'scroll-behavior', 'auto'); style(el, 'scroll-snap-type', 'none'); style(el, 'overflow-anchor', 'none');
        }
        for (const animation of document.getAnimations()) {
          if (animation.playState === 'running') { animation.pause(); session.animations.push(animation); }
        }
        normalize(false);
        limits(height());
        const prepDeadline = Date.now() + 15000;
        let y = 0;
        while (true) {
          if (Date.now() > prepDeadline) throw new Error('The page took too long to prepare');
          const actual = await move(y);
          await imagesReady(); limits(height());
          if (Date.now() > prepDeadline) throw new Error('The page took too long to prepare');
          if (actual + session.contentHeight >= height() - 1) break;
          y = actual + session.contentHeight - 32;
        }
        await move(0); await imagesReady();
        const targetHeight = height();
        await wait(200);
        if (height() !== targetHeight) throw new Error('The page kept changing while capturing. Try again after it finishes loading');
        let covered = 0, tile = 0, scale, outputWidth, ctx;
        while (covered < targetHeight) {
          check();
          if (tile >= 60) throw new Error('This page needs too many capture sections');
          normalize(tile > 0);
          const actualY = await move(tile ? covered - 32 : 0);
          await imagesReady();
          if (height() !== targetHeight) throw new Error('The page kept changing while capturing. Try again after it finishes loading');
          this.ui.setCaptureProgress(`Capturing ${isPanel ? 'main panel · ' : ''}section ${tile + 1} of ${tileCount(targetHeight)} · Esc to cancel`, () => this.cancelFullPage());
          await wait(100);
          this.ui.setHidden(true);
          await paint();
          const data = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Screenshot request timed out')), 8000);
            chrome.runtime.sendMessage({ action: 'SHOOT_TAB', requestId: session.id, fullPage: true, tileId: tile }, response => {
              clearTimeout(timer);
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else if (!response || response.error) reject(new Error(response?.error || 'No screenshot returned'));
              else if (response.requestId !== session.id || response.tileId !== tile) reject(new Error('Stale capture response'));
              else resolve(response.dataUrl);
            });
          });
          check();
          if (Math.abs(readY() - actualY) > 1 || height() !== targetHeight) throw new Error('The page moved during the screenshot');
          const blob = await (await fetch(data)).blob();
          const bitmap = await createImageBitmap(blob);
          try {
            check();
            const sx = bitmap.width / ((window.visualViewport?.width || (document.scrollingElement || document.documentElement).clientWidth) + session.width - (document.scrollingElement || document.documentElement).clientWidth);
            const sy = bitmap.height / ((window.visualViewport?.height || (document.scrollingElement || document.documentElement).clientHeight) + session.height - (document.scrollingElement || document.documentElement).clientHeight);
            if (Math.abs(sx - sy) > 0.01) throw new Error('Screenshot scale changed');
            if (!ctx) {
              scale = sy; limits(targetHeight, scale);
              outputWidth = Math.round(box.width * scale);
              session.canvas = document.createElement('canvas');
              session.canvas.width = outputWidth; session.canvas.height = Math.round(targetHeight * scale);
              ctx = session.canvas.getContext('2d');
              if (!ctx) throw new Error('Could not allocate screenshot');
            } else if (Math.abs(sx - scale) > 0.001) throw new Error('Screenshot scale changed');
            const end = Math.min(targetHeight, actualY + session.contentHeight);
            if (actualY > covered + 1 || end <= covered) throw new Error('Could not capture a continuous page');
            const topPx = Math.round(covered * scale), endPx = Math.round(end * scale);
            ctx.drawImage(bitmap, Math.round(box.x * scale), Math.round(box.y * scale) + topPx - Math.round(actualY * scale), outputWidth, endPx - topPx,
              0, topPx, outputWidth, endPx - topPx);
            covered = end;
          } finally { bitmap.close(); }
          tile++;
          this.ui.setHidden(false);
        }
        check();
        output = { canvas: session.canvas, scale, notice: [isPanel ? 'Captured the main scrolling panel. Other scrollable widgets keep their current view.' : '', session.missingImages ? 'Some images did not finish loading. Review before sharing.' : ''].filter(Boolean).join(' ') };
      } catch (error) {
        if (this.isSessionActive()) this.showToast(error.message, true);
      } finally {
        document.removeEventListener('visibilitychange', abortHidden);
        window.removeEventListener('pagehide', abortPage);
        for (const type of ['wheel','touchstart','pointerdown','keydown']) window.removeEventListener(type, abortInput, true);
        session.restore();
        if (this.fullSession === session) {
          this.fullSession = null; this.inFlight = false;
          if (this.isSessionActive()) { this.ui.setHidden(false); this.ui.setCaptureProgress(null); }
        }
        if (output && this.isSessionActive() && !session.error && session.id === this.sequence) {
          try { new window.ScreenshotEditor(output); } catch (error) {
            session.canvas.width = 0; session.canvas.height = 0;
            window.ScreenshotEditor.closeActive();
            this.showToast(`Could not open screenshot: ${error.message}`, true);
          }
        } else if (session.canvas) { session.canvas.width = 0; session.canvas.height = 0; }
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
      this.cancelFullPage();
      this.fullSession?.restore?.();
      this.sequence += 1;
      this.inFlight = false;
      this.cancelAreaCapture(false);
    }
  }

  modules.CaptureController = CaptureController;
})();
