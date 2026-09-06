# Contributing

Thanks for helping improve PageWand.

## Before opening an issue

- Search existing issues first.
- Use the bug-report template for reproducible defects.
- Do not post vulnerability details publicly; follow [SECURITY.md](SECURITY.md).
- Include the Chrome version, operating system, affected URL type, exact steps, and what you expected.

## Local setup

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Run `npm run check`.
4. Open `chrome://extensions`, enable Developer mode, and load this repository as an unpacked extension.

Runtime code intentionally has no production dependencies. Development dependencies are acceptable when they improve reproducible testing without shipping in the extension archive.

## Pull requests

- Keep changes focused and explain the user-visible outcome.
- Add or update a regression for behavior changes.
- Run `npm run check` before submitting.
- Test the unpacked extension in a fresh Chrome profile when changing permissions, injection, downloads, capture, clipboard, or service-worker behavior.
- Update `README.md`, `PRIVACY.md`, and `CHANGELOG.md` when behavior or permissions change.
- Do not commit `.local.md` planning documents, credentials, `.pem` files, generated `dist/` contents, or editor-specific settings.

## Code conventions

- Use plain JavaScript compatible with Manifest V3; no remote code.
- Keep extension-owned DOM under a `data-pw-owned="true"` Shadow DOM host.
- Every asynchronous capture must remain tied to its request and live session.
- Preserve original asset bytes unless a conversion is explicit in the UI.
- Teardown must be safe to call from every state and more than once.
