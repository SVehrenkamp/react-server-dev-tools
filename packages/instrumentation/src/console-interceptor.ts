import type { DataCollector } from "./data-collector";
import type { LogLevel } from "./types";
import { messageHash, safeStringify } from "./utils";

const LEVELS: LogLevel[] = ["log", "info", "warn", "error", "debug"];

export function initConsoleInterceptor(collector: DataCollector): () => void {
  const original: Partial<Record<LogLevel, (...args: unknown[]) => void>> = {};

  for (const level of LEVELS) {
    original[level] = console[level].bind(console);

    console[level] = (...args: unknown[]) => {
      try {
        const message = args.map((arg) => safeStringify(arg)).join(" ");
        collector.addLog({
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          level,
          message,
          args,
          stack: level === "error" ? new Error().stack : undefined,
          hash: messageHash(`${level}:${message}`),
        });
      } catch {
        // fail-open to preserve app behavior
      }

      original[level]?.(...args);
    };
  }

  return () => {
    for (const level of LEVELS) {
      const fn = original[level];
      if (fn) {
        console[level] = fn;
      }
    }
  };
}
