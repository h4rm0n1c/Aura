import { AURA_MARK_INLINE } from "./brand.ts";

/**
 * Serve the canonical Aura Accord mark directly as an SVG favicon.
 *
 * Keeping the favicon derived from the same checked-in mark as the page header
 * avoids a second, silently diverging brand asset. The SVG route is same-origin
 * and deliberately cache-revalidated so favicon fixes are not stuck behind a
 * long browser cache.
 */
export function faviconResponse(): Response {
  return new Response(AURA_MARK_INLINE, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
