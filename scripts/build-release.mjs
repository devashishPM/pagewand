import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
const releaseName = `pagewand-${manifest.version}`;
const outputRoot = path.join(root, 'dist');
const staging = path.join(outputRoot, releaseName);
const archive = path.join(outputRoot, `${releaseName}.zip`);

export const releaseFiles = [
  'manifest.json', 'background.js', 'css_export.js', 'downloads.js',
  'edit_manager.js', 'capture.js', 'screenshot_editor.js', 'ui.js',
  'content.js', 'styles.css', 'README.md', 'PRIVACY.md', 'SECURITY.md',
  'LICENSE', 'CHANGELOG.md', 'docs/onboarding.png', 'docs/toolbar.png',
  'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png'
];

await rm(staging, { recursive: true, force: true });
await rm(archive, { force: true });
await mkdir(staging, { recursive: true });
for (const relative of releaseFiles) {
  const source = path.join(root, relative);
  const destination = path.join(staging, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

const zipped = spawnSync('zip', ['-rq', archive, '.'], { cwd: staging, encoding: 'utf8' });
if (zipped.status !== 0) throw new Error(zipped.stderr || 'zip failed');
console.log(`Built ${path.relative(root, archive)} from ${releaseFiles.length} allowlisted files.`);
