(function () {
  'use strict';
  if (window.ScreenshotEditor) return;

  const STYLES = `
    :host { all: initial; color-scheme: light; }
    *, *::before, *::after { box-sizing: border-box; }
    .modal { position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 16px; background: rgba(9,9,11,.9); font: 14px/1.3 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    .toolbar { pointer-events: auto; display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; max-width: calc(100vw - 24px); padding: 9px; border-radius: 12px; background: white; box-shadow: 0 10px 36px rgba(0,0,0,.45); }
    .group { display: flex; flex-wrap: wrap; gap: 6px; }
    .actions { padding-left: 8px; border-left: 1px solid #e4e4e7; }
    button { border: 1px solid #d4d4d8; border-radius: 7px; background: #f4f4f5; color: #27272a; padding: 7px 10px; font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
    button:hover { background: #e4e4e7; }
    button[aria-pressed="true"] { border-color: #166534; background: #15803d; color: white; }
    button:focus-visible { outline: 3px solid #38bdf8; outline-offset: 2px; }
    .close { font-size: 16px; }
    .canvas-wrap { pointer-events: auto; max-width: 94vw; max-height: calc(100vh - 96px); overflow: auto; border-radius: 6px; background: white; box-shadow: 0 0 40px rgba(0,0,0,.55); }
    canvas { display: block; max-width: none; touch-action: none; cursor: crosshair; }
    .text-input { position: fixed; z-index: 2; min-width: 70px; border: 2px dashed #15803d; background: white; color: #b91c1c; padding: 4px; outline: none; font: 700 20px/1.2 sans-serif; }
    .status { min-height: 18px; color: white; font-size: 12px; }
    .status.error { color: #fecaca; }
    @media (max-width: 640px) { .modal { justify-content: flex-start; } .actions { padding-left: 0; border-left: 0; } .canvas-wrap { max-height: calc(100vh - 150px); } }
  `;

  class ScreenshotEditor {
    constructor(dataUrl, cropRect = null) {
      ScreenshotEditor.closeActive();
      this.dataUrl = dataUrl;
      this.cropRect = cropRect;
      this.activeTool = 'rect';
      this.color = '#dc2626';
      this.history = [];
      this.isDrawing = false;
      this.snapshot = null;
      this.textInput = null;
      this.onKeydown = this.onKeydown.bind(this);
      this.createModal();
      this.loadImage();
      ScreenshotEditor.activeInstance = this;
      window.__pwScreenshotEditorActive = true;
    }

    createModal() {
      this.host = document.createElement('div');
      this.host.id = 'pw-screenshot-host';
      this.host.dataset.pwOwned = 'true';
      this.host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
      this.root = this.host.attachShadow({ mode: 'open' });
      this.root.innerHTML = `
        <style>${STYLES}</style>
        <section class="modal" role="dialog" aria-modal="true" aria-label="Screenshot editor">
          <div class="toolbar" role="toolbar" aria-label="Screenshot annotation tools">
            <div class="group tools">
              <button type="button" data-tool="rect" aria-label="Draw rectangle" aria-pressed="true">□ Rectangle</button>
              <button type="button" data-tool="arrow" aria-label="Draw arrow" aria-pressed="false">↗ Arrow</button>
              <button type="button" data-tool="text" aria-label="Add text" aria-pressed="false">T Text</button>
              <button type="button" data-tool="pixelate" aria-label="Pixelate an area; not secure redaction" aria-pressed="false">▦ Pixelate</button>
              <button type="button" data-tool="redact" aria-label="Cover an area with an opaque redaction" aria-pressed="false">■ Redact</button>
            </div>
            <div class="group actions">
              <button type="button" data-action="undo" aria-label="Undo last annotation">↶ Undo</button>
              <button type="button" data-action="copy" aria-label="Copy annotated screenshot">Copy</button>
              <button type="button" data-action="download" aria-label="Download annotated screenshot">Download</button>
              <button class="close" type="button" data-action="close" aria-label="Close screenshot editor">×</button>
            </div>
          </div>
          <div class="canvas-wrap"><canvas aria-label="Screenshot annotation canvas"></canvas></div>
          <div class="status" role="status" aria-live="polite">Escape closes the editor.</div>
        </section>`;
      document.documentElement.appendChild(this.host);
      this.canvas = this.root.querySelector('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.status = this.root.querySelector('.status');

      this.root.addEventListener('click', (event) => {
        const button = event.target.closest('button');
        if (!button) return;
        if (button.dataset.tool) this.setTool(button.dataset.tool);
        if (button.dataset.action === 'undo') this.undo();
        if (button.dataset.action === 'copy') this.copyToClipboard();
        if (button.dataset.action === 'download') this.download();
        if (button.dataset.action === 'close') this.close();
      });
      this.canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
      this.canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
      this.canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
      this.canvas.addEventListener('pointercancel', () => this.cancelStroke());
      window.addEventListener('keydown', this.onKeydown, true);
      this.root.querySelector('[data-tool="rect"]').focus();
    }

    setStatus(message, isError = false) {
      this.status.textContent = message;
      this.status.classList.toggle('error', isError);
    }

    setTool(tool) {
      this.activeTool = tool;
      this.root.querySelectorAll('[data-tool]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.tool === tool));
      });
      this.setStatus(tool === 'redact' ? 'Redact creates an opaque cover.' : `${tool[0].toUpperCase()}${tool.slice(1)} tool selected.`);
    }

    loadImage() {
      const image = new Image();
      image.onload = () => {
        const ratio = window.devicePixelRatio || 1;
        let sourceX = 0;
        let sourceY = 0;
        let sourceWidth = image.width;
        let sourceHeight = image.height;
        if (this.cropRect) {
          sourceX = Math.max(0, Math.round(this.cropRect.x * ratio));
          sourceY = Math.max(0, Math.round(this.cropRect.y * ratio));
          sourceWidth = Math.min(image.width - sourceX, Math.max(1, Math.round(this.cropRect.width * ratio)));
          sourceHeight = Math.min(image.height - sourceY, Math.max(1, Math.round(this.cropRect.height * ratio)));
        }
        this.canvas.width = sourceWidth;
        this.canvas.height = sourceHeight;
        this.canvas.style.width = `${sourceWidth / ratio}px`;
        this.canvas.style.height = `${sourceHeight / ratio}px`;
        this.ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight);
        this.saveState();
        this.setStatus('Screenshot ready. Escape closes the editor.');
      };
      image.onerror = () => this.setStatus('Could not load the captured screenshot.', true);
      image.src = this.dataUrl;
    }

    saveState() {
      this.history.push(this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height));
      if (this.history.length > 20) this.history.shift();
    }

    undo() {
      if (this.history.length <= 1) {
        this.setStatus('Nothing to undo.');
        return;
      }
      this.history.pop();
      this.ctx.putImageData(this.history[this.history.length - 1], 0, 0);
      this.setStatus('Undid the last annotation.');
    }

    point(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * (this.canvas.width / rect.width),
        y: (event.clientY - rect.top) * (this.canvas.height / rect.height)
      };
    }

    onPointerDown(event) {
      if (this.activeTool === 'text') {
        this.openTextInput(event);
        return;
      }
      this.isDrawing = true;
      this.start = this.point(event);
      this.snapshot = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.canvas.setPointerCapture(event.pointerId);
    }

    onPointerMove(event) {
      if (!this.isDrawing) return;
      const point = this.point(event);
      this.ctx.putImageData(this.snapshot, 0, 0);
      if (this.activeTool === 'rect') this.drawRect(point);
      if (this.activeTool === 'arrow') this.drawArrow(point);
      if (this.activeTool === 'pixelate') this.drawCover(point, 'rgba(255,255,255,.55)');
      if (this.activeTool === 'redact') this.drawCover(point, '#111827');
    }

    onPointerUp(event) {
      if (!this.isDrawing) return;
      this.isDrawing = false;
      const point = this.point(event);
      this.ctx.putImageData(this.snapshot, 0, 0);
      if (this.activeTool === 'rect') this.drawRect(point);
      if (this.activeTool === 'arrow') this.drawArrow(point);
      if (this.activeTool === 'pixelate') this.applyPixelate(point);
      if (this.activeTool === 'redact') this.drawCover(point, '#111827');
      this.saveState();
    }

    cancelStroke() {
      if (this.isDrawing && this.snapshot) this.ctx.putImageData(this.snapshot, 0, 0);
      this.isDrawing = false;
    }

    drawRect(point) {
      this.ctx.lineWidth = 4;
      this.ctx.strokeStyle = this.color;
      this.ctx.strokeRect(this.start.x, this.start.y, point.x - this.start.x, point.y - this.start.y);
    }

    drawArrow(point) {
      const angle = Math.atan2(point.y - this.start.y, point.x - this.start.x);
      const head = 16;
      this.ctx.beginPath();
      this.ctx.lineWidth = 4;
      this.ctx.lineCap = 'round';
      this.ctx.strokeStyle = this.color;
      this.ctx.moveTo(this.start.x, this.start.y);
      this.ctx.lineTo(point.x, point.y);
      this.ctx.moveTo(point.x, point.y);
      this.ctx.lineTo(point.x - head * Math.cos(angle - Math.PI / 6), point.y - head * Math.sin(angle - Math.PI / 6));
      this.ctx.moveTo(point.x, point.y);
      this.ctx.lineTo(point.x - head * Math.cos(angle + Math.PI / 6), point.y - head * Math.sin(angle + Math.PI / 6));
      this.ctx.stroke();
    }

    region(point) {
      return {
        x: Math.min(this.start.x, point.x), y: Math.min(this.start.y, point.y),
        width: Math.abs(point.x - this.start.x), height: Math.abs(point.y - this.start.y)
      };
    }

    drawCover(point, color) {
      const region = this.region(point);
      this.ctx.fillStyle = color;
      this.ctx.fillRect(region.x, region.y, region.width, region.height);
    }

    applyPixelate(point) {
      const region = this.region(point);
      if (region.width < 2 || region.height < 2) return;
      const scale = 10;
      const sampleWidth = Math.max(1, Math.floor(region.width / scale));
      const sampleHeight = Math.max(1, Math.floor(region.height / scale));
      const buffer = document.createElement('canvas');
      buffer.width = sampleWidth;
      buffer.height = sampleHeight;
      const bufferContext = buffer.getContext('2d');
      bufferContext.imageSmoothingEnabled = false;
      bufferContext.drawImage(this.canvas, region.x, region.y, region.width, region.height, 0, 0, sampleWidth, sampleHeight);
      this.ctx.imageSmoothingEnabled = false;
      this.ctx.drawImage(buffer, 0, 0, sampleWidth, sampleHeight, region.x, region.y, region.width, region.height);
      this.ctx.imageSmoothingEnabled = true;
    }

    openTextInput(event) {
      if (this.textInput) this.textInput.remove();
      const point = this.point(event);
      const input = document.createElement('div');
      input.className = 'text-input';
      input.contentEditable = 'plaintext-only';
      input.setAttribute('role', 'textbox');
      input.setAttribute('aria-label', 'Annotation text');
      input.style.left = `${event.clientX}px`;
      input.style.top = `${event.clientY}px`;
      this.root.appendChild(input);
      this.textInput = input;

      const finish = (commit) => {
        if (!input.isConnected) return;
        const text = input.textContent.trim();
        input.remove();
        this.textInput = null;
        if (!commit || !text) return;
        const ratio = this.canvas.width / parseFloat(this.canvas.style.width || this.canvas.width);
        this.ctx.font = `700 ${20 * ratio}px sans-serif`;
        this.ctx.textBaseline = 'top';
        this.ctx.fillStyle = this.color;
        this.ctx.fillText(text, point.x + 4, point.y + 4);
        this.saveState();
      };
      input.addEventListener('keydown', (keyEvent) => {
        keyEvent.stopPropagation();
        if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) {
          keyEvent.preventDefault();
          finish(true);
        } else if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault();
          finish(false);
        }
      });
      input.addEventListener('blur', () => finish(true), { once: true });
      input.focus();
    }

    onKeydown(event) {
      if (event.key !== 'Escape' || this.textInput) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      this.close();
    }

    canvasBlob() {
      return new Promise((resolve, reject) => {
        this.canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create PNG')), 'image/png');
      });
    }

    async download() {
      try {
        const blob = await this.canvasBlob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = 'pagewand-capture.png';
        link.href = url;
        link.dataset.pwOwned = 'true';
        this.root.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.setStatus('Downloaded PNG.');
      } catch (error) {
        this.setStatus(`Download failed: ${error.message}`, true);
      }
    }

    async copyToClipboard() {
      try {
        const blob = await this.canvasBlob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        this.setStatus('Copied PNG to the clipboard.');
      } catch (error) {
        this.setStatus(`Clipboard copy failed: ${error.message}`, true);
      }
    }

    close() {
      if (!this.host) return;
      window.removeEventListener('keydown', this.onKeydown, true);
      if (this.textInput) this.textInput.remove();
      this.host.remove();
      this.host = null;
      if (ScreenshotEditor.activeInstance === this) ScreenshotEditor.activeInstance = null;
      window.__pwScreenshotEditorActive = false;
    }

    static closeActive() {
      if (ScreenshotEditor.activeInstance) ScreenshotEditor.activeInstance.close();
      const staleHost = document.getElementById('pw-screenshot-host');
      if (staleHost) staleHost.remove();
      window.__pwScreenshotEditorActive = false;
    }
  }

  ScreenshotEditor.activeInstance = null;
  window.ScreenshotEditor = ScreenshotEditor;
})();
