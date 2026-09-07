const AURA_FAVICON_SVG = String.raw`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" role="img" aria-label="Aura" shape-rendering="geometricPrecision">
<rect width="16" height="16" rx="1.5" fill="#050505"/>
<path fill="#DFFB48" d="M8 1.1 8.7 4.05 11.65 4.75 8.7 5.45 8 8.4 7.3 5.45 4.35 4.75 7.3 4.05Z"/>
<path fill="#F2F0EB" d="M1.35 12.9v-2.45L5.25 7.3 8 9.3l-1.45 1.5-1.25-.92-1.72 1.48 1.22 1.38 1.48-1.24 1.27 1.3-1.82 1.72H3.05Z"/>
<path fill="#BFC7CE" d="M14.65 12.9v-2.45L10.75 7.3 8 9.3l1.45 1.5 1.25-.92 1.72 1.48-1.22 1.38-1.48-1.24-1.27 1.3 1.82 1.72h2.68Z"/>
<path fill="#DFFB48" d="m7.15 10.2.85-.9.85.9-.85.84Z"/>
</svg>`;

/**
 * A favicon is not the full Accord logo scaled down. This derivative is drawn
 * directly on a 16x16 grid: the four-point Accord star plus two broad opposing
 * hand/forearm shapes. Fine finger geometry, glow filters and wordmark detail
 * are intentionally omitted because they collapse into noise at tab-icon size.
 */
export function faviconResponse(): Response {
  return new Response(AURA_FAVICON_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
