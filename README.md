# PageWand

**Clean up the page. Make your point. Capture the whole story.**

A small Chrome extension for all the things you wish you could do to a webpage before sharing it. Remove a distracting sidebar. Try a better headline. Capture a long article or scrolling dashboard. Add an arrow, cover sensitive details, and save the result.

**[Add PageWand to Chrome →](https://chromewebstore.google.com/detail/pagewand/iblpdcnjcidcojjfiikclboaaenikloc)** · [Install the latest source](#install-from-source) · [MIT licensed](LICENSE)

No account. No backend. No analytics or telemetry. **Zero runtime dependencies.** PageWand runs on demand in the tab you activate.

![PageWand capture toolbar with Visible page, Selected area, and Full page](docs/toolbar.png)

## From “just one screenshot” to done

- **Share the useful part.** Zap distractions, then capture the page with your changes intact.
- **Show the copy you mean.** Temporarily edit a text-only element and screenshot the proposal in context.
- **Go beyond one screen.** Capture a full page or the main scrolling panel in a dashboard, then annotate and export a PNG.
- **Give precise feedback.** Add arrows, rectangles, and text. Use opaque Redact to cover sensitive details before sharing.
- **Inspect or grab an asset.** Copy a computed-style snapshot or download the displayed original image, SVG, icon, or background image.

Page edits are temporary. Reloading normally restores the website; Zap and saved text edits also support session undo.

## New: capture the whole page

Press **S**, then **3**. PageWand scrolls, captures, and stitches locally, then opens the result in its annotation editor. On dashboard apps, it can recognize the main scrolling content panel even when the outer page stays still.

Keep the tab active, watch the progress, and cancel with **Esc** whenever you need to. Your original scroll position is restored afterward. Long captures retain Chrome’s returned pixel resolution, with explicit size limits to keep memory use bounded.

**The latest capture improvements are in source version 1.1.1.** [Install from this repository](#install-from-source) to try them; Chrome Web Store updates are published separately. See [capture behavior and limits](#full-page-screenshots) for supported layouts.

## What it does

| Tool | Shortcut | Action |
| --- | --- | --- |
| Zap | `Z` | Remove the element under the pointer. |
| Edit | `E` | Temporarily edit a text-only element. `Esc` cancels; `Ctrl/⌘ + Enter` saves. |
| CSS | `C` | Preview and copy a selected computed-style snapshot. |
| Capture | `S` | Capture the visible page (`1`), a selected area (`2`), or the full page (`3`), then annotate it. |
| Download | `D` | Download the displayed original image, SVG, icon, or background image. |

The compact toolbar shows only the current tool and actions that apply to it. Choose the current tool to switch tools; Capture reveals **Visible page**, **Selected area**, and **Full page**, Parent appears only for element-based tools, and Undo appears only when there is something to restore. Keyboard shortcuts are ignored while you type in an input, textarea, select, or editable region.

![Choose among PageWand’s five tools](docs/onboarding.png)

## Install

### Chrome Web Store

[**Add PageWand to Chrome →**](https://chromewebstore.google.com/detail/pagewand/iblpdcnjcidcojjfiikclboaaenikloc)

### Install from source

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose this repository folder, or the extracted contents of a release archive.
6. Pin **PageWand** if you want it visible in the toolbar.

Click the extension icon—or press `Alt + Shift + Z`—in a normal webpage tab to start or stop a session. Chrome does not permit extensions to inject scripts into internal pages such as `chrome://` URLs or the Chrome Web Store.

## How changes behave

- Page changes are temporary DOM changes in the current tab. Reloading the page normally restores the website.
- Zap and saved text edits share a 50-step, session-only undo stack.
- Edit mode intentionally accepts text-only elements. This preserves page-owned child elements and event handlers; select a nested text element instead of editing a container with child markup.
- Parent targeting lets you move from the hovered element to its containing element without risking removal of `html` or `body`.
- CSS output is a selected computed-style snapshot. It is not the page's source stylesheet and does not include pseudo-elements, inactive states, unmatched media rules, or authored variable names.
- **Visible page** captures only the part of the webpage currently on screen; it does not create a stitched image of the entire page.
- **Pixelate is a visual effect, not secure redaction.** Use the opaque Redact tool when covering sensitive content.
- Download preserves the displayed original asset and its known extension. It does not silently flatten animated images into PNG.

## Full-page screenshots

Choose **Capture → Full page** (or press `S`, then `3`). PageWand scrolls the main document—or a dominant scrolling app panel when the document itself does not scroll—and stitches a PNG locally, preserving your current Zap and Edit changes. Keep the tab active while it captures. **Cancel** or `Esc` stops the operation; your original scroll position and temporary capture styles are restored. Review, annotate, copy, or download the result in the existing editor.

- Dashboard panels are captured on their own, without repeating the surrounding app navigation. Smaller independently scrolling widgets retain their current contents. Ambiguous multi-panel layouts ask you to use Selected area.
- Captures vertically at the current viewport width (or the visible width of the main panel) and Chrome's returned screenshot resolution. Horizontal overflow is excluded, with a notice before capture.
- Common sticky headings are temporarily returned to normal flow; fixed overlays appear only in the first section. A fixed footer therefore stays at its first viewport position. Complex layouts may differ from their scrolling appearance.
- Preparation triggers common lazy images, but unavailable images, virtualized lists, iframe/Shadow DOM internals, video, and continually changing pages cannot be captured completely or frozen universally. Scrolling may trigger the website's own network requests.
- Changing tabs, scrolling manually, resizing, or changing zoom cancels capture. Changing document/panel height or panel position aborts instead of silently returning a partial image.
- Limits: 24 million output pixels, 30,000 pixels per side, 60 sections, 15 seconds for preparation, and 90 seconds overall. Very long/high-resolution pages can exceed these limits. Use Selected area for smaller captures.
- Annotation undo retains up to 20 changed regions within a 64 MiB budget. Older undo steps are evicted as needed; an annotation too large to fit is declined. Screenshots and undo buffers are released when the editor closes.

## Current scope and limitations

PageWand works on ordinary HTTP and HTTPS pages that Chrome allows the extension to access. Full-page capture supports the document or a detected main scrolling panel; smaller independently scrolling widgets keep their current views. It does not traverse iframes or closed/open Shadow DOM internals. Some sites may block clipboard operations or asset downloads, and Chrome-protected pages cannot be modified. Responsive assets use an image's displayed `currentSrc` when available.

## Privacy and permissions

See [PRIVACY.md](PRIVACY.md) for the complete plain-language explanation.

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Grants temporary access only after you click the extension on the current tab. |
| `scripting` | Injects and removes the extension's local scripts and styles on that tab. |
| `clipboardWrite` | Copies computed CSS and annotated screenshots when you request it. |
| `downloads` | Saves the original asset you explicitly select. |

There are no declared persistent host permissions and no web-accessible resources.

## Development

Requires Node.js 20 or newer for development checks. Runtime extension code remains dependency-free. The standalone public checkout is the development source; generated `dist/` folders are disposable artifacts, not Git checkouts.

```bash
npm install
npm run check
npm run test:extension
```

`npm run check` performs JavaScript syntax checks, runs browser and service-worker regressions, builds an allowlisted release ZIP, and verifies that the archive contains no local planning files, editor settings, dependency folders, or Git metadata. `npm run test:extension` separately loads the actual runtime in an unpacked extension's isolated world, using a disposable Chromium profile, and checks real screenshot stitching, dashboard panels, zoom, cancellation, annotation undo, and clean UI teardown.

To build only the extension archive:

```bash
npm run package
```

The result is written to `dist/pagewand-<version>.zip`.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please use the private reporting route in [SECURITY.md](SECURITY.md) for vulnerabilities and avoid public issues containing exploit details.

## License

[MIT](LICENSE)
