"use client";

import { useEffect } from "react";
import { useRef } from "react";

import { useAppStore } from "./store";
import type { WSMessage } from "./types";

const MAX_BACKOFF = 30_000;

export function useDevToolsSocket(url: string): { send: (message: WSMessage) => void } {
  const setConnected = useAppStore((s) => s.setConnected);
  const setBatch = useAppStore((s) => s.setBatch);
  const addLog = useAppStore((s) => s.addLog);
  const addRequest = useAppStore((s) => s.addRequest);
  const clearLogs = useAppStore((s) => s.clearLogs);
  const clearNetwork = useAppStore((s) => s.clearNetwork);
  const setStatus = useAppStore((s) => s.setStatus);
  const applyRuntimeConfig = useAppStore((s) => s.applyRuntimeConfig);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let retryMs = 2000;
    let reconnectTimer: number | null = null;
    let active = true;

    const connect = () => {
      if (!active) {
        return;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        retryMs = 2000;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          switch (message.type) {
            case "batch":
              setBatch(message.data.logs, message.data.requests);
              break;
            case "log":
              addLog(message.data);
              break;
            case "network":
              addRequest(message.data);
              break;
            case "clear":
              if (message.target === "logs" || message.target === "all") {
                clearLogs();
              }
              if (message.target === "network" || message.target === "all") {
                clearNetwork();
              }
              break;
            case "status":
              setStatus(message.data);
              break;
            case "config":
              applyRuntimeConfig(message.data);
              break;
          }
        } catch {
          // ignore malformed websocket payloads
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setConnected(false);
        if (!active) {
          return;
        }
        reconnectTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, MAX_BACKOFF);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      wsRef.current?.close();
    };
  }, [url, addLog, addRequest, applyRuntimeConfig, clearLogs, clearNetwork, setBatch, setConnected, setStatus]);

  return {
    send: (message) => {
      const socket = wsRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
  };
}
