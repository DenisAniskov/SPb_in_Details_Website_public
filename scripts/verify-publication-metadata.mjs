#!/usr/bin/env node
/**
 * Offline consistency gate for licensing/publication metadata.
 *
 * Runs without a network connection, GitHub token, APK, or private repository.
 * The release-to-GitHub comparison is handled separately by verify:metadata.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const json = (path) => JSON.parse(read(path));

let checks = 0;
function assert(condition, label) {
  checks += 1;
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  }
}

const pkg = json('package.json');
const lock = json('package-lock.json');
const release = json('src/data/release.json');
const license = read('LICENSE');
const assetRights = read('ASSET_RIGHTS.md');
const legal = read('src/pages/legal.astro');
const readme = read('README.md');

assert(pkg.license === 'MIT', 'package.json must declare MIT');
assert(lock.packages?.['']?.license === 'MIT', 'package-lock root must declare MIT');
assert(lock.packages?.['']?.name === pkg.name, 'package-lock package name must match');
assert(lock.packages?.['']?.version === pkg.version, 'package-lock package version must match');
assert(pkg.private === true, 'npm package must remain private (not an npm publication)');
assert(
  license.startsWith('MIT License\n\nCopyright (c) 2026 Denis Aniskov\n'),
  'LICENSE must contain the agreed MIT header and copyright',
);
assert(license.includes('Permission is hereby granted, free of charge'), 'MIT permission grant must exist');
assert(license.includes('THE SOFTWARE IS PROVIDED "AS IS"'), 'MIT warranty disclaimer must exist');
assert(assetRights.includes('OpenStreetMap') && assetRights.includes('Яндекса'), 'asset rights must retain third-party caveats');
assert(assetRights.includes('Скриншоты интерфейса') && assetRights.includes('Брендовые изображения'), 'asset rights must reserve screenshots/brand');
assert(
  legal.includes('SPb_in_Details_Website_public/blob/main/LICENSE') &&
    legal.includes('SPb_in_Details_Website_public/blob/main/ASSET_RIGHTS.md'),
  '/legal/ must link to public website license and asset rights',
);
assert(legal.includes('MIT License'), '/legal/ must still mention MIT License');
assert(readme.includes('[`LICENSE`](LICENSE)') && readme.includes('[`ASSET_RIGHTS.md`](ASSET_RIGHTS.md)'), 'README must link legal files');
assert(release.distribution?.hostedOnThisSite === false, 'APK must not be hosted on the site');

if (process.exitCode) {
  console.error(`FAIL: publication metadata (${checks} checks)`);
} else {
  console.log(`OK: ${checks} publication and license checks, no discrepancies.`);
}
