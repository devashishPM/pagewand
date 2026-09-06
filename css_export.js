(function () {
  'use strict';

  const modules = window.__pageWandModules = window.__pageWandModules || {};
  if (modules.createCssExporter) return;

  const PROPERTIES = [
    'display', 'position', 'top', 'right', 'bottom', 'left', 'z-index',
    'float', 'clear', 'overflow', 'overflow-x', 'overflow-y',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'margin', 'padding', 'box-sizing', 'border', 'border-radius',
    'flex', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items',
    'align-content', 'gap', 'grid-template-columns', 'grid-template-rows',
    'grid-area', 'grid-column', 'grid-row',
    'font-family', 'font-size', 'font-weight', 'font-style', 'line-height',
    'text-align', 'text-decoration', 'text-transform', 'letter-spacing',
    'color', 'white-space', 'word-break',
    'background-color', 'background-image', 'background-size',
    'background-position', 'box-shadow', 'opacity', 'transform',
    'transition', 'animation'
  ];

  const GENERIC_DEFAULTS = new Set([
    'position:static', 'top:auto', 'right:auto', 'bottom:auto', 'left:auto',
    'z-index:auto', 'float:none', 'clear:none', 'overflow:visible',
    'overflow-x:visible', 'overflow-y:visible', 'min-width:0px',
    'min-height:0px', 'max-width:none', 'max-height:none', 'margin:0px',
    'padding:0px', 'border:0px none rgb(0, 0, 0)', 'border-radius:0px',
    'flex:0 1 auto', 'flex-wrap:nowrap', 'align-content:normal', 'gap:normal',
    'grid-template-columns:none', 'grid-template-rows:none', 'grid-area:auto',
    'grid-column:auto', 'grid-row:auto', 'font-style:normal',
    'text-decoration:rgb(0, 0, 0) solid none', 'text-transform:none',
    'letter-spacing:normal', 'white-space:normal', 'word-break:normal',
    'background-color:rgba(0, 0, 0, 0)', 'background-image:none',
    'background-size:auto', 'background-position:0% 0%', 'box-shadow:none',
    'opacity:1', 'transform:none', 'transition:all 0s ease 0s',
    'animation:none 0s ease 0s 1 normal none running'
  ]);

  function escapeIdentifier(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.codePointAt(0).toString(16)} `);
  }

  function buildSelector(target) {
    let selector = target.tagName.toLowerCase();
    if (target.id) selector += `#${escapeIdentifier(target.id)}`;
    const classes = typeof target.className === 'string'
      ? target.className.split(/\s+/).filter((name) => name && !name.startsWith('pw-'))
      : [];
    if (classes.length) selector += classes.map((name) => `.${escapeIdentifier(name)}`).join('');
    return selector;
  }

  function createCssExporter() {
    return {
      getCssOutput(target) {
        if (!target || !target.tagName) return null;
        const highlightClasses = ['pw-highlight-css', 'pw-highlight', 'pw-highlight-edit', 'pw-highlight-download'];
        const removed = highlightClasses.filter((name) => target.classList.contains(name));
        removed.forEach((name) => target.classList.remove(name));

        const cursorClasses = ['pw-cursor-crosshair', 'pw-cursor-text', 'pw-cursor-copy', 'pw-cursor-download'];
        const bodyClasses = cursorClasses.filter((name) => document.body.classList.contains(name));
        bodyClasses.forEach((name) => document.body.classList.remove(name));

        try {
          const computed = window.getComputedStyle(target);
          const selector = buildSelector(target);
          const declarations = PROPERTIES
            .map((property) => [property, computed.getPropertyValue(property).trim()])
            .filter(([property, value]) => value && !GENERIC_DEFAULTS.has(`${property}:${value}`));
          const cssText = `${selector} {\n${declarations
            .map(([property, value]) => `  ${property}: ${value};`)
            .join('\n')}\n}`;
          return { selector, cssText };
        } finally {
          removed.forEach((name) => target.classList.add(name));
          bodyClasses.forEach((name) => document.body.classList.add(name));
        }
      },
      buildSelector
    };
  }

  modules.createCssExporter = createCssExporter;
})();
