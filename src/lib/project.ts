/**
 * Schema and validation for `src/data/project.json`: authorship, the idea of
 * the project, the feature list shown on the site, technology rows and the
 * mandatory third-party attributions.
 *
 * Feature icons are checked against `src/icons.ts`, so a typo fails the build
 * instead of rendering a card without an icon.
 */

import { hasIcon, FEATURE_ICON_NAMES } from '../icons';

export interface ProjectAuthor {
  readonly name: string;
  readonly role: string;
  readonly creditLine: string;
}

export interface ProjectRepository {
  readonly label: string;
  readonly url: string;
  readonly description: string;
}

export interface TechnologyRow {
  readonly layer: string;
  readonly value: string;
}

export interface ProjectFeature {
  readonly icon: string;
  readonly title: string;
  readonly summary: string;
}

export interface Attribution {
  readonly name: string;
  readonly role: string;
  readonly notice: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly url: string;
}

export interface BrandingInfo {
  readonly approvedIcon: string;
  readonly approvedIconSha256: string;
  readonly approvedIconSize: number;
  readonly note: string;
}

export interface Project {
  readonly name: string;
  readonly slogan: string;
  readonly description: string;
  /** Number of places in the editorial catalogue shipped with the app. */
  readonly catalogPlaces: number;
  readonly author: ProjectAuthor;
  readonly copyright: string;
  readonly idea: readonly string[];
  readonly repositories: { readonly app: ProjectRepository; readonly backend: ProjectRepository };
  readonly links: { readonly release: string; readonly apk: string };
  readonly technology: readonly TechnologyRow[];
  readonly features: readonly ProjectFeature[];
  readonly limitations: readonly string[];
  readonly safetyNotice: string;
  readonly branding: BrandingInfo;
  readonly attributions: readonly Attribution[];
}

export class ProjectDataError extends Error {
  constructor(problems: readonly string[]) {
    super(
      'Некорректные данные о проекте (src/data/project.json):\n' +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
    this.name = 'ProjectDataError';
  }
}

const SHA256 = /^[0-9a-f]{64}$/;

type Json = Record<string, unknown>;

function object(source: Json, key: string, problems: string[]): Json {
  const value = source[key];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    problems.push(`поле «${key}» обязательно и должно быть объектом`);
    return {};
  }
  return value as Json;
}

function text(source: Json, key: string, problems: string[], path = ''): string {
  const value = source[key];
  const label = path === '' ? `«${key}»` : `«${path}.${key}»`;
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`поле ${label} обязательно и должно быть непустой строкой`);
    return '';
  }
  return value;
}

function positiveInteger(source: Json, key: string, problems: string[], path = ''): number {
  const value = source[key];
  const label = path === '' ? `«${key}»` : `«${path}.${key}»`;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    problems.push(`поле ${label} обязательно и должно быть целым положительным числом`);
    return 0;
  }
  return value;
}

function textList(source: Json, key: string, problems: string[]): readonly string[] {
  const value = source[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    problems.push(`поле «${key}» обязательно и должно быть непустым массивом строк`);
    return [];
  }
  return value as readonly string[];
}

function objectList(source: Json, key: string, problems: string[]): readonly Json[] {
  const value = source[key];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'object' || item === null)) {
    problems.push(`поле «${key}» обязательно и должно быть непустым массивом объектов`);
    return [];
  }
  return value as readonly Json[];
}

function httpsUrl(source: Json, key: string, problems: string[], path = ''): string {
  const value = text(source, key, problems, path);
  const label = path === '' ? `«${key}»` : `«${path}.${key}»`;
  if (value === '') {
    return '';
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') {
      problems.push(`поле ${label} должно использовать HTTPS: ${value}`);
    }
    if (parsed.hostname === '') {
      problems.push(`поле ${label} должно содержать имя хоста`);
    }
  } catch {
    problems.push(`поле ${label} должно быть абсолютной ссылкой`);
  }
  return value;
}

function repository(source: Json, key: string, problems: string[]): ProjectRepository {
  const value = object(source, key, problems);
  return {
    label: text(value, 'label', problems, key),
    url: httpsUrl(value, 'url', problems, key),
    description: text(value, 'description', problems, key),
  };
}

export function validateProject(raw: unknown): Project {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ProjectDataError(['файл должен содержать объект JSON']);
  }
  const source = raw as Json;

  const name = text(source, 'name', problems);
  const slogan = text(source, 'slogan', problems);
  const description = text(source, 'description', problems);
  const catalogPlaces = positiveInteger(source, 'catalogPlaces', problems);
  const copyright = text(source, 'copyright', problems);
  const safetyNotice = text(source, 'safetyNotice', problems);
  const idea = textList(source, 'idea', problems);
  const limitations = textList(source, 'limitations', problems);

  const authorSource = object(source, 'author', problems);
  const author: ProjectAuthor = {
    name: text(authorSource, 'name', problems, 'author'),
    role: text(authorSource, 'role', problems, 'author'),
    creditLine: text(authorSource, 'creditLine', problems, 'author'),
  };

  const repositoriesSource = object(source, 'repositories', problems);
  const repositories = {
    app: repository(repositoriesSource, 'app', problems),
    backend: repository(repositoriesSource, 'backend', problems),
  };

  const linksSource = object(source, 'links', problems);
  const links = {
    release: httpsUrl(linksSource, 'release', problems, 'links'),
    apk: httpsUrl(linksSource, 'apk', problems, 'links'),
  };

  const technology: TechnologyRow[] = objectList(source, 'technology', problems).map((row) => ({
    layer: text(row, 'layer', problems, 'technology'),
    value: text(row, 'value', problems, 'technology'),
  }));

  const features: ProjectFeature[] = objectList(source, 'features', problems).map((row) => {
    const icon = text(row, 'icon', problems, 'features');
    if (icon !== '' && !hasIcon(icon)) {
      problems.push(
        `признак «icon: ${icon}» отсутствует в src/icons.ts (доступны: ${FEATURE_ICON_NAMES.join(', ')})`,
      );
    }
    return {
      icon,
      title: text(row, 'title', problems, 'features'),
      summary: text(row, 'summary', problems, 'features'),
    };
  });

  const brandingSource = object(source, 'branding', problems);
  const approvedIconSha256 = text(brandingSource, 'approvedIconSha256', problems, 'branding');
  if (approvedIconSha256 !== '' && !SHA256.test(approvedIconSha256)) {
    problems.push('поле «branding.approvedIconSha256» должно быть SHA-256 в нижнем регистре');
  }
  const branding: BrandingInfo = {
    approvedIcon: text(brandingSource, 'approvedIcon', problems, 'branding'),
    approvedIconSha256,
    approvedIconSize: positiveInteger(brandingSource, 'approvedIconSize', problems, 'branding'),
    note: text(brandingSource, 'note', problems, 'branding'),
  };

  const attributions: Attribution[] = objectList(source, 'attributions', problems).map((row) => ({
    name: text(row, 'name', problems, 'attributions'),
    role: text(row, 'role', problems, 'attributions'),
    notice: text(row, 'notice', problems, 'attributions'),
    license: text(row, 'license', problems, 'attributions'),
    licenseUrl: httpsUrl(row, 'licenseUrl', problems, 'attributions'),
    url: httpsUrl(row, 'url', problems, 'attributions'),
  }));

  // The site must not silently claim a different author than the application.
  if (author.name !== '' && !copyright.includes(author.name)) {
    problems.push('поле «copyright» должно содержать имя автора');
  }
  if (attributions.length > 0 && !attributions.some((item) => item.name.includes('OpenStreetMap'))) {
    problems.push('в атрибуциях обязателен источник OpenStreetMap (ODbL)');
  }

  if (problems.length > 0) {
    throw new ProjectDataError(problems);
  }

  return {
    name,
    slogan,
    description,
    catalogPlaces,
    author,
    copyright,
    idea,
    repositories,
    links,
    technology,
    features,
    limitations,
    safetyNotice,
    branding,
    attributions,
  };
}
