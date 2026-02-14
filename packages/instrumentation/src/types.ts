export type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  args: unknown[];
  stack?: string | undefined;
  hash: string;
}

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "HEAD"
  | "OPTIONS"
  | "UNKNOWN";

export interface NetworkRequest {
  id: string;
  timestamp: number;
  method: HttpMethod;
  url: string;
  status: number;
  statusText: string;
  duration: number;
  requestHeaders: Record<string, string>;
  requestBody?: string | undefined;
  responseHeaders: Record<string, string>;
  responseBody?: string | undefined;
  timing: {
    start: number;
    end: number;
  };
  error?: string | undefined;
  source: "fetch" | "http" | "https";
}

export type WSMessage =
  | { type: "log"; data: LogEntry }
  | { type: "network"; data: NetworkRequest }
  | { type: "batch"; data: { logs: LogEntry[]; requests: NetworkRequest[] } }
  | { type: "clear"; target: "logs" | "network" | "all" }
  | {
      type: "status";
      data: {
        pausedLogs: boolean;
        pausedNetwork: boolean;
      };
    }
  | {
      type: "control";
      data: {
        pauseLogs?: boolean;
        pauseNetwork?: boolean;
        truncateBodyBytes?: number;
        captureRequestBodies?: boolean;
        captureResponseBodies?: boolean;
        redactHeaders?: string[];
      };
    }
  | { type: "config"; data: RuntimeCaptureConfig };

export interface DevToolsOptions {
  wsPort?: number;
  wsHost?: string;
  maxLogs?: number;
  maxRequests?: number;
  truncateBodyBytes?: number;
  captureRequestBodies?: boolean;
  captureResponseBodies?: boolean;
  redactHeaders?: string[];
}

export interface RuntimeCaptureConfig {
  truncateBodyBytes: number;
  captureRequestBodies: boolean;
  captureResponseBodies: boolean;
  redactHeaders: string[];
}

export interface RunningDevTools {
  shutdown: () => void;
}
