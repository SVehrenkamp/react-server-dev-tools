"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { LogEntry, LogLevel, NetworkRequest } from "./types";

export type TimeRange = "all" | "5m" | "15m" | "1h";
export type StatusRange = "all" | "2xx" | "3xx" | "4xx" | "5xx";

interface FiltersState {
  logQuery: string;
  logLevels: LogLevel[];
  logTimeRange: TimeRange;
  collapseLogs: boolean;
  networkQuery: string;
  networkMethods: string[];
  networkStatus: StatusRange;
  networkMinLatency: number;
}

export interface SettingsState {
  wsUrl: string;
  theme: "dark" | "light" | "system";
  captureRequestBodies: boolean;
  captureResponseBodies: boolean;
  truncateBodyBytes: number;
  redactHeaders: string;
}

interface AppState {
  connected: boolean;
  logs: LogEntry[];
  requests: NetworkRequest[];
  pauseLogs: boolean;
  pauseNetwork: boolean;
  selectedRequestId?: string | undefined;
  selectedLogId?: string | undefined;
  activeTab: "console" | "network" | "settings";
  filters: FiltersState;
  settings: SettingsState;
  setConnected: (connected: boolean) => void;
  setBatch: (logs: LogEntry[], requests: NetworkRequest[]) => void;
  addLog: (log: LogEntry) => void;
  addRequest: (request: NetworkRequest) => void;
  clearLogs: () => void;
  clearNetwork: () => void;
  setPauseLogs: (pause: boolean) => void;
  setPauseNetwork: (pause: boolean) => void;
  setStatus: (status: { pausedLogs: boolean; pausedNetwork: boolean }) => void;
  setActiveTab: (tab: AppState["activeTab"]) => void;
  selectRequest: (id: string | undefined) => void;
  selectLog: (id: string | undefined) => void;
  setFilters: (updater: (value: FiltersState) => FiltersState) => void;
  setSettings: (updater: (value: SettingsState) => SettingsState) => void;
  applyRuntimeConfig: (data: {
    captureRequestBodies: boolean;
    captureResponseBodies: boolean;
    truncateBodyBytes: number;
    redactHeaders: string[];
  }) => void;
}

const defaultFilters: FiltersState = {
  logQuery: "",
  logLevels: ["log", "info", "warn", "error", "debug"],
  logTimeRange: "all",
  collapseLogs: true,
  networkQuery: "",
  networkMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "UNKNOWN"],
  networkStatus: "all",
  networkMinLatency: 0,
};

const defaultSettings: SettingsState = {
  wsUrl: "ws://127.0.0.1:3001",
  theme: "dark",
  captureRequestBodies: true,
  captureResponseBodies: true,
  truncateBodyBytes: 1_000_000,
  redactHeaders: "authorization,cookie,set-cookie",
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      connected: false,
      logs: [],
      requests: [],
      pauseLogs: false,
      pauseNetwork: false,
      activeTab: "console",
      filters: defaultFilters,
      settings: defaultSettings,
      setConnected: (connected) => set({ connected }),
      setBatch: (logs, requests) => set({ logs, requests }),
      addLog: (log) =>
        set((state) =>
          state.pauseLogs ? state : { logs: [...state.logs, log] },
        ),
      addRequest: (request) =>
        set((state) =>
          state.pauseNetwork ? state : { requests: [...state.requests, request] },
        ),
      clearLogs: () => set({ logs: [], selectedLogId: undefined }),
      clearNetwork: () => set({ requests: [], selectedRequestId: undefined }),
      setPauseLogs: (pauseLogs) => set({ pauseLogs }),
      setPauseNetwork: (pauseNetwork) => set({ pauseNetwork }),
      setStatus: (status) =>
        set({
          pauseLogs: status.pausedLogs,
          pauseNetwork: status.pausedNetwork,
        }),
      setActiveTab: (activeTab) => set({ activeTab }),
      selectRequest: (selectedRequestId) => set({ selectedRequestId }),
      selectLog: (selectedLogId) => set({ selectedLogId }),
      setFilters: (updater) => set((state) => ({ filters: updater(state.filters) })),
      setSettings: (updater) => set((state) => ({ settings: updater(state.settings) })),
      applyRuntimeConfig: (data) =>
        set((state) => ({
          settings: {
            ...state.settings,
            captureRequestBodies: data.captureRequestBodies,
            captureResponseBodies: data.captureResponseBodies,
            truncateBodyBytes: data.truncateBodyBytes,
            redactHeaders: data.redactHeaders.join(","),
          },
        })),
    }),
    {
      name: "server-devtools-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeTab: state.activeTab,
        filters: state.filters,
        settings: state.settings,
      }),
    },
  ),
);

export function filterLogs(logs: LogEntry[], filters: FiltersState): LogEntry[] {
  const minTimestamp =
    filters.logTimeRange === "all"
      ? 0
      : Date.now() -
        (filters.logTimeRange === "5m"
          ? 5 * 60_000
          : filters.logTimeRange === "15m"
            ? 15 * 60_000
            : 60 * 60_000);

  const query = filters.logQuery.toLowerCase().trim();
  const filtered = logs.filter((log) => {
    if (!filters.logLevels.includes(log.level)) {
      return false;
    }
    if (log.timestamp < minTimestamp) {
      return false;
    }
    if (query && !log.message.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  if (!filters.collapseLogs) {
    return filtered;
  }

  const collapsed: LogEntry[] = [];
  for (const log of filtered) {
    const prev = collapsed[collapsed.length - 1];
    if (prev && prev.hash === log.hash) {
      prev.message = `${log.message} (x${countCollapsed(prev.message) + 1})`;
      continue;
    }
    collapsed.push({ ...log });
  }
  return collapsed;
}

function countCollapsed(message: string): number {
  const match = /\(x(\d+)\)$/.exec(message);
  if (!match || !match[1]) {
    return 1;
  }

  return Number.parseInt(match[1], 10);
}

export function filterNetwork(
  requests: NetworkRequest[],
  filters: FiltersState,
): NetworkRequest[] {
  const query = filters.networkQuery.toLowerCase().trim();

  return requests.filter((request) => {
    if (!filters.networkMethods.includes(request.method)) {
      return false;
    }
    if (query && !request.url.toLowerCase().includes(query)) {
      return false;
    }
    if (request.duration < filters.networkMinLatency) {
      return false;
    }
    if (filters.networkStatus === "all") {
      return true;
    }

    if (filters.networkStatus === "2xx") return request.status >= 200 && request.status < 300;
    if (filters.networkStatus === "3xx") return request.status >= 300 && request.status < 400;
    if (filters.networkStatus === "4xx") return request.status >= 400 && request.status < 500;
    return request.status >= 500;
  });
}
