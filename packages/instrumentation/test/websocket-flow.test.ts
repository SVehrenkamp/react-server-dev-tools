import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import { DataCollector } from "../src/data-collector";
import type { LogEntry, WSMessage } from "../src/types";
import { startWebSocketServer } from "../src/websocket-server";

function createLog(id: string, message: string): LogEntry {
  return {
    id,
    timestamp: Date.now(),
    level: "info",
    message,
    args: [message],
    hash: id,
  };
}

describe("websocket flow", () => {
  const cleanup: Array<() => void> = [];

  afterEach(() => {
    for (const fn of cleanup.splice(0)) {
      fn();
    }
  });

  it("sends history, streams updates, and honors pause controls", async () => {
    const collector = new DataCollector({ maxLogs: 100, maxRequests: 100 });
    collector.addLog(createLog("seed", "seed message"));

    const runtimeConfig = {
      truncateBodyBytes: 1_000_000,
      captureRequestBodies: true,
      captureResponseBodies: true,
      redactHeaders: ["authorization"],
    };

    const wss = startWebSocketServer(collector, {
      host: "127.0.0.1",
      port: 0,
      getCaptureConfig: () => runtimeConfig,
      onUpdateCaptureConfig: (patch) => {
        if (typeof patch.captureRequestBodies === "boolean") {
          runtimeConfig.captureRequestBodies = patch.captureRequestBodies;
        }
        if (typeof patch.captureResponseBodies === "boolean") {
          runtimeConfig.captureResponseBodies = patch.captureResponseBodies;
        }
        if (typeof patch.truncateBodyBytes === "number") {
          runtimeConfig.truncateBodyBytes = patch.truncateBodyBytes;
        }
        if (Array.isArray(patch.redactHeaders)) {
          runtimeConfig.redactHeaders = patch.redactHeaders;
        }
      },
    });
    cleanup.push(() => wss.close());

    await vi.waitFor(() => {
      const address = wss.address();
      expect(address).not.toBeNull();
    });

    const address = wss.address();
    if (address === null || typeof address === "string") {
      throw new Error("Unexpected websocket address");
    }

    const ws = new WebSocket(`ws://127.0.0.1:${address.port}`);
    cleanup.push(() => ws.close());

    const messages: WSMessage[] = [];
    ws.on("message", (value) => {
      messages.push(JSON.parse(value.toString()) as WSMessage);
    });

    await new Promise<void>((resolve) => {
      ws.on("open", () => resolve());
    });

    await vi.waitFor(() => {
      const batch = messages.find((message) => message.type === "batch");
      expect(batch).toBeDefined();
    });

    collector.addLog(createLog("live", "live message"));
    await vi.waitFor(() => {
      const live = messages.find(
        (message) => message.type === "log" && message.data.id === "live",
      );
      expect(live).toBeDefined();
    });

    ws.send(JSON.stringify({ type: "control", data: { pauseLogs: true } }));
    await vi.waitFor(() => {
      const status = messages.find(
        (message) => message.type === "status" && message.data.pausedLogs,
      );
      expect(status).toBeDefined();
    });

    collector.addLog(createLog("paused", "paused message"));
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(
      messages.some((message) => message.type === "log" && message.data.id === "paused"),
    ).toBe(false);

    const statusCountBeforeResume = messages.filter((message) => message.type === "status").length;
    ws.send(JSON.stringify({ type: "control", data: { pauseLogs: false } }));
    await vi.waitFor(() => {
      const statuses = messages.filter((message) => message.type === "status");
      expect(statuses.length).toBeGreaterThan(statusCountBeforeResume);
      const latest = statuses[statuses.length - 1];
      expect(latest?.data.pausedLogs).toBe(false);
    });

    collector.addLog(createLog("resumed", "resumed message"));
    await vi.waitFor(() => {
      const resumed = messages.find(
        (message) => message.type === "log" && message.data.id === "resumed",
      );
      expect(resumed).toBeDefined();
    });
  });
});
