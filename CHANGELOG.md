# Changelog

All notable changes to PageWand (PW) will be documented in this file.

## [1.0.0] - Unreleased

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
