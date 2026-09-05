const MAX_HOST_HEADER_CHARS = 512;
const MAX_ORIGIN_HEADER_CHARS = 2048;
const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export type McpRequestPolicyFailure =
  | "invalid_configuration"
  | "host_missing_or_invalid"
  | "host_not_allowed"
  | "origin_invalid"
  | "origin_not_allowed";

export type McpRequestPolicyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: McpRequestPolicyFailure };

export function validateMcpRequestPolicy(
  request: Request,
  allowedHostname: string,
): McpRequestPolicyResult {
  const expected = normalizeAllowedHostname(allowedHostname);
  if (expected === null) {
    return { ok: false, reason: "invalid_configuration" };
  }

  const host = request.headers.get("Host");
  const requestHostname = parseHostHeader(host);
  if (requestHostname === null) {
    return { ok: false, reason: "host_missing_or_invalid" };
  }
  if (requestHostname !== expected) {
    return { ok: false, reason: "host_not_allowed" };
  }

  const origin = request.headers.get("Origin");
  if (origin === null) {
    return { ok: true };
  }

  const parsedOrigin = parseOrigin(origin);
  if (parsedOrigin === null) {
    return { ok: false, reason: "origin_invalid" };
  }
  if (parsedOrigin.hostname !== expected) {
    return { ok: false, reason: "origin_not_allowed" };
  }
  if (expected !== "localhost" && parsedOrigin.protocol !== "https:") {
    return { ok: false, reason: "origin_not_allowed" };
  }

  return { ok: true };
}

function normalizeAllowedHostname(value: string): string | null {
  if (value.length === 0 || value !== value.trim() || value !== value.toLowerCase()) {
    return null;
  }
  if (value === "localhost") return value;
  return HOSTNAME.test(value) ? value : null;
}

function parseHostHeader(value: string | null): string | null {
  if (
    value === null ||
    value.length === 0 ||
    value.length > MAX_HOST_HEADER_CHARS ||
    /[\s/@\\]/.test(value)
  ) {
    return null;
  }

  try {
    const parsed = new URL(`https://${value}`);
    if (parsed.username !== "" || parsed.password !== "" || parsed.pathname !== "/") {
      return null;
    }
    return normalizeRequestHostname(parsed.hostname);
  } catch {
    return null;
  }
}

function parseOrigin(value: string): { readonly hostname: string; readonly protocol: string } | null {
  if (
    value.length === 0 ||
    value.length > MAX_ORIGIN_HEADER_CHARS ||
    value === "null" ||
    /[\s@\\]/.test(value)
  ) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (
      parsed.username !== "" ||
      parsed.password !== "" ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.origin !== value
    ) {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    const hostname = normalizeRequestHostname(parsed.hostname);
    return hostname === null ? null : { hostname, protocol: parsed.protocol };
  } catch {
    return null;
  }
}

function normalizeRequestHostname(value: string): string | null {
  const hostname = value.toLowerCase();
  if (hostname === "localhost") return hostname;
  return HOSTNAME.test(hostname) ? hostname : null;
}
