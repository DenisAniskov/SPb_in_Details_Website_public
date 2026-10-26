/**
 * Schema, validation and formatting for the release data
 * (`src/data/release.json`).
 *
 * The module is shared by the Astro build (which stops on invalid data) and by
 * `scripts/verify-release-metadata.mjs`, so the site can never render a
 * version, link, size or checksum that has not passed these checks.
 *
 * It never touches the network and never queries GitHub: the only released
 * version is the one recorded in the file and approved by the owner.
 */

export interface PlatformRequirement {
  readonly name: string;
  readonly minVersion: string;
  readonly minApiLevel: number;
  readonly targetApiLevel: number;
}

export interface ApkInfo {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly architectures: readonly string[];
  readonly alignment: string;
  readonly signingSchemes: readonly string[];
}

export interface SignatureInfo {
  readonly keyAlgorithm: string;
  readonly certificateAlgorithm: string;
  readonly certificateSubject: string;
  readonly certificateSha256: string;
  readonly certificateSha1: string;
  readonly certificateValidUntil: string;
  readonly keystoreKind: string;
}

export interface DistributionInfo {
  readonly channel: string;
  readonly requiresAccount: boolean;
  readonly requiresRegistration: boolean;
  readonly hostedOnThisSite: boolean;
}

export interface ReleaseUrls {
  readonly repository: string;
  readonly release: string;
  readonly apkDownload: string;
}

export interface Release {
  readonly appName: string;
  readonly slogan: string;
  readonly author: string;
  readonly copyright: string;
  readonly releaseTitle: string;
  readonly version: string;
  readonly build: number;
  readonly gitTag: string;
  readonly commitSha: string;
  readonly packageName: string;
  readonly publishedAt: string;
  readonly platform: PlatformRequirement;
  readonly apk: ApkInfo;
  readonly signature: SignatureInfo;
  readonly distribution: DistributionInfo;
  readonly urls: ReleaseUrls;
  readonly docs: Readonly<Record<string, string>>;
}

/** Raised with every problem found at once, so one build shows them all. */
export class ReleaseDataError extends Error {
  constructor(problems: readonly string[]) {
    super(
      'Некорректные данные о релизе (src/data/release.json):\n' +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
    this.name = 'ReleaseDataError';
  }
}

const SHA256 = /^[0-9a-f]{64}$/;
const SHA1 = /^[0-9a-f]{40}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const PACKAGE_NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

type Json = Record<string, unknown>;

function asObject(source: Json, key: string, problems: string[]): Json | null {
  const value = source[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`поле «${key}» обязательно и должно быть объектом`);
    return null;
  }
  return value as Json;
}

function asText(source: Json, key: string, problems: string[], path = ''): string {
  const value = source[key];
  const label = path === '' ? `«${key}»` : `«${path}.${key}»`;
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`поле ${label} обязательно и должно быть непустой строкой`);
    return '';
  }
  return value;
}

function asInteger(source: Json, key: string, problems: string[], path = ''): number {
  const value = source[key];
  const label = path === '' ? `«${key}»` : `«${path}.${key}»`;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    problems.push(`поле ${label} обязательно и должно быть целым положительным числом`);
    return 0;
  }
  return value;
}

function asStringArray(source: Json, key: string, problems: string[], path = ''): readonly string[] {
  const value = source[key];
  const label = path === '' ? `«${key}»` : `«${path}.${key}»`;
  const invalid =
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.trim() === '');
  if (invalid) {
    problems.push(`поле ${label} обязательно и должно быть непустым массивом строк`);
    return [];
  }
  return value as readonly string[];
}

function asBoolean(source: Json, key: string, problems: string[], path = ''): boolean {
  const value = source[key];
  const label = path === '' ? `«${key}»` : `«${path}.${key}»`;
  if (typeof value !== 'boolean') {
    problems.push(`поле ${label} обязательно и должно быть булевым значением`);
    return false;
  }
  return value;
}

/** HTTPS URL with a host: the only link shape allowed by the release data. */
function asHttpsUrl(source: Json, key: string, problems: string[], path = ''): string {
  const value = asText(source, key, problems, path);
  const label = path === '' ? `«${key}»` : `«${path}.${key}»`;
  if (value === '') {
    return '';
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    problems.push(`поле ${label} должно быть абсолютной ссылкой`);
    return value;
  }
  if (parsed.protocol !== 'https:') {
    problems.push(`поле ${label} должно использовать HTTPS: ${value}`);
  }
  if (parsed.hostname === '') {
    problems.push(`поле ${label} должно содержать имя хоста`);
  }
  return value;
}

export function validateRelease(raw: unknown): Release {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ReleaseDataError(['файл должен содержать объект JSON']);
  }
  const source = raw as Json;

  const appName = asText(source, 'appName', problems);
  const slogan = asText(source, 'slogan', problems);
  const author = asText(source, 'author', problems);
  const copyright = asText(source, 'copyright', problems);
  const releaseTitle = asText(source, 'releaseTitle', problems);
  const version = asText(source, 'version', problems);
  const build = asInteger(source, 'build', problems);
  const gitTag = asText(source, 'gitTag', problems);
  const commitSha = asText(source, 'commitSha', problems);
  const packageName = asText(source, 'packageName', problems);
  const publishedAt = asText(source, 'publishedAt', problems);

  const platform = asObject(source, 'platform', problems) ?? {};
  const platformValue: PlatformRequirement = {
    name: asText(platform, 'name', problems, 'platform'),
    minVersion: asText(platform, 'minVersion', problems, 'platform'),
    minApiLevel: asInteger(platform, 'minApiLevel', problems, 'platform'),
    targetApiLevel: asInteger(platform, 'targetApiLevel', problems, 'platform'),
  };

  const apk = asObject(source, 'apk', problems) ?? {};
  const apkValue: ApkInfo = {
    fileName: asText(apk, 'fileName', problems, 'apk'),
    sizeBytes: asInteger(apk, 'sizeBytes', problems, 'apk'),
    sha256: asText(apk, 'sha256', problems, 'apk'),
    architectures: asStringArray(apk, 'architectures', problems, 'apk'),
    alignment: asText(apk, 'alignment', problems, 'apk'),
    signingSchemes: asStringArray(apk, 'signingSchemes', problems, 'apk'),
  };

  const signature = asObject(source, 'signature', problems) ?? {};
  const signatureValue: SignatureInfo = {
    keyAlgorithm: asText(signature, 'keyAlgorithm', problems, 'signature'),
    certificateAlgorithm: asText(signature, 'certificateAlgorithm', problems, 'signature'),
    certificateSubject: asText(signature, 'certificateSubject', problems, 'signature'),
    certificateSha256: asText(signature, 'certificateSha256', problems, 'signature'),
    certificateSha1: asText(signature, 'certificateSha1', problems, 'signature'),
    certificateValidUntil: asText(signature, 'certificateValidUntil', problems, 'signature'),
    keystoreKind: asText(signature, 'keystoreKind', problems, 'signature'),
  };

  const distribution = asObject(source, 'distribution', problems) ?? {};
  const distributionValue: DistributionInfo = {
    channel: asText(distribution, 'channel', problems, 'distribution'),
    requiresAccount: asBoolean(distribution, 'requiresAccount', problems, 'distribution'),
    requiresRegistration: asBoolean(distribution, 'requiresRegistration', problems, 'distribution'),
    hostedOnThisSite: asBoolean(distribution, 'hostedOnThisSite', problems, 'distribution'),
  };

  const urls = asObject(source, 'urls', problems) ?? {};
  const urlsValue: ReleaseUrls = {
    repository: asHttpsUrl(urls, 'repository', problems, 'urls'),
    release: asHttpsUrl(urls, 'release', problems, 'urls'),
    apkDownload: asHttpsUrl(urls, 'apkDownload', problems, 'urls'),
  };

  const docsSource = asObject(source, 'docs', problems) ?? {};
  const docs: Record<string, string> = {};
  for (const key of Object.keys(docsSource)) {
    docs[key] = asHttpsUrl(docsSource, key, problems, 'docs');
  }

  // --- Value checks ---------------------------------------------------------

  if (version !== '' && !SEMVER.test(version)) {
    problems.push(`«version» должна быть в виде MAJOR.MINOR.PATCH, получено: ${version}`);
  }
  if (version !== '' && gitTag !== '' && gitTag !== `v${version}`) {
    problems.push(`«gitTag» должен соответствовать версии: ожидалось v${version}, получено ${gitTag}`);
  }
  if (commitSha !== '' && !SHA1.test(commitSha)) {
    problems.push('«commitSha» должна быть полной SHA-1 хеш-суммой коммита (40 шестнадцатеричных символов)');
  }
  if (packageName !== '' && !PACKAGE_NAME.test(packageName)) {
    problems.push(`«packageName» не похоже на идентификатор Android-пакета: ${packageName}`);
  }
  if (publishedAt !== '' && Number.isNaN(Date.parse(publishedAt))) {
    problems.push(`«publishedAt» должно быть датой в формате ISO 8601, получено: ${publishedAt}`);
  }
  if (apkValue.sha256 !== '' && !SHA256.test(apkValue.sha256)) {
    problems.push('«apk.sha256» должна быть SHA-256 хеш-суммой в нижнем регистре (64 шестнадцатеричных символа)');
  }
  if (signatureValue.certificateSha256 !== '' && !SHA256.test(signatureValue.certificateSha256)) {
    problems.push('«signature.certificateSha256» должна быть SHA-256 хеш-суммой в нижнем регистре');
  }
  if (signatureValue.certificateSha1 !== '' && !SHA1.test(signatureValue.certificateSha1)) {
    problems.push('«signature.certificateSha1» должна быть SHA-1 хеш-суммой в нижнем регистре');
  }
  if (
    platformValue.minApiLevel > 0 &&
    platformValue.targetApiLevel > 0 &&
    platformValue.targetApiLevel < platformValue.minApiLevel
  ) {
    problems.push('«platform.targetApiLevel» не может быть ниже «platform.minApiLevel»');
  }

  // The download link must stay inside the official release of the same
  // repository: no mirror, fork or third-party file host. GitHub publishes
  // assets at /releases/download/<tag>/<file> next to /releases/tag/<tag>.
  const releaseTagMarker = '/releases/tag/';
  if (
    urlsValue.release !== '' &&
    urlsValue.repository !== '' &&
    !urlsValue.release.startsWith(`${urlsValue.repository}${releaseTagMarker}`)
  ) {
    problems.push('«urls.release» должен указывать на релиз в репозитории «urls.repository»');
  } else if (urlsValue.apkDownload !== '' && urlsValue.release !== '') {
    const downloadPrefix = urlsValue.release.replace(releaseTagMarker, '/releases/download/');
    if (!urlsValue.apkDownload.startsWith(`${downloadPrefix}/`)) {
      problems.push(`«urls.apkDownload» должен указывать на файл внутри ${downloadPrefix}/`);
    }
  }
  if (
    apkValue.fileName !== '' &&
    urlsValue.apkDownload !== '' &&
    !urlsValue.apkDownload.endsWith(encodeURIComponent(apkValue.fileName))
  ) {
    problems.push(
      `«urls.apkDownload» должен заканчиваться именем файла «apk.fileName» (${encodeURIComponent(apkValue.fileName)})`,
    );
  }

  // The site never hosts the APK: the button always leaves for GitHub Releases.
  if (distributionValue.hostedOnThisSite) {
    problems.push('«distribution.hostedOnThisSite» должно быть false: APK не размещается на сайте');
  }

  if (problems.length > 0) {
    throw new ReleaseDataError(problems);
  }

  return {
    appName,
    slogan,
    author,
    copyright,
    releaseTitle,
    version,
    build,
    gitTag,
    commitSha,
    packageName,
    publishedAt,
    platform: platformValue,
    apk: apkValue,
    signature: signatureValue,
    distribution: distributionValue,
    urls: urlsValue,
    docs,
  };
}

/** «161,9 МиБ»: size in mebibytes with a comma decimal separator. */
export function formatBytes(bytes: number): string {
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(1).replace('.', ',')}\u00a0МиБ`;
}

/** «162 МиБ»: rounded size for prose. */
export function formatApproximateBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}\u00a0МиБ`;
}

/** «169 736 731 байт»: exact size with non-breaking group separators. */
export function formatExactBytes(bytes: number): string {
  const grouped = bytes.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return `${grouped}\u00a0байт`;
}

/** «AB:CD:…»: how apksigner and keytool print a certificate fingerprint. */
export function formatFingerprint(hex: string): string {
  return (hex.match(/../g) ?? []).join(':').toUpperCase();
}

/** Seven-character commit prefix for the provenance line. */
export function shortCommit(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * Link to a document in the application repository. A missing key is a build
 * error: a page must never ship a documentation link that does not exist.
 */
export function docUrl(source: Release, key: string): string {
  const value = source.docs[key];
  if (value === undefined) {
    throw new Error(`В src/data/release.json нет ссылки на документ «${key}»`);
  }
  return value;
}
