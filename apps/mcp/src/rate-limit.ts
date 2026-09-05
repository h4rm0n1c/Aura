export interface RateLimiterLike {
  limit(options: { readonly key: string }): Promise<{ readonly success: boolean }>;
}

export type RateLimitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly unavailable: boolean };

export async function checkRateLimit(limiter: RateLimiterLike, key: string): Promise<RateLimitResult> {
  if (key.length === 0 || key.length > 256 || /[\r\n]/.test(key)) {
    return { ok: false, unavailable: true };
  }
  try {
    const result = await limiter.limit({ key });
    return result.success === true ? { ok: true } : { ok: false, unavailable: false };
  } catch {
    return { ok: false, unavailable: true };
  }
}

export function authRateKey(request: Request): string {
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip === null || ip.length === 0 || ip.length > 64 || /[\r\n]/.test(ip)) return "unknown";
  return ip;
}
