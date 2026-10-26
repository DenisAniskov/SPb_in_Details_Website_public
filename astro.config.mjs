// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

/**
 * Canonical origin used for <link rel="canonical">, Open Graph URLs, the
 * sitemap and robots.txt.
 *
 * Resolution order:
 *   1. SITE_URL              — explicit override, set in Vercel when the
 *                              production domain is known.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — injected by Vercel for the project's
 *                              production domain.
 *   3. The placeholder origin below — keeps local builds and the sitemap
 *                              valid until the real domain is assigned.
 */
const vercelProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const site =
  process.env.SITE_URL ??
  (vercelProductionUrl ? `https://${vercelProductionUrl}` : 'https://spb-in-details.vercel.app');

export default defineConfig({
  site,
  // Static generation: the deployment target serves plain HTML files.
  output: 'static',
  integrations: [sitemap()],
  build: {
    // External stylesheet instead of an inline <style> block, so the
    // Content-Security-Policy can stay strict and CSS stays cacheable.
    inlineStylesheets: 'never',
  },
  compressHTML: true,
  devToolbar: { enabled: false },
});
