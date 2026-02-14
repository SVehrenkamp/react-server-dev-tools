import { initConsoleInterceptor } from "./console-interceptor";
import { DataCollector } from "./data-collector";
import { initFetchInterceptor } from "./fetch-interceptor";
import { initHttpInterceptor } from "./http-interceptor";
import type { DevToolsOptions, RunningDevTools, RuntimeCaptureConfig } from "./types";
import { startWebSocketServer } from "./websocket-server";

const defaults: Required<DevToolsOptions> = {
  wsPort: 3001,
  wsHost: "127.0.0.1",
  maxLogs: 10_000,
  maxRequests: 5_000,
  truncateBodyBytes: 1_000_000,
  captureRequestBodies: true,
  captureResponseBodies: true,
  redactHeaders: ["authorization", "cookie", "set-cookie"],
};

let active: RunningDevTools | null = null;
const ACTIVE_KEY = Symbol.for("server-devtools.active-instance");

type DevToolsGlobal = typeof globalThis & {
  [ACTIVE_KEY]?: RunningDevTools | null;
};

function getActiveInstance(): RunningDevTools | null {
  const globalActive = (globalThis as DevToolsGlobal)[ACTIVE_KEY];
  if (globalActive) {
    active = globalActive;
    return globalActive;
  }

  return active;
}

function setActiveInstance(instance: RunningDevTools | null): void {
  active = instance;
  (globalThis as DevToolsGlobal)[ACTIVE_KEY] = instance;
}

export function initServerDevTools(options: DevToolsOptions = {}): RunningDevTools {
  const current = getActiveInstance();
  if (current) {
    return current;
  }

  if (process.env.NODE_ENV === "production") {
    return {
      shutdown: () => {},
    };
  }

  const config = { ...defaults, ...options };
  const collector = new DataCollector({
    maxLogs: config.maxLogs,
    maxRequests: config.maxRequests,
  });

  const runtimeCapture: RuntimeCaptureConfig = {
    truncateBodyBytes: config.truncateBodyBytes,
    captureRequestBodies: config.captureRequestBodies,
    captureResponseBodies: config.captureResponseBodies,
    redactHeaders: [...config.redactHeaders],
  };

  const restoreConsole = initConsoleInterceptor(collector);
  const restoreFetch = initFetchInterceptor(collector, {
    getCaptureConfig: () => runtimeCapture,
  });
  const restoreHttp = initHttpInterceptor(collector, {
    getCaptureConfig: () => runtimeCapture,
  });

  const wsServer = startWebSocketServer(collector, {
    host: config.wsHost,
    port: config.wsPort,
    getCaptureConfig: () => runtimeCapture,
    onUpdateCaptureConfig: (patch) => {
      if (typeof patch.captureRequestBodies === "boolean") {
        runtimeCapture.captureRequestBodies = patch.captureRequestBodies;
      }
      if (typeof patch.captureResponseBodies === "boolean") {
        runtimeCapture.captureResponseBodies = patch.captureResponseBodies;
      }
      if (typeof patch.truncateBodyBytes === "number" && Number.isFinite(patch.truncateBodyBytes)) {
        runtimeCapture.truncateBodyBytes = Math.max(1_000, Math.floor(patch.truncateBodyBytes));
      }
      if (Array.isArray(patch.redactHeaders)) {
        runtimeCapture.redactHeaders = patch.redactHeaders
          .map((header) => header.trim().toLowerCase())
          .filter((header) => header.length > 0);
      }
    },
  });

  wsServer.on("error", (error) => {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
      return;
    }
    console.warn("[server-devtools] websocket server error", error);
  });

  const shutdown = () => {
    restoreConsole();
    restoreFetch();
    restoreHttp();
    wsServer.close();
    setActiveInstance(null);
  };

  const instance = { shutdown };
  setActiveInstance(instance);
  return instance;
}

export type {
  DevToolsOptions,
  HttpMethod,
  LogEntry,
  LogLevel,
  NetworkRequest,
  RuntimeCaptureConfig,
  WSMessage,
} from "./types";
