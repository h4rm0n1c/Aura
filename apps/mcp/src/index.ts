import { createMcpHandler } from "@modelcontextprotocol/server";

import { authenticateMcpAuthorization } from "./auth/bearer.ts";
import { requestBodyWithinLimit, requestHasJsonContentType } from "./body-limit.ts";
import { loadAgentCredentialRecord } from "./db/credentials.ts";
import type { D1DatabaseLike } from "./db/d1.ts";
import { validateMcpRequestPolicy } from "./http-security.ts";
import { authRateKey, checkRateLimit, type RateLimiterLike } from "./rate-limit.ts";
import { createAuraMcpServer } from "./server.ts";

export interface Env {
  readonly DB: D1DatabaseLike;
  readonly AURA_MCP_HOSTNAME: string;
  readonly AUTH_RATE_LIMITER: RateLimiterLike;
  readonly AGENT_RATE_LIMITER: RateLimiterLike;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch {
      return new Response("Internal error", { status: 500, headers: SECURITY_HEADERS });
    }
  },
};

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname !== "/mcp" || url.search !== "") {
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  }
  if (!ALLOWED_METHODS.has(request.method.toUpperCase())) {
    return new Response("Method not allowed", {
      status: 405,
      headers: { ...SECURITY_HEADERS, Allow: "GET, POST, DELETE" },
    });
  }

  const policy = validateMcpRequestPolicy(request, env.AURA_MCP_HOSTNAME);
  if (!policy.ok) {
    const status = policy.reason === "invalid_configuration" ? 500 : 403;
    return new Response(status === 500 ? "Internal error" : "Forbidden", {
      status,
      headers: SECURITY_HEADERS,
    });
  }

  if (!requestHasJsonContentType(request)) {
    return new Response("Unsupported media type", { status: 415, headers: SECURITY_HEADERS });
  }

  const authLimit = await checkRateLimit(env.AUTH_RATE_LIMITER, authRateKey(request));
  if (!authLimit.ok) return rateLimitResponse(authLimit.unavailable);

  const authenticated = await authenticateMcpAuthorization(
    request.headers.get("Authorization"),
    (credentialId) => loadAgentCredentialRecord(env.DB, credentialId),
  );
  if (!authenticated.ok) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { ...SECURITY_HEADERS, "WWW-Authenticate": 'Bearer realm="Aura MCP"' },
    });
  }

  const agentLimit = await checkRateLimit(env.AGENT_RATE_LIMITER, authenticated.principal.agentId);
  if (!agentLimit.ok) return rateLimitResponse(agentLimit.unavailable);

  if (!(await requestBodyWithinLimit(request))) {
    return new Response("Request too large", { status: 413, headers: SECURITY_HEADERS });
  }

  const handler = createMcpHandler(() => createAuraMcpServer({
    db: env.DB,
    principal: authenticated.principal,
  }));
  const response = await handler.fetch(request);
  return withSecurityHeaders(response);
}

const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE"]);

const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function rateLimitResponse(unavailable: boolean): Response {
  if (unavailable) {
    return new Response("Service unavailable", { status: 503, headers: SECURITY_HEADERS });
  }
  return new Response("Too many requests", {
    status: 429,
    headers: { ...SECURITY_HEADERS, "Retry-After": "60" },
  });
}
