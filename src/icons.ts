/**
 * Inline SVG icon set.
 *
 * Icons are drawn on a 24×24 grid as stroked paths and inherit `currentColor`,
 * so they follow the text colour of the surrounding block. `filled` icons
 * (brand marks) use their own viewBox and are painted with `fill` instead.
 *
 * Feature cards in `src/data/project.json` reference these keys by name; an
 * unknown key fails the build in `src/lib/project.ts` rather than rendering an
 * empty placeholder.
 */

export interface IconDefinition {
  /** Defaults to `0 0 24 24`. */
  readonly viewBox?: string;
  /** Painted with `fill` instead of `stroke` (brand marks). */
  readonly filled?: boolean;
  readonly paths: readonly string[];
}

export const ICONS: Readonly<Record<string, IconDefinition>> = {
  // --- Application features -------------------------------------------------
  map: {
    paths: ['M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3Z', 'M9 3v15', 'M15 6v15'],
  },
  catalog: {
    paths: [
      'M12 3.2 3 7.6l9 4.4 9-4.4-9-4.4Z',
      'm3 12.3 9 4.4 9-4.4',
      'm3 16.6 9 4.4 9-4.4',
    ],
  },
  route: {
    paths: [
      'M4 18a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0Z',
      'M15 6a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0Z',
      'M6.5 15.5v-3.2a3.9 3.9 0 0 1 3.9-3.9h4.9',
    ],
  },
  sparkle: {
    paths: [
      'M12 3.2l1.85 5 5 1.85-5 1.85L12 16.9l-1.85-5-5-1.85 5-1.85L12 3.2Z',
      'M18.4 15.6l.75 2.05 2.05.75-2.05.75-.75 2.05-.75-2.05-2.05-.75 2.05-.75.75-2.05Z',
    ],
  },
  scenic: {
    paths: ['M12 3.4 7.1 11h3L6.3 17.2h11.4L13.9 11h3L12 3.4Z', 'M12 17.2v3.4'],
  },
  chart: {
    paths: ['M4 20.4h16', 'M7.5 20.4v-6.2', 'M12 20.4V7.6', 'M16.5 20.4v-3.4'],
  },
  assistant: {
    paths: [
      'M4.2 5.6A2.6 2.6 0 0 1 6.8 3h10.4a2.6 2.6 0 0 1 2.6 2.6v6.8a2.6 2.6 0 0 1-2.6 2.6H9.4L4.2 19.6V5.6Z',
      'M12 6.4l.95 2.4 2.4.95-2.4.95-.95 2.4-.95-2.4-2.4-.95 2.4-.95.95-2.4Z',
    ],
  },
  mic: {
    paths: [
      'M12 3.6a2.4 2.4 0 0 1 2.4 2.4v5.2a2.4 2.4 0 0 1-4.8 0V6a2.4 2.4 0 0 1 2.4-2.4Z',
      'M6.4 11.6a5.6 5.6 0 0 0 11.2 0',
      'M12 17.2v3.2',
      'M9.4 20.4h5.2',
    ],
  },
  navigation: {
    paths: ['M12 3.2 20.6 20.8 12 16.6 3.4 20.8 12 3.2Z'],
  },
  bookmark: {
    paths: ['M6.4 4.2A1.6 1.6 0 0 1 8 2.6h8a1.6 1.6 0 0 1 1.6 1.6v17.2L12 17l-5.6 4.4V4.2Z'],
  },

  // --- Interface ------------------------------------------------------------
  download: {
    paths: ['M12 3.4v11.4', 'm7.6 10.6 4.4 4.4 4.4-4.4', 'M4.4 20.4h15.2'],
  },
  shield: {
    paths: ['M12 3 5 5.9v5.9c0 4.5 2.9 7.8 7 9 4.1-1.2 7-4.5 7-9V5.9L12 3Z', 'm9.1 12.1 2.1 2.1 4-4'],
  },
  external: {
    paths: [
      'M14.2 4.2H20v5.8',
      'M20 4.2 11.6 12.6',
      'M17.6 13.8v4.6a1.6 1.6 0 0 1-1.6 1.6H5.8a1.6 1.6 0 0 1-1.6-1.6V8.2a1.6 1.6 0 0 1 1.6-1.6h4.6',
    ],
  },
  check: {
    paths: ['m5 12.8 4.5 4.5L19 6.8'],
  },
  alert: {
    paths: ['M12 4.2 21 19.8H3L12 4.2Z', 'M12 9.6v4.2', 'M12 16.6v.1'],
  },
  image: {
    paths: [
      'M4.4 5.6A1.6 1.6 0 0 1 6 4h12a1.6 1.6 0 0 1 1.6 1.6v12.8A1.6 1.6 0 0 1 18 20H6a1.6 1.6 0 0 1-1.6-1.6V5.6Z',
      'm4.8 17.2 4.6-5.2 3.2 3.4 2.6-2.8 4 4.6',
      'M9.4 9.6a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4Z',
    ],
  },
  chevron: {
    paths: ['m9 6 6 6-6 6'],
  },
  lock: {
    paths: [
      'M6.4 10.4h11.2a1.6 1.6 0 0 1 1.6 1.6v7a1.6 1.6 0 0 1-1.6 1.6H6.4a1.6 1.6 0 0 1-1.6-1.6v-7a1.6 1.6 0 0 1 1.6-1.6Z',
      'M8.6 10.4V7.8a3.4 3.4 0 0 1 6.8 0v2.6',
    ],
  },
  document: {
    paths: [
      'M13.2 3.4H6.4a1.6 1.6 0 0 0-1.6 1.6v14a1.6 1.6 0 0 0 1.6 1.6h11.2a1.6 1.6 0 0 0 1.6-1.6V9.4l-6-6Z',
      'M13.2 3.4v6h6',
      'M8.6 13.4h6.8',
      'M8.6 17h4.8',
    ],
  },
  home: {
    paths: ['M4 10.6 12 4l8 6.6V20a.6.6 0 0 1-.6.6h-4.8v-6h-5.2v6H4.6A.6.6 0 0 1 4 20v-9.4Z'],
  },
  copy: {
    paths: [
      'M9.4 8.6h8.4a1.6 1.6 0 0 1 1.6 1.6v8.4a1.6 1.6 0 0 1-1.6 1.6H9.4a1.6 1.6 0 0 1-1.6-1.6v-8.4a1.6 1.6 0 0 1 1.6-1.6Z',
      'M15.4 8.6V5.8a1.6 1.6 0 0 0-1.6-1.6H5.4a1.6 1.6 0 0 0-1.6 1.6v8.4a1.6 1.6 0 0 0 1.6 1.6h2.4',
    ],
  },
  expand: {
    paths: ['M9.4 4.2H4.2v5.2', 'M14.6 4.2h5.2v5.2', 'M14.6 19.8h5.2v-5.2', 'M9.4 19.8H4.2v-5.2'],
  },
  close: {
    paths: ['m6.6 6.6 10.8 10.8', 'm17.4 6.6-10.8 10.8'],
  },

  // --- Theme options --------------------------------------------------------
  auto: {
    paths: [
      'M4.6 5.2h14.8a1.6 1.6 0 0 1 1.6 1.6v8a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 14.8v-8a1.6 1.6 0 0 1 1.6-1.6Z',
      'M9.2 20.6h5.6',
      'M12 16.4v4.2',
    ],
  },
  sun: {
    paths: [
      'M12 8.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z',
      'M12 2.8v2',
      'M12 19.2v2',
      'M2.8 12h2',
      'M19.2 12h2',
      'm5.5 5.5 1.4 1.4',
      'm17.1 17.1 1.4 1.4',
      'm18.5 5.5-1.4 1.4',
      'm6.9 17.1-1.4 1.4',
    ],
  },
  moon: {
    paths: ['M20.2 14.4A8.6 8.6 0 0 1 9.6 3.8a8.6 8.6 0 1 0 10.6 10.6Z'],
  },

  // --- Brand marks ----------------------------------------------------------
  github: {
    filled: true,
    viewBox: '0 0 16 16',
    paths: [
      'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z',
    ],
  },
};

/** Icons that feature cards may reference. */
export const FEATURE_ICON_NAMES: readonly string[] = Object.freeze([
  'map',
  'catalog',
  'route',
  'sparkle',
  'scenic',
  'chart',
  'assistant',
  'mic',
  'navigation',
  'bookmark',
]);

export function hasIcon(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}
