import { WebSocketServer } from "ws";

import type { DataCollector } from "./data-collector";
import type { LogEntry, NetworkRequest } from "./types";
import type { RuntimeCaptureConfig } from "./types";
import type { WSMessage } from "./types";

type ControlMessage = Extract<WSMessage, { type: "control" }>;

interface WebSocketServerOptions {
  port: number;
  host: string;
  getCaptureConfig: () => RuntimeCaptureConfig;
  onUpdateCaptureConfig: (patch: ControlMessage["data"]) => void;
}

function sendSafe(ws: { readyState: number; send: (value: string) => void }, message: WSMessage): void {
  if (ws.readyState !== 1) {
    return;
  }

  try {
    ws.send(JSON.stringify(message));
  } catch {
    // drop failed send, don't crash app runtime
  }
}

export function startWebSocketServer(
  collector: DataCollector,
  options: WebSocketServerOptions,
): WebSocketServer {
  const wss = new WebSocketServer({
    host: options.host,
    port: options.port,
  });

  const onLog = (entry: LogEntry) => {
    for (const client of wss.clients) {
      sendSafe(client, { type: "log", data: entry });
    }
  };

  const onNetwork = (entry: NetworkRequest) => {
    for (const client of wss.clients) {
      sendSafe(client, { type: "network", data: entry });
    }
  };

  const onClear = (target: "logs" | "network" | "all") => {
    for (const client of wss.clients) {
      sendSafe(client, { type: "clear", target });
    }
  };

  const onStatus = (status: { pausedLogs: boolean; pausedNetwork: boolean }) => {
    for (const client of wss.clients) {
      sendSafe(client, { type: "status", data: status });
    }
  };

  collector.on("log", onLog);
  collector.on("network", onNetwork);
  collector.on("clear", onClear);
  collector.on("status", onStatus);

  wss.on("connection", (ws) => {
    sendSafe(ws, {
      type: "batch",
      data: {
        logs: collector.getLogs(),
        requests: collector.getRequests(),
      },
    });
    sendSafe(ws, { type: "status", data: collector.getStatus() });
    sendSafe(ws, { type: "config", data: options.getCaptureConfig() });

    ws.on("message", (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as WSMessage;
        if (parsed.type === "clear") {
          collector.clear(parsed.target);
        }

        if (parsed.type === "control") {
          if (typeof parsed.data.pauseLogs === "boolean") {
            collector.setPaused("logs", parsed.data.pauseLogs);
          }
          if (typeof parsed.data.pauseNetwork === "boolean") {
            collector.setPaused("network", parsed.data.pauseNetwork);
          }

          const hasConfigUpdate =
            typeof parsed.data.captureRequestBodies === "boolean" ||
            typeof parsed.data.captureResponseBodies === "boolean" ||
            typeof parsed.data.truncateBodyBytes === "number" ||
            Array.isArray(parsed.data.redactHeaders);

          if (hasConfigUpdate) {
            options.onUpdateCaptureConfig(parsed.data);
            const nextConfig = options.getCaptureConfig();
            for (const client of wss.clients) {
              sendSafe(client, { type: "config", data: nextConfig });
            }
          }
        }
      } catch {
        // ignore malformed data
      }
    });
  });

  wss.on("close", () => {
    collector.off("log", onLog);
    collector.off("network", onNetwork);
    collector.off("clear", onClear);
    collector.off("status", onStatus);
  });

  return wss;
}
