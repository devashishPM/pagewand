# Changelog


## 1.1.1

- Fix Full page returning a visible-only image on dashboard apps whose main content scrolls inside a panel.
- Detect the dominant panel, crop and stitch its content, and restore its scroll position; leave smaller widgets unchanged.
- Add actual-extension panel tests at 1× and 2×, including partial horizontal clipping.

## 1.1.0

- Add full-page vertical capture with progress, cancellation, native-resolution stitching, and existing annotation/PNG export.
- Restore scroll position and temporary sticky/fixed-element styling after success, cancellation, or failure; stop on unstable geometry or tab/viewport changes.
- Pace screenshot requests across all tabs and bound capture size/time and annotation undo memory.
- Keep runtime dependency and permission sets unchanged.

All notable changes to PageWand (PW) will be documented in this file.

## [1.0.0] - 2026-09-06

### Added

- Zap, text-only Edit, computed CSS, visible-page Capture, and original-asset Download tools.
- A compact tool chooser with contextual actions, plain-language capture labels, target-aware Parent controls, and history-aware Undo visibility.
- A persistent mouse-accessible toolbar, keyboard shortcuts, safe parent targeting, and a 50-step session undo history.
- Screenshot annotation with rectangle, arrow, text, Pixelate, and opaque Redact tools.
- Shadow DOM interface isolation, accessible controls, responsive onboarding, and complete session teardown.
- Plain-language privacy and security policies, contributor guidance, issue templates, CI, and verified release packaging.
- Browser, service-worker, and unpacked-extension regression tests.

### Security and reliability

- Verified the active tab before and after captures and serialized rapid capture requests.
- Preserved displayed `currentSrc` assets and their known formats without metadata requests on hover.
- Escaped generated CSS selectors and prevented extension shortcuts from firing while a user is typing.
- Reconciled toolbar state with the live page session after service-worker restarts.
- Added clear unsupported-page and clipboard failure feedback.
