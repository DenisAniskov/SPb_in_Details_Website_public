/**
 * Schema, validation and resolution for `src/data/screens.json`: the slots of
 * the "how the app looks" section.
 *
 * The rule this module enforces: **a file in `public/screens/` is not proof of
 * anything.** An image reaches a visitor only when the data file names its
 * provenance *and* describes the capture, and only for provenance values that
 * mean a real screen of the running app. A drawing produced by widget tests is
 * never presented as a screenshot, and an unexplained file stops the build
 * instead of quietly appearing on the page.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readImageSize } from './image-size';

export const SCREEN_PROVENANCE = [
  'device-screenshot',
  'emulator-screenshot',
  'widget-test-render',
] as const;

export type ScreenProvenance = (typeof SCREEN_PROVENANCE)[number];

/** Provenance values that may be shown to a visitor as a screenshot. */
export const PUBLISHABLE_PROVENANCE = ['device-screenshot', 'emulator-screenshot'] as const;

export type PublishableProvenance = (typeof PUBLISHABLE_PROVENANCE)[number];

export function isPublishable(provenance: ScreenProvenance | null): provenance is PublishableProvenance {
  return provenance !== null && (PUBLISHABLE_PROVENANCE as readonly string[]).includes(provenance);
}

/** How a screenshot was captured; required for every published image. */
export interface ScreenCapture {
  /** Device or emulator profile, as reported by the system. */
  readonly device: string;
  /** Capture date, `YYYY-MM-DD`. */
  readonly capturedAt: string;
  /** App version the capture shows; must match the release on the site. */
  readonly appVersion: string;
  /** Build number the capture shows; must match the release on the site. */
  readonly build: number;
}

export interface ScreenSlot {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Path under `public/`, referenced from the page as a root-relative URL. */
  readonly image: string;
  readonly alt: string;
  /** How the future screenshot was captured; `null` while none is published. */
  readonly provenance: ScreenProvenance | null;
  /** Capture details; present exactly when `provenance` is publishable. */
  readonly capture: ScreenCapture | null;
  /**
   * An honest archival capture of an **earlier** release, shown while the
   * screenshots of the current version are being taken. The `capture` data
   * stays exactly as recorded: the flag only lets the version check accept a
   * previous release and marks the image as archival on the page.
   */
  readonly archived: boolean;
}

export interface ScreensSection {
  readonly policy: string;
  readonly items: readonly ScreenSlot[];
}

export class ScreensDataError extends Error {
  constructor(problems: readonly string[]) {
    super(
      'Некорректные данные о скриншотах (src/data/screens.json):\n' +
        problems.map((problem) => `  - ${problem}`).join('\n'),
    );
    this.name = 'ScreensDataError';
  }
}

/** `capture.appVersion` and `capture.build` are checked against the release. */
export interface ReleaseIdentity {
  readonly version: string;
  readonly build: number;
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const IMAGE_PATH = /^\/screens\/[a-z0-9]+(-[a-z0-9]+)*\.(png|jpe?g|webp)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Smallest accepted capture: anything smaller is not a phone screen. */
const MIN_WIDTH = 320;
const MIN_HEIGHT = 480;

type Json = Record<string, unknown>;

function text(source: Json, key: string, problems: string[], path: string): string {
  const value = source[key];
  const label = `«${path}.${key}»`;
  if (typeof value !== 'string' || value.trim() === '') {
    problems.push(`поле ${label} обязательно и должно быть непустой строкой`);
    return '';
  }
  return value;
}

function isRealDate(value: string): boolean {
  const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10));
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const SEMVER_PARTS = /^\d+\.\d+\.\d+$/;

/** Compares two `MAJOR.MINOR.PATCH` strings; negative when `a` is older. */
function compareVersions(a: string, b: string): number {
  if (!SEMVER_PARTS.test(a) || !SEMVER_PARTS.test(b)) {
    return a === b ? 0 : Number.NaN;
  }
  const aParts = a.split('.').map(Number);
  const bParts = b.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (aParts[index] !== bParts[index]) {
      return (aParts[index] ?? 0) - (bParts[index] ?? 0);
    }
  }
  return 0;
}

function readCapture(
  item: Json,
  provenance: ScreenProvenance | null,
  archived: boolean,
  release: ReleaseIdentity,
  problems: string[],
  id: string,
): ScreenCapture | null {
  const raw = item['capture'];
  const publishable = isPublishable(provenance);

  if (raw === null || raw === undefined) {
    if (publishable) {
      problems.push(
        `у экрана ${id} указано происхождение «${provenance}», но нет поля «capture»: ` +
          'опишите устройство, дату съёмки, версию и сборку — без этого снимок не публикуется',
      );
    }
    return null;
  }

  if (typeof raw !== 'object' || Array.isArray(raw)) {
    problems.push(`«capture» экрана ${id} должен быть объектом или null`);
    return null;
  }

  const source = raw as Json;
  if (!publishable) {
    problems.push(
      `у экрана ${id} заполнен «capture», хотя происхождение «${provenance ?? 'null'}» ` +
        'не описывает съёмку с устройства: уберите «capture» или укажите реальный источник',
    );
  }

  const device = text(source, 'device', problems, `${id}.capture`);
  const capturedAt = text(source, 'capturedAt', problems, `${id}.capture`);
  const appVersion = text(source, 'appVersion', problems, `${id}.capture`);

  if (capturedAt !== '' && !DATE.test(capturedAt)) {
    problems.push(`«${id}.capture.capturedAt» должен быть датой вида 2026-10-19, получено: ${capturedAt}`);
  } else if (capturedAt !== '' && !isRealDate(capturedAt)) {
    problems.push(`«${id}.capture.capturedAt» не является существующей датой: ${capturedAt}`);
  }

  const buildRaw = source['build'];
  let build = 0;
  if (typeof buildRaw !== 'number' || !Number.isInteger(buildRaw) || buildRaw <= 0) {
    problems.push(`«${id}.capture.build» должен быть целым положительным числом`);
  } else {
    build = buildRaw;
  }

  // A screenshot of another build must never be presented as this release.
  // The single documented exception is an explicitly marked archival capture of
  // an earlier release — and even then the archive must be older, never newer
  // or equal-but-different.
  if (appVersion !== '' && appVersion !== release.version) {
    if (!archived) {
      problems.push(
        `«${id}.capture.appVersion» = ${appVersion}, но сайт публикует версию ${release.version}: ` +
          'снимок другой сборки публиковать нельзя. Если это честный архивный снимок предыдущей ' +
          'версии, пометьте слот «archived: true» — он будет показан с пометкой об архивной версии',
      );
    } else if (compareVersions(appVersion, release.version) >= 0) {
      problems.push(
        `архивный снимок ${id} заявлен в версии ${appVersion}, но сайт публикует ${release.version}: ` +
          'архивом может быть только предыдущая версия',
      );
    }
  }
  if (build !== 0 && build !== release.build && appVersion === release.version) {
    problems.push(
      `«${id}.capture.build» = ${build}, но сайт публикует сборку ${release.build} версии ${appVersion}: ` +
        'снимок другой сборки публиковать нельзя',
    );
  }
  if (archived && appVersion !== '' && appVersion === release.version && build === release.build) {
    problems.push(
      `снимок ${id} сделан в текущей версии ${release.version} (сборка ${release.build}): ` +
        'помечать его архивным не нужно — уберите «archived»',
    );
  }

  return { device, capturedAt, appVersion, build };
}

export function validateScreens(raw: unknown, release: ReleaseIdentity): ScreensSection {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ScreensDataError(['файл должен содержать объект JSON']);
  }
  const source = raw as Json;

  const policy = text(source, 'policy', problems, 'screens');

  const itemsSource = source['items'];
  if (!Array.isArray(itemsSource) || itemsSource.length === 0) {
    throw new ScreensDataError(['поле «items» обязательно и должно быть непустым массивом']);
  }

  const seenIds = new Set<string>();
  const items: ScreenSlot[] = itemsSource.map((entry) => {
    const item = (typeof entry === 'object' && entry !== null ? entry : {}) as Json;
    const id = text(item, 'id', problems, 'items');
    if (id !== '' && !ID.test(id)) {
      problems.push(`«items.id» должен состоять из строчных латинских букв, цифр и дефисов, получено: ${id}`);
    }
    if (seenIds.has(id)) {
      problems.push(`«items.id» повторяется: ${id}`);
    }
    seenIds.add(id);

    const image = text(item, 'image', problems, `${id}.image`);
    if (image !== '' && !IMAGE_PATH.test(image)) {
      problems.push(
        `«image» экрана ${id} должен иметь вид /screens/<имя>.png|jpg|webp со строчными буквами, ` +
          `получено: ${image}`,
      );
    }

    const provenanceRaw = item['provenance'];
    let provenance: ScreenProvenance | null = null;
    if (provenanceRaw !== null) {
      if (typeof provenanceRaw !== 'string' || !(SCREEN_PROVENANCE as readonly string[]).includes(provenanceRaw)) {
        problems.push(
          `«provenance» экрана ${id} должен быть null или одним из: ${SCREEN_PROVENANCE.join(', ')}`,
        );
      } else {
        provenance = provenanceRaw as ScreenProvenance;
      }
    }

    const archivedRaw = item['archived'];
    let archived = false;
    if (archivedRaw !== undefined && archivedRaw !== null) {
      if (typeof archivedRaw !== 'boolean') {
        problems.push(`«archived» экрана ${id} должен быть логическим значением (true/false) или отсутствовать`);
      } else {
        archived = archivedRaw;
      }
    }
    if (archived && !isPublishable(provenance)) {
      problems.push(
        `«archived» экрана ${id} имеет смысл только для опубликованного снимка: ` +
          'архивной может быть реальная съёмка, а не пустой слот или отрисовка из тестов',
      );
    }

    return {
      id,
      title: text(item, 'title', problems, `items[${id}]`),
      description: text(item, 'description', problems, `items[${id}]`),
      image,
      alt: text(item, 'alt', problems, `items[${id}]`),
      provenance,
      capture: readCapture(item, provenance, archived, release, problems, id),
      archived,
    };
  });

  if (problems.length > 0) {
    throw new ScreensDataError(problems);
  }

  return { policy, items };
}

/** What the page may do with a slot. */
export type ScreenState =
  /** A verified capture: rendered as a screenshot. */
  | 'published'
  /** No verified image: the slot explains the screen instead. */
  | 'pending'
  /** Only a test render exists: kept out of the screenshot grid. */
  | 'test-render-only';

export interface ResolvedScreen extends ScreenSlot {
  readonly state: ScreenState;
  /** Intrinsic size of the published image, for `width`/`height` attributes. */
  readonly size: { readonly width: number; readonly height: number } | null;
  /** Line shown under the figure, derived from provenance — never free text. */
  readonly note: string | null;
}

/**
 * Decides the state of every slot against the files actually present in
 * `public/`, and refuses to guess: an image whose provenance is not stated, a
 * declared capture without a file, or a file that is not a readable portrait
 * image all stop the build.
 */
export function resolveScreens(
  section: ScreensSection,
  publicDir: string,
  currentVersion: string,
): readonly ResolvedScreen[] {
  const problems: string[] = [];

  const resolved = section.items.map((slot): ResolvedScreen => {
    const absolute = joinPublic(publicDir, slot.image);
    let size: { width: number; height: number } | null = null;
    let fileExists = false;

    try {
      const bytes = readFileSync(absolute);
      fileExists = true;
      size = readImageSize(bytes);
    } catch {
      fileExists = false;
    }

    if (slot.provenance === null) {
      if (fileExists) {
        problems.push(
          `файл ${slot.image} лежит в public/, но происхождение в screens.json не указано: ` +
            'наличие файла не подтверждает, что это снимок приложения. Укажите «provenance» и «capture» ' +
            'или уберите файл — до этого он на сайте не появится',
        );
      }
      return { ...slot, state: 'pending', size: null, note: null };
    }

    if (slot.provenance === 'widget-test-render') {
      // Never a screenshot: the slot keeps explaining the screen to visitors.
      return {
        ...slot,
        state: 'test-render-only',
        size: null,
        note:
          'Есть только отрисовка интерфейса из автотестов приложения. Как скриншот она не ' +
          'публикуется: снимок экрана устройства ещё не снят.',
      };
    }

    if (!fileExists) {
      problems.push(
        `у экрана ${slot.id} указано происхождение «${slot.provenance}», но файла ${slot.image} нет: ` +
          'либо добавьте снимок, либо верните «provenance» в null',
      );
      return { ...slot, state: 'pending', size: null, note: null };
    }

    if (size === null) {
      problems.push(
        `файл ${slot.image} не читается как PNG, JPEG или WebP: такой формат не публикуется ` +
          'как скриншот приложения',
      );
      return { ...slot, state: 'pending', size: null, note: null };
    }

    if (size.height <= size.width) {
      problems.push(
        `файл ${slot.image} имеет размер ${size.width}×${size.height}: снимок экрана телефона ` +
          'должен быть вертикальным, проверьте, что экспортирован нужный кадр',
      );
      return { ...slot, state: 'pending', size: null, note: null };
    }

    if (size.width < MIN_WIDTH || size.height < MIN_HEIGHT) {
      problems.push(
        `файл ${slot.image} имеет размер ${size.width}×${size.height}, это меньше ${MIN_WIDTH}×${MIN_HEIGHT}: ` +
          'слишком мелкое изображение не публикуется как скриншот',
      );
      return { ...slot, state: 'pending', size: null, note: null };
    }

    return {
      ...slot,
      state: 'published',
      size,
      note: slot.archived
        ? archivalNote(slot.capture, currentVersion)
        : provenanceNote(slot.provenance, slot.capture),
    };
  });

  if (problems.length > 0) {
    throw new ScreensDataError(problems);
  }

  return resolved;
}

function joinPublic(publicDir: string, image: string): string {
  return join(publicDir, image.replace(/^\/+/, ''));
}

/** The capture details in one sentence: device, app version, build, date. */
export function captureDetails(capture: ScreenCapture): string {
  return (
    `Устройство: ${capture.device}. Версия ${capture.appVersion} ` +
    `(сборка ${capture.build}), ${formatDate(capture.capturedAt)}.`
  );
}

/**
 * One line for a capture shared by the whole grid. Used instead of repeating
 * the same sentence under every figure.
 */
export function captureNote(provenance: PublishableProvenance, capture: ScreenCapture): string {
  const origin =
    provenance === 'device-screenshot'
      ? 'Снимки экрана сделаны на физическом устройстве с установленным приложением'
      : 'Снимки экрана сделаны на эмуляторе Android, а не на физическом устройстве';
  return (
    `${origin}. ${captureDetails(capture)} ` +
    'Изображения публикуются как есть: интерфейс на них не дорисовывался и не подменялся.'
  );
}

/**
 * One line for an explicitly archived capture of a previous release. The
 * captured version and build are always stated, so an archival image is never
 * mistaken for the current release even if the note is read on its own. No
 * claim is made about the current release: whether the interface still looks
 * the same would need its own verified capture before it could be stated.
 */
export function archivalNote(capture: ScreenCapture | null, currentVersion: string): string {
  const details = capture === null ? '' : ` ${captureDetails(capture)}`;
  return (
    `Это архивные снимки предыдущей версии приложения: они сняты на реальном ` +
    `устройстве и не являются снимками текущей версии ${currentVersion}.${details}`
  );
}

/** Human-readable provenance note shown under a published screenshot. */
export function provenanceNote(provenance: ScreenProvenance, capture: ScreenCapture | null): string {
  const details = capture === null ? '' : ` ${captureDetails(capture)}`;

  switch (provenance) {
    case 'device-screenshot':
      return `Снимок экрана, сделанный на физическом устройстве с установленным приложением.${details}`;
    case 'emulator-screenshot':
      return `Снимок экрана, сделанный на эмуляторе Android, а не на физическом устройстве.${details}`;
    case 'widget-test-render':
      return (
        'Отрисовка интерфейса в тестах приложения, а не снимок экрана устройства: ' +
        'такое изображение не публикуется как скриншот.'
      );
  }
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}
