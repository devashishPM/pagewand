(function () {
  'use strict';

  const modules = window.__pageWandModules = window.__pageWandModules || {};
  if (modules.AssetDownloader) return;

  const KNOWN_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico', 'bmp', 'avif']);
  const FORMAT_BY_EXTENSION = {
    png: 'PNG', jpg: 'JPEG', jpeg: 'JPEG', gif: 'GIF', webp: 'WebP',
    svg: 'SVG', ico: 'ICO', bmp: 'BMP', avif: 'AVIF'
  };

  function inlineSvgUrl(element) {
    const svg = element.tagName.toLowerCase() === 'svg' ? element : element.closest('svg');
    if (!svg) return null;
    const source = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  }

  function firstBackgroundUrl(element) {
    const value = window.getComputedStyle(element).backgroundImage;
    if (!value || value === 'none') return null;
    const match = value.match(/url\((?:["']?)(.*?)(?:["']?)\)/);
    return match ? match[1] : null;
  }

  function getAssetUrl(element) {
    if (!element || !element.tagName) return null;
    const tag = element.tagName.toLowerCase();
    if (tag === 'img') return element.currentSrc || element.src || null;
    if (tag === 'svg' || element.closest('svg')) return inlineSvgUrl(element);
    if (tag === 'picture') {
      const image = element.querySelector('img');
      if (image) return image.currentSrc || image.src || null;
      const source = element.querySelector('source[srcset]');
      return source ? source.srcset.split(',')[0].trim().split(/\s+/)[0] : null;
    }
    if (tag === 'link' && String(element.rel).split(/\s+/).includes('icon')) return element.href || null;
    return firstBackgroundUrl(element);
  }

  function extensionFromUrl(url) {
    if (/^data:image\/svg\+xml/i.test(url)) return 'svg';
    const mimeMatch = url.match(/^data:image\/([a-z0-9.+-]+)/i);
    if (mimeMatch) {
      const mimeExt = mimeMatch[1].toLowerCase().replace('jpeg', 'jpg').replace('x-icon', 'ico');
      return KNOWN_EXTENSIONS.has(mimeExt) ? mimeExt : '';
    }
    try {
      const name = decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || '');
      const match = name.match(/\.([a-z0-9]+)$/i);
      const ext = match ? match[1].toLowerCase() : '';
      return KNOWN_EXTENSIONS.has(ext) ? ext : '';
    } catch (_error) {
      return '';
    }
  }

  function sanitizeFilename(value) {
    const cleaned = String(value || 'asset')
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/^\.+/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);
    return cleaned || 'asset';
  }

  function filenameFor(url) {
    const extension = extensionFromUrl(url);
    let base = '';
    if (!url.startsWith('data:')) {
      try {
        base = decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || '');
      } catch (_error) {
        base = '';
      }
    }
    if (!base) base = `asset-${Date.now()}${extension ? `.${extension}` : ''}`;
    if (extension && !base.toLowerCase().endsWith(`.${extension}`)) base += `.${extension}`;
    return sanitizeFilename(base);
  }

  function isDownloadableAsset(element) {
    return Boolean(getAssetUrl(element));
  }

  function getAssetInfo(element) {
    const url = getAssetUrl(element);
    const extension = url ? extensionFromUrl(url) : '';
    const tag = element && element.tagName ? element.tagName.toLowerCase() : '';
    const image = tag === 'picture' ? element.querySelector('img') : element;
    const width = image && tag !== 'svg' ? (image.naturalWidth || image.clientWidth || 0) : (element.clientWidth || 0);
    const height = image && tag !== 'svg' ? (image.naturalHeight || image.clientHeight || 0) : (element.clientHeight || 0);
    return {
      url,
      format: FORMAT_BY_EXTENSION[extension] || (tag === 'svg' || element.closest('svg') ? 'SVG' : 'Image'),
      width,
      height,
      note: 'Original file'
    };
  }

  class AssetDownloader {
    constructor(showToast) {
      this.showToast = showToast;
      this.inProgress = false;
    }

    async download(element) {
      if (this.inProgress) {
        this.showToast('A download is already starting', true);
        return false;
      }
      const url = getAssetUrl(element);
      if (!url) {
        this.showToast('No downloadable asset found', true);
        return false;
      }

      this.inProgress = true;
      const filename = filenameFor(url);
      element.classList.add('pw-download-flash');
      window.setTimeout(() => element.classList.remove('pw-download-flash'), 400);

      try {
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ action: 'DOWNLOAD_ASSET', url, filename }, (result) => {
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError) reject(new Error(runtimeError.message));
            else resolve(result);
          });
        });
        if (!response || !response.success) {
          throw new Error(response && response.error ? response.error : 'Download failed');
        }
        this.showToast(`Downloaded original: ${filename}`);
        return true;
      } catch (error) {
        this.showToast(`Download failed: ${error.message}`, true);
        return false;
      } finally {
        this.inProgress = false;
      }
    }
  }

  modules.AssetDownloader = AssetDownloader;
  modules.assetTools = { getAssetUrl, getAssetInfo, isDownloadableAsset, filenameFor, sanitizeFilename };
})();
