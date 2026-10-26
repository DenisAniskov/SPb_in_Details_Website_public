#!/usr/bin/env node
/**
 * Verifies that the release metadata published by the site describes the APK
 * that is actually distributed.
 *
 * Three levels, all optional except the first:
 *
 *   1. schema and link validation — always, shared with the Astro build through
 *      `src/lib/release.ts`;
 *   2. `--apk <path>` (or the default artifact copied during the release build
 *      step): byte size and SHA-256 must match `src/data/release.json`;
 *   3. `--github`: the public GitHub Release must carry the same tag, file name,
 *      size and digest.
 *
 * Nothing is ever written or deployed: a mismatch is reported, and a newer
 * release is only mentioned — switching the site to it stays an owner decision.
 *
 * Usage:
 *   node scripts/verify-release-metadata.mjs [--apk <path>] [--github]
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRelease, formatBytes, formatExactBytes } from '../src/lib/release.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

// The APK name is never hardcoded: it comes from the verified release data, so
// the script can never check a stale artifact of an older release. The default
// lookup path is overridable with `--apk <path>` or SPB_APK_PATH.
const releaseForName = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'release.json'), 'utf8'));
const apkFileName = releaseForName.apk?.fileName;
if (typeof apkFileName !== 'string' || apkFileName === '') {
  console.error('FAIL: в src/data/release.json не задано apk.fileName');
  process.exit(1);
}
// Portable default: the artifact is looked for next to the repository, in a
// sibling `release-artifacts/` directory. Pass `--apk <path>` or set
// SPB_APK_PATH when the file lives elsewhere.
const APK_CANDIDATES = [
  process.env['SPB_APK_PATH'],
  join(ROOT, '..', 'release-artifacts', apkFileName),
].filter(Boolean);

const args = process.argv.slice(2);
const useGithub = args.includes('--github');
const apkFlagIndex = args.indexOf('--apk');
const apkPath = apkFlagIndex >= 0 ? args[apkFlagIndex + 1] : APK_CANDIDATES.find(existsSync);

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) {
    failures.push(message);
  }
}

// --- 1. Schema -----------------------------------------------------------------

const raw = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'release.json'), 'utf8'));
const release = validateRelease(raw);
checks += 1;
console.log(
  `Схема в порядке: ${release.appName} ${release.version} (${release.gitTag}), ` +
    `${formatBytes(release.apk.sizeBytes)}`,
);
console.log(`  файл: ${release.apk.fileName}`);
console.log(`  SHA-256: ${release.apk.sha256}`);
console.log(`  отпечаток сертификата: ${release.signature.certificateSha256.slice(0, 16)}…`);
console.log(`  Android ${release.platform.minVersion}+ (API ${release.platform.minApiLevel}+)`);

// --- 2. Local artifact --------------------------------------------------------

const resolvedApk = apkPath ? resolve(apkPath) : null;
if (resolvedApk && existsSync(resolvedApk)) {
  const stats = statSync(resolvedApk);
  const digest = createHash('sha256').update(readFileSync(resolvedApk)).digest('hex');

  console.log(`\nЛокальный артефакт: ${basename(resolvedApk)}`);
  console.log(`  размер: ${formatExactBytes(stats.size)} (${formatBytes(stats.size)})`);
  console.log(`  SHA-256: ${digest}`);

  check(stats.size === release.apk.sizeBytes, `размер артефакта ${stats.size} ≠ заявленного ${release.apk.sizeBytes}`);
  check(digest === release.apk.sha256, 'SHA-256 артефакта не совпадает с заявленной в release.json');
  check(
    basename(resolvedApk) === release.apk.fileName,
    `имя файла ${basename(resolvedApk)} ≠ заявленного ${release.apk.fileName}`,
  );
} else {
  console.log(`\nЛокальный артефакт не найден (${resolvedApk ?? 'путь не задан'}) — шаг пропущен.`);
  console.log('  передайте --apk <путь> чтобы сверить размер и SHA-256.');
}

// --- 3. GitHub Release --------------------------------------------------------

if (useGithub) {
  const repository = new URL(release.urls.repository);
  const owner = repository.pathname.split('/').filter(Boolean)[0];
  const repo = repository.pathname.split('/').filter(Boolean)[1];
  const api = `https://api.github.com/repos/${owner}/${repo}/releases`;

  console.log(`\nGitHub: ${owner}/${repo}`);

  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'spb-in-details-website-verifier',
  };

  const tagResponse = await fetch(`${api}/tags/${release.gitTag}`, { headers });
  check(tagResponse.ok, `GitHub не отдал релиз ${release.gitTag}: HTTP ${tagResponse.status}`);

  if (tagResponse.ok) {
    const published = await tagResponse.json();
    check(published.tag_name === release.gitTag, `тег релиза ${published.tag_name} ≠ ${release.gitTag}`);
    check(published.draft === false, 'опубликованный релиз не должен быть черновиком');

    const asset = (published.assets ?? []).find((item) => item.name === release.apk.fileName);
    check(Boolean(asset), `в релизе нет файла ${release.apk.fileName}`);

    if (asset) {
      check(asset.size === release.apk.sizeBytes, `размер на GitHub ${asset.size} ≠ заявленного ${release.apk.sizeBytes}`);
      check(
        asset.browser_download_url === release.urls.apkDownload,
        `ссылка на GitHub ${asset.browser_download_url} ≠ ${release.urls.apkDownload}`,
      );
      const digest = typeof asset.digest === 'string' ? asset.digest.replace(/^sha256:/, '') : null;
      if (digest) {
        check(digest === release.apk.sha256, 'SHA-256 файла на GitHub не совпадает с заявленной');
        console.log(`  файл на GitHub: ${asset.size} байт, digest sha256:${digest.slice(0, 16)}…`);
      } else {
        console.log('  GitHub не отдал digest — сверка SHA-256 только по локальному артефакту.');
      }
      console.log(`  опубликовано: ${published.published_at}`);
    }
  }

  const listResponse = await fetch(`${api}?per_page=20`, { headers });
  if (listResponse.ok) {
    const releases = await listResponse.json();
    const others = releases.filter((item) => item.tag_name !== release.gitTag && !item.draft);
    if (others.length > 0) {
      console.log(
        `\nВнимание: в репозитории есть другие релизы (${others.map((item) => item.tag_name).join(', ')}).`,
      );
      console.log(
        '  Сайт остаётся на версии, записанной в src/data/release.json: переход на новую версию — решение владельца.',
      );
    } else {
      console.log('  других опубликованных релизов нет: сайт описывает единственную версию.');
    }
  }
} else {
  console.log('\nGitHub не запрашивался (добавьте --github для сверки с опубликованным релизом).');
}

// --- Report -------------------------------------------------------------------

if (failures.length > 0) {
  console.error(`\nFAIL: проверок ${checks}, ошибок ${failures.length}:`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`\nOK: ${checks} проверок данных о релизе, расхождений нет.`);
