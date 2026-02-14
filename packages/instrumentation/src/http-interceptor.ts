import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

import type { DataCollector } from "./data-collector";
import type { RuntimeCaptureConfig } from "./types";
import { normalizeMethod, redactRecord, truncate } from "./utils";

export interface HttpInterceptorOptions {
  getCaptureConfig: () => RuntimeCaptureConfig;
}

type RequestFn = typeof http.request;

function buildUrlFromArgs(protocol: "http" | "https", args: unknown[]): string {
  const first = args[0];
  if (typeof first === "string") {
    if (first.startsWith("http://") || first.startsWith("https://")) {
      return first;
    }

    return `${protocol}://${first}`;
  }

  if (first instanceof URL) {
    return first.toString();
  }

  if (typeof first === "object" && first !== null) {
    const options = first as http.RequestOptions;
    const host = options.hostname ?? options.host ?? "127.0.0.1";
    const path = options.path ?? "/";
    return `${protocol}://${host}${path}`;
  }

  return `${protocol}://unknown`;
}

function patchRequest(
  protocol: "http" | "https",
  source: typeof http | typeof https,
  collector: DataCollector,
  options: HttpInterceptorOptions,
): () => void {
  const originalRequest: RequestFn = source.request;

  source.request = function wrappedRequest(...args: Parameters<RequestFn>) {
    const runtime = options.getCaptureConfig();
    const id = crypto.randomUUID();
    const startedAt = Date.now();
    const url = buildUrlFromArgs(protocol, args as unknown[]);

    const req = originalRequest.apply(source, args);

    const requestHeaders = redactRecord(
      Object.fromEntries(
        Object.entries(req.getHeaders()).map(([key, value]) => [key, String(value)]),
      ),
      runtime.redactHeaders,
    );

    const method = normalizeMethod(req.method);
    let requestBody = "";

    const originalWrite = req.write.bind(req);
    req.write = ((chunk: unknown, ...writeArgs: unknown[]) => {
      if (runtime.captureRequestBodies && typeof chunk !== "undefined") {
        requestBody += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
      }
      return originalWrite(chunk as never, ...(writeArgs as never[]));
    }) as typeof req.write;

    const originalEnd = req.end.bind(req);
    req.end = ((chunk: unknown, ...endArgs: unknown[]) => {
      if (runtime.captureRequestBodies && typeof chunk !== "undefined") {
        requestBody += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
      }
      return originalEnd(chunk as never, ...(endArgs as never[]));
    }) as typeof req.end;

    req.on("response", (res) => {
      const responseHeaders = redactRecord(
        Object.fromEntries(
          Object.entries(res.headers).map(([key, value]) => [key, String(value)]),
        ),
        runtime.redactHeaders,
      );

      let responseBody = "";
      if (runtime.captureResponseBodies) {
        res.on("data", (chunk) => {
          if (Buffer.byteLength(responseBody, "utf8") <= runtime.truncateBodyBytes) {
            responseBody += Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk);
          }
        });
      }

      res.on("end", () => {
        const endedAt = Date.now();
        collector.addNetwork({
          id,
          timestamp: startedAt,
          method,
          url,
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? "",
          duration: endedAt - startedAt,
          requestHeaders,
          requestBody: runtime.captureRequestBodies
            ? truncate(requestBody, runtime.truncateBodyBytes)
            : undefined,
          responseHeaders,
          responseBody: runtime.captureResponseBodies
            ? truncate(responseBody, runtime.truncateBodyBytes)
            : undefined,
          timing: { start: startedAt, end: endedAt },
          source: protocol,
        });
      });
    });

    req.on("error", (error: Error) => {
      const endedAt = Date.now();
      collector.addNetwork({
        id,
        timestamp: startedAt,
        method,
        url,
        status: 0,
        statusText: "Failed",
        duration: endedAt - startedAt,
        requestHeaders,
        requestBody: runtime.captureRequestBodies
          ? truncate(requestBody, runtime.truncateBodyBytes)
          : undefined,
        responseHeaders: {},
        timing: { start: startedAt, end: endedAt },
        error: error.message,
        source: protocol,
      });
    });

    return req;
  } as RequestFn;

  return () => {
    source.request = originalRequest;
  };
}

export function initHttpInterceptor(
  collector: DataCollector,
  options: HttpInterceptorOptions,
): () => void {
  const restoreHttp = patchRequest("http", http, collector, options);
  const restoreHttps = patchRequest("https", https, collector, options);

  return () => {
    restoreHttp();
    restoreHttps();
  };
}
