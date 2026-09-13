# Privacy

PageWand does not collect, transmit, sell, or store personal data. It has no account system, analytics, telemetry, advertising, remote configuration, or project-operated backend.

## What stays in the tab

Element removal, text editing, CSS inspection, selection state, undo history, and screenshot annotation occur in the active tab or extension service worker. PageWand does not persist these changes or send them to the maintainer.

## Network activity

PageWand does not make background analytics or telemetry requests.

When you explicitly use Download, Chrome requests the selected asset URL so it can save the original file. That request goes to the asset's existing host, not to a PageWand service. Merely hovering an asset does not trigger a size or metadata request.

Full-page capture scrolls the main document or a detected main content panel to prepare and photograph it. This can trigger the website’s own lazy-loading, analytics, or other scroll-driven requests. Screenshot stitching and annotation run locally without a PageWand upload or persistent screenshot history.

Webpages themselves may continue making their own network requests while the extension is active. PageWand does not control or claim responsibility for page-originated traffic.

## Permissions

- `activeTab`: temporary access to the tab where you click the extension.
- `scripting`: injects local extension code and CSS into that tab.
- `clipboardWrite`: copies CSS or a PNG only after your action.
- `downloads`: saves an asset only after your action.

PageWand declares no persistent host permissions and exposes no extension resources to webpages.
