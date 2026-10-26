/**
 * Validated site data.
 *
 * Importing this module runs every schema check, so an invalid version,
 * checksum, link or icon stops the build instead of reaching a visitor.
 */

import releaseSource from '../data/release.json';
import projectSource from '../data/project.json';
import screensSource from '../data/screens.json';
import { validateRelease } from './release';
import { validateProject } from './project';
import { validateScreens } from './screens';

export const release = validateRelease(releaseSource);
export const project = validateProject(projectSource);
/** Screenshots are checked against the release identity published on the site. */
export const screens = validateScreens(screensSource, {
  version: release.version,
  build: release.build,
});
