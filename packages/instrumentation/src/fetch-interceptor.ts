import type { DataCollector } from "./data-collector";
import type { RuntimeCaptureConfig } from "./types";
import { normalizeMethod, redactRecord, toHeaderRecord, truncate } from "./utils";

export interface FetchInterceptorOptions {
  getCaptureConfig: () => RuntimeCaptureConfig;
}

export function initFetchInterceptor(
  collector: DataCollector,
  options: FetchInterceptorOptions,
): () => void {
  if (typeof globalThis.fetch !== "function") {
    return () => {};
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const runtime = options.getCaptureConfig();
    const id = crypto.randomUUID();
    const startedAt = Date.now();

    const input = args[0];
    const init = args[1];
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const inputMethod = input instanceof Request ? input.method : undefined;
    const inputHeaders = input instanceof Request ? input.headers : undefined;
    const method = normalizeMethod(init?.method ?? inputMethod);

    const requestHeaders =
      init?.headers instanceof Headers
        ? toHeaderRecord(init.headers)
        : new Headers(init?.headers ?? inputHeaders);

    const requestHeaderRecord = redactRecord(
      requestHeaders instanceof Headers ? toHeaderRecord(requestHeaders) : requestHeaders,
      runtime.redactHeaders,
    );

    const requestBody =
      runtime.captureRequestBodies && init?.body !== undefined
        ? truncate(String(init.body), runtime.truncateBodyBytes)
        : undefined;

    try {
      const response = await originalFetch(...args);
      const endedAt = Date.now();

      const responseHeaders = redactRecord(
        toHeaderRecord(response.headers),
        runtime.redactHeaders,
      );

      let responseBody: string | undefined;
      if (runtime.captureResponseBodies) {
        try {
          responseBody = truncate(await response.clone().text(), runtime.truncateBodyBytes);
        } catch {
          responseBody = "[Unable to read response body]";
        }
      }

      collector.addNetwork({
        id,
        timestamp: startedAt,
        method,
        url,
        status: response.status,
        statusText: response.statusText,
        duration: endedAt - startedAt,
        requestHeaders: requestHeaderRecord,
        requestBody,
        responseHeaders,
        responseBody,
        timing: { start: startedAt, end: endedAt },
        source: "fetch",
      });

      return response;
    } catch (error) {
      const endedAt = Date.now();
      collector.addNetwork({
        id,
        timestamp: startedAt,
        method,
        url,
        status: 0,
        statusText: "Failed",
        duration: endedAt - startedAt,
        requestHeaders: requestHeaderRecord,
        requestBody,
        responseHeaders: {},
        timing: { start: startedAt, end: endedAt },
        error: error instanceof Error ? error.message : String(error),
        source: "fetch",
      });

      throw error;
    }
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}
