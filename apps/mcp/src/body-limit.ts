export const MAX_MCP_REQUEST_BODY_BYTES = 65_536;

export function requestHasJsonContentType(request: Request): boolean {
  if (request.method.toUpperCase() !== "POST") return true;

  const value = request.headers.get("Content-Type");
  if (value === null || value.length > 256) return false;

  const separator = value.indexOf(";");
  const mediaType = (separator === -1 ? value : value.slice(0, separator)).trim().toLowerCase();
  return mediaType === "application/json";
}

export async function requestBodyWithinLimit(
  request: Request,
  maxBytes = MAX_MCP_REQUEST_BODY_BYTES,
): Promise<boolean> {
  if (request.method.toUpperCase() !== "POST") return true;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) return false;

  const declared = request.headers.get("Content-Length");
  if (declared !== null) {
    if (!/^(0|[1-9][0-9]*)$/.test(declared)) return false;
    const length = Number(declared);
    if (!Number.isSafeInteger(length) || length > maxBytes) return false;
  }

  const body = request.clone().body;
  if (body === null) return true;
  const reader = body.getReader();
  let total = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return true;
      total += chunk.value.byteLength;
      if (total > maxBytes) return false;
    }
  } catch {
    return false;
  } finally {
    reader.releaseLock();
  }
}
