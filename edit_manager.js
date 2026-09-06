(function () {
  'use strict';

  const modules = window.__pageWandModules = window.__pageWandModules || {};
  if (modules.EditManager) return;

  class EditManager {
    constructor({ ui, onCommit, showToast }) {
      this.ui = ui;
      this.onCommit = onCommit;
      this.showToast = showToast;
      this.session = null;
      this.handleKeydown = this.handleKeydown.bind(this);
      this.handlePaste = this.handlePaste.bind(this);
    }

    isActive() {
      return Boolean(this.session);
    }

    canEdit(target) {
      if (!target || !target.isConnected) return false;
      const tag = target.tagName.toLowerCase();
      if (['html', 'body', 'script', 'style', 'input', 'textarea', 'select', 'button', 'video', 'audio', 'canvas', 'svg'].includes(tag)) {
        return false;
      }
      // Text-only editing preserves the target and any page-owned event listeners.
      return target.childElementCount === 0;
    }

    start(target) {
      if (this.session) this.finish(false);
      if (!this.canEdit(target)) {
        this.showToast('Choose a text-only element to edit', true);
        return false;
      }

      this.session = {
        target,
        originalText: target.textContent,
        originalContentEditable: target.getAttribute('contenteditable')
      };
      target.setAttribute('contenteditable', 'plaintext-only');
      target.classList.add('pw-editing');
      target.addEventListener('keydown', this.handleKeydown);
      target.addEventListener('paste', this.handlePaste);
      target.focus();
      this.ui.showEditControls(target, () => this.finish(true), () => this.finish(false));
      return true;
    }

    handleKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.finish(false);
      } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        this.finish(true);
      } else {
        event.stopPropagation();
      }
    }

    handlePaste(event) {
      const text = event.clipboardData && event.clipboardData.getData('text/plain');
      if (typeof text !== 'string') return;
      event.preventDefault();
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    finish(save) {
      if (!this.session) return false;
      const { target, originalText, originalContentEditable } = this.session;
      const savedText = target.textContent;
      target.removeEventListener('keydown', this.handleKeydown);
      target.removeEventListener('paste', this.handlePaste);
      target.classList.remove('pw-editing');
      if (originalContentEditable === null) target.removeAttribute('contenteditable');
      else target.setAttribute('contenteditable', originalContentEditable);
      this.ui.hideEditControls();
      this.session = null;

      if (!save) {
        target.textContent = originalText;
        this.showToast('Edit cancelled');
      } else if (savedText !== originalText) {
        this.onCommit({
          label: 'Edit text',
          undo: () => {
            if (!target.isConnected) return false;
            target.textContent = originalText;
            return true;
          }
        });
        this.showToast('Edit saved');
      }
      return true;
    }

    cleanup() {
      if (this.session) this.finish(false);
    }
  }

  modules.EditManager = EditManager;
})();
