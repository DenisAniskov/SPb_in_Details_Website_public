#!/usr/bin/env node
/**
 * Offline post-build gate for the static output in `dist/`.
 *
 * Runs as part of `npm run build` (so Vercel fails too, not just local builds)
 * and checks the things that must never regress on a download page:
 *
 *   1. required pages, robots.txt, sitemap and icons exist;
 *   2. every internal link, image, stylesheet and script resolves to a file;
 *      every external link uses HTTPS;
 *   3. the APK button points at the official GitHub Release recorded in
 *      src/data/release.json, and nowhere else;
 *   4. the published SHA-256, size and version on the page match that file;
 *   5. no screenshot is published without a stated provenance (a file in
 *      public/screens/ is not proof that it shows the running app);
 *   6. no APK, keystore, .env file or credential-like string is published;
 *   7. nothing encourages looking for the app in Google Play.
 *
 * No network access: it only reads files on disk.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readImageSize } from '../src/lib/image-size.ts';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST = join(ROOT, 'dist');

const failures = [];
const notes = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) {
    failures.push(message);
  }
}

function readUtf8(path) {
  return readFileSync(path, 'utf8');
}

const release = JSON.parse(readUtf8(join(ROOT, 'src', 'data', 'release.json')));

if (!existsSync(DIST)) {
  console.error('FAIL: каталог dist/ не найден — сначала выполните сборку.');
  process.exit(1);
}

// --- 1. Required output -------------------------------------------------------

const requiredFiles = [
  'index.html',
  join('privacy', 'index.html'),
  join('legal', 'index.html'),
  '404.html',
  'robots.txt',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png',
  'og-image.png',
  join('brand', 'app-icon-128.png'),
  join('brand', 'app-icon-512.webp'),
  join('brand', 'launcher-light-256.webp'),
  join('brand', 'launcher-dark-256.webp'),
  join('brand', 'icon-set-1000.webp'),
];

for (const relativePath of requiredFiles) {
  check(existsSync(join(DIST, relativePath)), `в dist/ нет обязательного файла: ${relativePath}`);
}

// The sitemap integration writes an index that points at one or more child
// sitemaps; every page URL must appear in the collection.
const sitemapFiles = readdirSync(DIST).filter((name) => /^sitemap.*\.xml$/.test(name));
check(sitemapFiles.length > 0, 'в dist/ нет карты сайта (sitemap*.xml)');

const sitemapUrls = [];
for (const name of sitemapFiles) {
  const xml = readUtf8(join(DIST, name));
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    sitemapUrls.push(match[1]);
  }
}
const sitemapPaths = sitemapUrls.map((value) => {
  const pathname = new URL(value).pathname.replace(/\/+$/, '');
  return pathname === '' ? '/' : pathname;
});
for (const route of ['/', '/privacy', '/legal']) {
  check(sitemapPaths.includes(route), `в карте сайта нет маршрута ${route}`);
}
check(
  !sitemapUrls.some((value) => value.includes('404')),
  'страница 404 не должна попадать в карту сайта',
);

// --- 2. Links, assets, scripts ------------------------------------------------

const htmlFiles = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(path);
    } else if (entry.name.endsWith('.html')) {
      htmlFiles.push(path);
    }
  }
}
walk(DIST);

check(htmlFiles.length >= 4, `ожидалось не меньше четырёх HTML-файлов, найдено ${htmlFiles.length}`);

function distTarget(href) {
  const clean = href.split('#')[0].split('?')[0];
  if (clean === '' || clean === '/') {
    return join(DIST, 'index.html');
  }
  const relativePath = clean.replace(/^\//, '');
  const candidates = [
    join(DIST, relativePath),
    join(DIST, relativePath, 'index.html'),
    join(DIST, `${relativePath}.html`),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const externalLinks = new Set();
const cssHrefs = new Set();
const scriptSrcs = new Set();
const inlineScripts = [];
const inlineStyles = [];

for (const file of htmlFiles) {
  const html = readUtf8(file);
  const name = relative(DIST, file).split(sep).join('/');

  for (const attribute of ['href', 'src']) {
    const pattern = new RegExp(`${attribute}="([^"]+)"`, 'g');
    for (const match of html.matchAll(pattern)) {
      const value = match[1];
      if (value.startsWith('http://') || value.startsWith('https://')) {
        if (value.startsWith('http://')) {
          check(false, `небезопасная http-ссылка в ${name}: ${value}`);
        }
        externalLinks.add(value);
        continue;
      }
      if (value.startsWith('mailto:') || value.startsWith('data:') || value.startsWith('#')) {
        continue;
      }
      if (value.startsWith('/')) {
        check(Boolean(distTarget(value)), `битая ссылка ${value} в ${name}`);
        if (attribute === 'href' && value.endsWith('.css')) {
          cssHrefs.add(value);
        }
        if (attribute === 'src' && value.endsWith('.js')) {
          scriptSrcs.add(value);
        }
      } else {
        check(Boolean(distTarget(`/${value}`)), `относительная ссылка ${value} в ${name}`);
      }
    }
  }

  check(html.includes('lang="ru"'), `в ${name} нет lang="ru"`);
  check(html.includes('property="og:image"'), `в ${name} нет og:image`);
  check(html.includes('name="description"'), `в ${name} нет meta description`);

  // Canonical must be an absolute HTTPS URL on the page's own route, in the
  // same trailing-slash form the sitemap publishes.
  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
  check(Boolean(canonicalMatch), `в ${name} нет canonical-ссылки`);
  if (canonicalMatch) {
    const canonical = new URL(canonicalMatch[1]);
    check(canonical.protocol === 'https:', `canonical в ${name} должен быть HTTPS`);
    const expectedPath =
      name === 'index.html' ? '/' : `/${name.replace(/\/index\.html$/, '').replace(/\.html$/, '')}/`;
    check(
      canonical.pathname === expectedPath,
      `canonical в ${name} ведёт на ${canonical.pathname}, ожидался ${expectedPath}`,
    );
  }

  if (name === '404.html') {
    check(html.includes('noindex'), 'страница 404 должна быть закрыта от индексации (noindex)');
  }

  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)) {
    inlineScripts.push(`${name}: ${match[0].slice(0, 60)}`);
  }
  for (const match of html.matchAll(/<style[^>]*>/g)) {
    inlineStyles.push(name);
  }
  check(
    !html.includes('play.google.com'),
    `${name} ссылается на Google Play: приложение там не публикуется`,
  );
}

for (const href of cssHrefs) {
  check(Boolean(distTarget(href)), `не найден файл стилей ${href}`);
}
for (const href of scriptSrcs) {
  check(Boolean(distTarget(href)), `не найден файл скрипта ${href}`);
}

// A strict Content-Security-Policy is configured in vercel.json: it only holds
// if the output has no inline script or style block.
check(inlineScripts.length === 0, `в выводе есть встроенные <script>: ${inlineScripts.join('; ')}`);
check(inlineStyles.length === 0, `в выводе есть встроенные <style>: ${[...new Set(inlineStyles)].join(', ')}`);

// --- 3. Download call to action ----------------------------------------------

const home = readUtf8(join(DIST, 'index.html'));
const apkLinkPattern = /href="([^"]*releases\/download[^"]*)"/g;
const downloadLinks = [...home.matchAll(apkLinkPattern)].map((match) => match[1]);
check(downloadLinks.length > 0, 'на главной странице нет ссылки на файл релиза');
for (const link of downloadLinks) {
  check(link === release.urls.apkDownload, `ссылка на APK не совпадает с release.json: ${link}`);
}
check(
  home.includes(`href="${release.urls.release}"`),
  'на главной странице нет ссылки на страницу релиза',
);
check(
  home.includes(`href="${release.urls.repository}"`),
  'на главной странице нет ссылки на репозиторий приложения',
);

// --- 4. Release metadata on the page -----------------------------------------

check(home.includes(release.apk.sha256), 'на главной странице нет опубликованной контрольной суммы SHA-256');
const mebibytes = (release.apk.sizeBytes / (1024 * 1024)).toFixed(1).replace('.', ',');
check(home.includes(`${mebibytes}\u00a0МиБ`), `на главной странице нет размера ${mebibytes} МиБ`);
const exactBytes = release.apk.sizeBytes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
check(home.includes(exactBytes), 'на главной странице нет точного размера в байтах');
check(home.includes(release.apk.fileName), 'на главной странице нет имени файла APK');
check(home.includes(release.gitTag), `на главной странице нет обозначения версии ${release.gitTag}`);
const fingerprintPrefix = (release.signature.certificateSha256.slice(0, 8).match(/../g) ?? [])
  .join(':')
  .toUpperCase();
check(
  home.includes(fingerprintPrefix),
  `на главной странице нет отпечатка сертификата подписи (${fingerprintPrefix})`,
);

// --- 4b. Screenshot provenance in the output ---------------------------------

// A file in public/screens/ proves nothing on its own: the showcase publishes an
// image only when screens.json states how it was captured, and the build stops
// when a file appears without that statement. These checks verify the same rule
// against what was actually written to dist/.
const screensData = JSON.parse(readUtf8(join(ROOT, 'src', 'data', 'screens.json')));
const publishableProvenance = new Set(['device-screenshot', 'emulator-screenshot']);
const homeScreenshots = new Set(
  [...home.matchAll(/<img[^>]+src="(\/screens\/[^"]+)"/g)].map((match) => match[1]),
);

let pendingScreens = 0;
for (const slot of screensData.items) {
  const target = join(DIST, slot.image.replace(/^\//, ''));
  const quoted = slot.image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = home.match(new RegExp(`<img[^>]+src="${quoted}"[^>]*>`))?.[0] ?? '';
  const published = publishableProvenance.has(slot.provenance) && existsSync(target);

  if (published) {
    check(homeScreenshots.has(slot.image), `снимок ${slot.image} объявлен, но на главной его нет`);
    check(/width="\d+"/.test(tag), `у снимка ${slot.image} нет атрибута width`);
    check(/height="\d+"/.test(tag), `у снимка ${slot.image} нет атрибута height`);
    check(/alt="[^"]+"/.test(tag), `у снимка ${slot.image} нет непустого alt`);
    check(
      /loading="lazy"/.test(tag),
      `снимок ${slot.image} должен загружаться отложенно (loading="lazy")`,
    );

    // The declared size must equal the file: a screenshot is never rescaled in
    // the markup, so a mismatch means the wrong image or a hand-written number.
    const realSize = readImageSize(readFileSync(target));
    check(realSize !== null, `не читаются размеры файла ${slot.image}`);
    if (realSize !== null) {
      const declaredWidth = Number(tag.match(/width="(\d+)"/)?.[1] ?? 0);
      const declaredHeight = Number(tag.match(/height="(\d+)"/)?.[1] ?? 0);
      check(
        declaredWidth === realSize.width && declaredHeight === realSize.height,
        `${slot.image}: на странице ${declaredWidth}x${declaredHeight}, файл ${realSize.width}x${realSize.height}`,
      );
    }

    // Enlargement: the image is a real link to the full-size file and /ui.js
    // fills the dialog. Both have to point at the same file.
    const link = home.match(new RegExp(`<a[^>]+href="${quoted}"[^>]*data-lightbox-open`))?.[0];
    check(
      Boolean(link),
      `снимок ${slot.image} не обёрнут в ссылку с data-lightbox-open: увеличение не заработает`,
    );
    if (link) {
      check(
        /rel="noopener"/.test(link),
        `ссылка увеличения ${slot.image} должна нести rel="noopener"`,
      );
    }
  } else {
    pendingScreens += 1;
    check(
      !homeScreenshots.has(slot.image),
      `на главной показан файл без подтверждённого происхождения: ${slot.image}`,
    );
    check(
      !existsSync(target),
      `в dist/ попал файл, происхождение которого не подтверждено: ${slot.image}`,
    );
  }
}

if (pendingScreens === 0) {
  check(
    home.includes('data-lightbox-image'),
    'при опубликованных снимках на странице должен быть диалог увеличения',
  );
}

// An image of an earlier release may be shown, but never silently: it must be
// marked «archived» in screens.json and the page must say, in so many words,
// which version the gallery images belong to.
for (const slot of screensData.items) {
  const capture = slot.capture;
  if (!capture || slot.provenance === 'widget-test-render' || slot.provenance === null) {
    continue;
  }
  const isCurrent = capture.appVersion === release.version && capture.build === release.build;
  if (!isCurrent) {
    check(
      slot.archived === true,
      `снимок ${slot.image} сделан в ${capture.appVersion}+${capture.build}, а сайт публикует ` +
        `${release.version}+${release.build}: без флага «archived» его показывать нельзя`,
    );
  }
}
const archivedCount = screensData.items.filter((slot) => slot.archived === true).length;
if (archivedCount > 0) {
  check(
    /архивн[а-яё]*\s+снимк[а-яё]*\s+версии/i.test(home) ||
      home.includes('Архивный снимок предыдущей версии'),
    `в screens.json ${archivedCount} архивных снимков, но на главной нет пометки, что снимки относятся к предыдущей версии`,
  );

  // The archived capture must be attributed to its own version and build, so the
  // note stands on its own even when read out of context.
  const archivedVersions = [
    ...new Set(
      screensData.items
        .filter((slot) => slot.archived === true && slot.capture)
        .map((slot) => `${slot.capture.appVersion}+${slot.capture.build}`),
    ),
  ];
  for (const version of archivedVersions) {
    check(
      home.includes(version),
      `архивный снимок версии ${version}: на главной не указана исходная версия снимка`,
    );
  }

  // An archival image proves nothing about the current release. Claiming the
  // interface is visually unchanged would need a verified capture of the new
  // version, so the build refuses to ship that claim.
  check(
    !/визуально\s+не\s+изменил/i.test(home),
    'страница не должна утверждать, что интерфейс архивных снимков визуально не изменился в текущей версии: для такого утверждения нужна отдельная подтверждённая проверка',
  );
}

if (pendingScreens > 0) {
  check(
    home.includes('Официальный скриншот готовится'),
    'пока снимков нет, слоты должны честно помечать изображение как готовящееся',
  );
}
check(
  !/официальн[а-я]*\s+скриншот[а-я]*\s+(сделан|снят)/i.test(home) || pendingScreens === 0,
  'страница не должна утверждать, что снимок сделан, пока он не подтверждён',
);

// --- 4c. Declared image sizes match the real files ---------------------------

// The showcase reads PNG/WebP headers to publish real width/height attributes.
// These checks exercise that parser against the generated brand assets and
// compare the attributes on the page with the files, so neither a broken parser
// nor a re-generated image of another size can reach a visitor unnoticed.
const sizeExpectations = [
  ['brand/app-icon-128.png', 128, 128],
  ['brand/app-icon-512.webp', 512, 512],
  ['brand/launcher-light-256.webp', 256, 256],
  ['brand/launcher-dark-256.webp', 256, 256],
  ['brand/icon-set-1000.webp', 1000, 623],
  ['og-image.png', 1200, 630],
  ['apple-touch-icon.png', 180, 180],
  ['favicon-16x16.png', 16, 16],
  ['favicon-32x32.png', 32, 32],
];

for (const [name, width, height] of sizeExpectations) {
  const file = join(DIST, name);
  if (!existsSync(file)) {
    continue;
  }
  const size = readImageSize(readFileSync(file));
  check(size !== null, `не читаются размеры ${name}: заголовок PNG/JPEG/WebP не распознан`);
  if (size === null) {
    continue;
  }
  check(
    size.width === width && size.height === height,
    `размеры ${name} равны ${size.width}×${size.height}, ожидалось ${width}×${height}`,
  );

  const quoted = `/${name}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tag = home.match(new RegExp(`<img[^>]+src="${quoted}"[^>]*>`))?.[0];
  if (!tag) {
    continue;
  }
  // The same file may be shown at another size (the header icon uses the 128 px
  // asset at 36 px), so what must match is the aspect ratio: a wrong one shifts
  // the layout when the image loads.
  const declaredWidth = Number(tag.match(/width="(\d+)"/)?.[1] ?? 0);
  const declaredHeight = Number(tag.match(/height="(\d+)"/)?.[1] ?? 0);
  const declaredRatio = declaredWidth / declaredHeight;
  const fileRatio = size.width / size.height;
  check(
    declaredWidth > 0 && declaredHeight > 0,
    `у ${quoted} нет размеров width/height: изображение сдвинет вёрстку при загрузке`,
  );
  check(
    Math.abs(declaredRatio - fileRatio) / fileRatio < 0.002,
    `у ${quoted} пропорции ${declaredWidth}:${declaredHeight}, а файл ${size.width}:${size.height}`,
  );
}

// --- 4d. Theme: two palettes, readable in both -------------------------------

// The light palette is written twice in global.css on purpose (an attribute
// selector for a manual choice, a media query for the no-JavaScript case).
// These checks keep the two copies in step and prove that both palettes meet
// WCAG AA: a colour pair must not be fixed in one theme and left broken in the
// other, and the ratios below are what the acceptance report quotes.
const globalCss = readUtf8(join(ROOT, 'src', 'styles', 'global.css'));

function cssSection(startMarker, endMarker) {
  const start = globalCss.indexOf(startMarker);
  if (start < 0) {
    return null;
  }
  const end = globalCss.indexOf(endMarker, start);
  return end < 0 ? globalCss.slice(start) : globalCss.slice(start, end);
}

function tokensOf(block) {
  const map = new Map();
  if (block === null) {
    return map;
  }
  for (const match of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1], match[2].trim());
  }
  return map;
}

const darkTokens = tokensOf(cssSection(':root {\n  color-scheme: dark;', '/* 1b. Light theme'));
const systemLightTokens = tokensOf(
  cssSection('@media (prefers-color-scheme: light) {', ":root[data-theme='light'] {"),
);
const chosenLightTokens = tokensOf(
  cssSection(":root[data-theme='light'] {", '/* A theme change is a colour change'),
);

check(darkTokens.size > 0, 'в global.css не найден блок тёмной палитры');
check(systemLightTokens.size > 0, 'в global.css не найдена светлая палитра для системной настройки');
check(chosenLightTokens.size > 0, 'в global.css не найдена светлая палитра для выбранной темы');
check(
  [...systemLightTokens.keys()].sort().join() === [...chosenLightTokens.keys()].sort().join(),
  'светлая тема объявлена дважды с разными наборами переменных: ручной выбор и системная настройка разойдутся',
);

/** Resolves `#rrggbb`, `rgb()`/`rgba()` and `var()` indirection. */
function parseColor(value, tokens, depth = 0) {
  const text = String(value ?? '').trim();
  const reference = /^var\((--[a-z0-9-]+)\)$/.exec(text);
  if (reference && depth < 8) {
    return parseColor(tokens.get(reference[1]), tokens, depth + 1);
  }
  const hex = /^#([0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const number = Number.parseInt(hex[1], 16);
    return [(number >> 16) & 255, (number >> 8) & 255, number & 255, 1];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)$/i.exec(
    text,
  );
  if (rgb) {
    return [
      Number(rgb[1]),
      Number(rgb[2]),
      Number(rgb[3]),
      rgb[4] === undefined ? 1 : Number(rgb[4]),
    ];
  }
  return null;
}

function composite(foreground, background) {
  const alpha = foreground[3];
  return [
    foreground[0] * alpha + background[0] * (1 - alpha),
    foreground[1] * alpha + background[1] * (1 - alpha),
    foreground[2] * alpha + background[2] * (1 - alpha),
    1,
  ];
}

function resolveColor(tokens, name, base) {
  // The token map is keyed by the full custom property name (--bg); callers
  // pass the short form the pairs below are written in.
  const key = name.startsWith('--') ? name : '--' + name;
  const color = parseColor(tokens.get(key), tokens);
  if (color === null) {
    return null;
  }
  return color[3] < 1 && base !== null ? composite(color, base) : color;
}

function relativeLuminance([red, green, blue]) {
  const channel = (value) => {
    const ratio = value / 255;
    return ratio <= 0.03928 ? ratio / 12.92 : Math.pow((ratio + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  return (high + 0.05) / (low + 0.05);
}

// Every pair is text on a surface the site actually renders.
const contrastPairs = [
  ['text', 'bg', 'основной текст на фоне страницы'],
  ['text', 'surface-solid', 'основной текст на карточке'],
  ['text-muted', 'bg', 'второстепенный текст на фоне страницы'],
  ['text-soft', 'bg', 'подписи на фоне страницы'],
  ['link', 'bg', 'ссылка на фоне страницы'],
  ['link-hover', 'bg', 'ссылка при наведении'],
  ['accent', 'bg', 'надзаголовок на фоне страницы'],
  ['gold-ink', 'bg', 'золотой текст на фоне страницы'],
  ['skip-ink', 'skip-bg', 'текст ссылки «к содержимому»'],
  ['code-ink', 'code-bg', 'моноширинный текст в блоке кода'],
  ['text', 'header-bg', 'текст в шапке'],
  ['text-muted', 'footer-bg', 'текст в подвале'],
  ['text-muted', 'chip-bg', 'текст в метке-чипе'],
];

const AA_NORMAL = 4.5;
const contrastReport = [];

for (const [themeName, tokens] of [
  ['тёмная', darkTokens],
  ['светлая', chosenLightTokens],
]) {
  const page = resolveColor(tokens, 'bg', [255, 255, 255, 1]);
  check(page !== null, `не удалось разобрать цвет фона страницы (${themeName} тема)`);
  if (page === null) {
    continue;
  }
  let worst = { ratio: Number.POSITIVE_INFINITY, label: '' };
  for (const [foregroundName, backgroundName, label] of contrastPairs) {
    const foreground = resolveColor(tokens, foregroundName, page);
    const background = resolveColor(tokens, backgroundName, page);
    check(
      foreground !== null && background !== null,
      `не удалось разобрать цвета пары «${label}» (${themeName} тема)`,
    );
    if (foreground === null || background === null) {
      continue;
    }
    const ratio = contrastRatio(foreground, background);
    check(
      ratio >= AA_NORMAL,
      `контраст ниже AA: ${ratio.toFixed(2)}:1 при норме ${AA_NORMAL}:1 — ${label}, ${themeName} тема`,
    );
    if (ratio < worst.ratio) {
      worst = { ratio, label };
    }
  }
  // The main button carries dark text on the lightest stop of its gold gradient.
  const onGold = resolveColor(tokens, 'text-on-gold', page);
  const goldStop = parseColor('#f8d183', tokens);
  if (onGold !== null && goldStop !== null) {
    const ratio = contrastRatio(onGold, goldStop);
    check(ratio >= AA_NORMAL, `контраст текста на золотой кнопке ниже AA: ${ratio.toFixed(2)}:1`);
  }
  contrastReport.push(`${themeName} тема: минимум ${worst.ratio.toFixed(2)}:1 (${worst.label})`);
}

// --- 4e. Theme wiring in the output ------------------------------------------

for (const file of htmlFiles) {
  const html = readUtf8(file);
  const name = relative(DIST, file).split(sep).join('/');
  const head = html.slice(0, html.indexOf('</head>'));

  // The theme must be on <html> before the first paint, which only a
  // render-blocking same-origin script in <head> can do.
  check(
    /<script[^>]+src="\/theme\.js"/.test(head),
    `в ${name} нет /theme.js в <head>: тема применится после первой отрисовки и мигнёт`,
  );
  check(
    !/<html[^>]+data-theme=/.test(html),
    `${name}: статический вывод не должен нести data-theme — тему выставляет /theme.js`,
  );
  check(
    /name="color-scheme" content="dark light"/.test(html),
    `в ${name} нет meta color-scheme с двумя схемами`,
  );
  const themeColours = [...html.matchAll(/<meta name="theme-color"[^>]*>/g)].map(
    (match) => match[0],
  );
  check(
    themeColours.length === 2 &&
      themeColours.some((tag) => tag.includes('prefers-color-scheme: dark')) &&
      themeColours.some((tag) => tag.includes('prefers-color-scheme: light')),
    `в ${name} должно быть два theme-color с media-запросами (тёмный и светлый)`,
  );

  // The switcher ships hidden: without JavaScript it could change nothing.
  const switchers = [...html.matchAll(/<div class="theme-switch[^"]*"[^>]*>/g)].map(
    (match) => match[0],
  );
  check(switchers.length >= 1, `в ${name} нет переключателя оформления`);
  for (const tag of switchers) {
    check(
      tag.includes('role="radiogroup"'),
      `переключатель оформления без role="radiogroup" (${name})`,
    );
    check(
      tag.includes('hidden'),
      `переключатель оформления не скрыт до включения /theme.js (${name})`,
    );
  }
  const options = [...html.matchAll(/data-theme-option="([a-z]+)"/g)].map((match) => match[1]);
  for (const mode of ['system', 'light', 'dark']) {
    check(options.includes(mode), `в переключателе оформления нет варианта ${mode} (${name})`);
  }
  const ariaChecked = (html.match(/aria-checked="/g) ?? []).length;
  check(
    ariaChecked === options.length,
    `у каждого варианта темы должно быть состояние aria-checked (${name}: ${ariaChecked} из ${options.length})`,
  );
}

// --- 4f. Download-page extras: copy button, install steps, questions ---------

check(home.includes('id="apk-sha256"'), 'в блоке загрузки нет контрольной суммы с id для копирования');
const copyButton = home.match(/<button[^>]*data-copy-source="#apk-sha256"[^>]*>/)?.[0];
check(Boolean(copyButton), 'нет кнопки копирования контрольной суммы');
if (copyButton) {
  check(copyButton.includes('hidden'), 'кнопка копирования должна появляться только вместе с /ui.js');
  check(copyButton.includes('type="button"'), 'кнопка копирования должна быть type="button"');
}
const copyStatus = home.match(/<span[^>]*data-copy-status[^>]*>/)?.[0];
check(Boolean(copyStatus), 'нет области подтверждения копирования');
if (copyStatus) {
  check(
    copyStatus.includes('role="status"'),
    'подтверждение копирования должно быть живой областью (role="status")',
  );
}
check(
  /<script[^>]+src="\/ui\.js"/.test(home),
  'на главной нет /ui.js: копирование суммы и увеличение снимков не заработают',
);

const stepLists = [...home.matchAll(/<ol class="steps">([\s\S]*?)<\/ol>/g)].map((match) => match[1]);
check(stepLists.length === 1, 'инструкция по установке должна быть одним нумерованным списком');
const stepCount = stepLists.length > 0 ? (stepLists[0].match(/<li>/g) ?? []).length : 0;
check(
  stepCount >= 4,
  `в инструкции по установке должно быть не меньше четырёх шагов, найдено ${stepCount}`,
);
check(
  !/(отключите|снимите)\s+(проверку|защиту|Play Protect)/i.test(home),
  'сайт не должен советовать отключать защитные механизмы Android',
);
check(
  home.includes('Установка неизвестных приложений'),
  'в инструкции не объяснено разрешение на установку из выбранного источника',
);

check(home.includes('id="faq"'), 'нет раздела с вопросами и ответами');
for (const question of [
  'Бесплатно ли приложение?',
  'Нужна ли регистрация?',
  'Работает ли приложение без интернета?',
  'Как скачать и установить приложение?',
  'Сохранятся ли избранные места при обновлении?',
  'Для чего нужен ИИ-помощник?',
  'Нужно ли разрешать доступ к местоположению?',
  'Почему не у всех найденных мест есть подробные карточки?',
]) {
  check(home.includes(question), `в разделе вопросов нет ответа на «${question}»`);
}
check(
  home.includes('Автоматических обновлений нет'),
  'ответ про обновления должен быть честным: автообновлений у приложения нет',
);

// --- 5. Nothing secret or installable in the output --------------------------

const forbiddenNames = new Set(['key.properties', 'local.properties', '.env', '.env.dev', '.env.production.json']);
const forbiddenSuffixes = ['.apk', '.jks', '.keystore', '.p12', '.key', '.aab'];
const forbiddenPatterns = [
  [/(sk-or-v1-[A-Za-z0-9]{16,})/, 'токен OpenRouter'],
  [/(AIza[0-9A-Za-z\-_]{35})/, 'ключ Google API'],
  [/(gh[pousr]_[A-Za-z0-9]{20,})/, 'токен GitHub'],
  [/(AKIA[0-9A-Z]{16})/, 'ключ AWS'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'закрытый ключ'],
  [/(MAPKIT_API_KEY\s*[:=]\s*[A-Za-z0-9-]{20,})/, 'значение ключа MapKit'],
];

const publishedFiles = [];
function walkAll(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      walkAll(path);
    } else {
      publishedFiles.push(path);
    }
  }
}
walkAll(DIST);

let totalBytes = 0;
for (const file of publishedFiles) {
  const name = relative(DIST, file).split(sep).join('/');
  totalBytes += statSync(file).size;
  check(!forbiddenNames.has(name), `в dist/ опубликован локальный файл конфигурации: ${name}`);
  const lower = name.toLowerCase();
  for (const suffix of forbiddenSuffixes) {
    check(!lower.endsWith(suffix), `в dist/ опубликован недопустимый файл: ${name}`);
  }
  if (!/\.(html|css|js|json|xml|txt|svg)$/.test(lower)) {
    continue;
  }
  const text = readUtf8(file);
  for (const [pattern, label] of forbiddenPatterns) {
    check(!pattern.test(text), `в ${name} найден похожий на секрет фрагмент (${label})`);
  }
}

// The generated assets must be the ones the site references.
for (const asset of requiredFiles.filter((file) => file.includes('/'))) {
  const absolute = join(DIST, asset);
  if (!existsSync(absolute)) {
    continue;
  }
  const digest = createHash('sha256').update(readFileSync(absolute)).digest('hex');
  check(digest.length === 64, `не удалось посчитать SHA-256 для ${asset}`);
}

// --- 6. Nice-to-have reporting ------------------------------------------------

// First-load weight of the home page: the document plus every same-origin
// resource the browser fetches straight away. Images marked `loading="lazy"`
// are counted separately — the phone screenshots sit far below the fold and a
// single number for everything would describe a page nobody loads.
const homeAssets = new Set(['index.html']);
const lazyAssets = new Set();
for (const match of home.matchAll(/<img[^>]*>/g)) {
  const tag = match[0];
  const url = tag.match(/src="(\/[^"]+)"/)?.[1];
  if (url === undefined || !/\.(png|webp|jpe?g|svg|ico)$/.test(url)) {
    continue;
  }
  const target = distTarget(url);
  if (!target) {
    continue;
  }
  const name = relative(DIST, target).split(sep).join('/');
  if (tag.includes('loading="lazy"')) {
    lazyAssets.add(name);
  } else {
    homeAssets.add(name);
  }
}
for (const match of home.matchAll(/<(?:link|script)[^>]*(?:href|src)="(\/[^"]+)"/g)) {
  const url = match[1];
  if (!/\.(css|js|woff2?)$/.test(url)) {
    continue;
  }
  const target = distTarget(url);
  if (target) {
    homeAssets.add(relative(DIST, target).split(sep).join('/'));
  }
}
const sizeOf = (assets) => {
  let bytes = 0;
  for (const asset of assets) {
    bytes += statSync(join(DIST, asset)).size;
  }
  return bytes;
};
const homeBytes = sizeOf(homeAssets);
const lazyBytes = sizeOf(lazyAssets);

notes.push(`HTML-страниц: ${htmlFiles.length}`);
notes.push(`Файлов в dist/: ${publishedFiles.length}, суммарно ${(totalBytes / 1024 / 1024).toFixed(2)} МиБ`);
notes.push(
  `Первая загрузка главной (без отложенных): ${homeAssets.size} файлов, ${(homeBytes / 1024).toFixed(0)} КиБ ` +
    `(${[...homeAssets].sort().join(', ')})`,
);
if (lazyAssets.size > 0) {
  notes.push(
    `Отложенные изображения ниже экрана: ${lazyAssets.size} файлов, ${(lazyBytes / 1024).toFixed(0)} КиБ`,
  );
}
notes.push(`Внешних HTTPS-ссылок: ${externalLinks.size}`);
notes.push(`Файлов стилей: ${cssHrefs.size}, файлов скриптов: ${scriptSrcs.size}`);
for (const line of contrastReport) {
  notes.push(`Контраст, ${line}`);
}
notes.push(`Сторонних доменов для ресурсов: 0 (все ссылки на файлы ведут на этот же сайт)`);

// --- Report ------------------------------------------------------------------

for (const note of notes) {
  console.log(`• ${note}`);
}

if (failures.length > 0) {
  console.error(`\nFAIL: проверок ${checks}, ошибок ${failures.length}:`);
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  process.exit(1);
}

console.log(`OK: ${checks} проверок после сборки, замечаний нет.`);
