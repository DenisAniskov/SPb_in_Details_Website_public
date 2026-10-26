/**
 * robots.txt is generated rather than copied so the sitemap URL always matches
 * the canonical origin from `site` in astro.config.mjs.
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site, url }) => {
  const origin = site ?? new URL(url.origin);
  const sitemap = new URL('sitemap-index.xml', origin).href;

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
