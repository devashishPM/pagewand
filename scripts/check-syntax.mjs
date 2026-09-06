import { execFileSync } from 'node:child_process';

const files = [
  'background.js', 'css_export.js', 'downloads.js', 'edit_manager.js',
  'capture.js', 'screenshot_editor.js', 'ui.js', 'content.js',
  'scripts/build-public-repo.mjs', 'scripts/build-release.mjs',
  'scripts/capture-docs.mjs', 'scripts/generate-icons.mjs',
  'scripts/verify-release.mjs'
];

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log(`Syntax OK (${files.length} files)`);
