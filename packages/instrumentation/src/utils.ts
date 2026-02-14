export function safeStringify(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function messageHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function truncate(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, "utf8") <= maxBytes) {
    return value;
  }

  let output = "";
  for (const char of value) {
    const next = output + char;
    if (Buffer.byteLength(next, "utf8") > maxBytes) {
      break;
    }
    output = next;
  }

  return `${output}... [truncated]`;
}

export function toHeaderRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

export function normalizeMethod(method: string | undefined):
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS"
  | "UNKNOWN" {
  if (!method) {
    return "GET";
  }

  const upper = method.toUpperCase();
  if (
    upper === "GET" ||
    upper === "POST" ||
    upper === "PUT" ||
    upper === "DELETE" ||
    upper === "PATCH" ||
    upper === "HEAD" ||
    upper === "OPTIONS"
  ) {
    return upper;
  }

  return "UNKNOWN";
}

export function redactRecord(
  record: Record<string, string>,
  blocked: string[],
): Record<string, string> {
  if (blocked.length === 0) {
    return record;
  }

  const blockedSet = new Set(blocked.map((item) => item.toLowerCase()));
  const next: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    next[key] = blockedSet.has(key.toLowerCase()) ? "[REDACTED]" : value;
  }

  return next;
}
