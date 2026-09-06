import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const archive = path.resolve('dist', `pagewand-${manifest.version}.zip`);
const expected = [
  'CHANGELOG.md', 'LICENSE', 'PRIVACY.md', 'README.md', 'SECURITY.md',
  'background.js', 'capture.js', 'content.js', 'css_export.js', 'downloads.js',
  'docs/onboarding.png', 'docs/toolbar.png', 'edit_manager.js',
  'icons/icon128.png', 'icons/icon16.png', 'icons/icon48.png',
  'manifest.json', 'screenshot_editor.js', 'styles.css', 'ui.js'
].sort();
const actual = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' })
  .trim().split('\n').filter((entry) => entry && !entry.endsWith('/')).sort();

if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Release contents differ.\nExpected: ${expected.join(', ')}\nActual: ${actual.join(', ')}`);
}
console.log(`Release archive verified (${actual.length} files, no local or repository metadata).`);
