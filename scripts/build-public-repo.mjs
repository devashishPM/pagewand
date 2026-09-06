import { cp, lstat, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const destinationRoot = path.join(root, 'dist', 'pagewand-public');

const publicFiles = [
  '.gitignore',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/pull_request_template.md',
  '.github/workflows/ci.yml',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'SECURITY.md',
  'background.js',
  'capture.js',
  'content.js',
  'css_export.js',
  'docs/onboarding.png',
  'docs/toolbar.png',
  'downloads.js',
  'edit_manager.js',
  'icons/icon.svg',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
  'manifest.json',
  'package-lock.json',
  'package.json',
  'screenshot_editor.js',
  'scripts/build-public-repo.mjs',
  'scripts/build-release.mjs',
  'scripts/capture-docs.mjs',
  'scripts/check-syntax.mjs',
  'scripts/generate-icons.mjs',
  'scripts/verify-release.mjs',
  'styles.css',
  'tests/background.test.cjs',
  'tests/extension.smoke.cjs',
  'tests/session.test.cjs',
  'ui.js'
];

const forbiddenFragments = ['.local.md', '.cursor/', '.git/', 'node_modules/', 'dist/'];

try {
  await lstat(path.join(destinationRoot, '.git'));
  throw new Error('Refusing to replace an initialized public snapshot. Choose a new destination or remove it deliberately.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await rm(destinationRoot, { recursive: true, force: true });
await mkdir(destinationRoot, { recursive: true });

for (const relative of publicFiles) {
  if (forbiddenFragments.some((fragment) => relative.includes(fragment))) {
    throw new Error(`Refusing forbidden public path: ${relative}`);
  }

  const source = path.join(root, relative);
  const sourceStat = await lstat(source);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new Error(`Public snapshot source must be a regular file: ${relative}`);
  }

  const destination = path.join(destinationRoot, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

const manifest = JSON.parse(await readFile(path.join(destinationRoot, 'manifest.json'), 'utf8'));
if (manifest.name !== 'PageWand' || manifest.version !== '1.0.0') {
  throw new Error('Public snapshot expected PageWand version 1.0.0.');
}

console.log(`Prepared dist/pagewand-public with ${publicFiles.length} allowlisted files.`);
