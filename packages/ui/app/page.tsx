"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import clsx from "clsx";
import { useEffect, useMemo, useRef, useState } from "react";

import { filterLogs, filterNetwork, useAppStore } from "@/lib/store";
import type { SettingsState } from "@/lib/store";
import type { LogEntry, NetworkRequest } from "@/lib/types";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useDevToolsSocket } from "@/lib/use-websocket";

const methods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "UNKNOWN"] as const;

export default function HomePage(): JSX.Element {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const { send } = useDevToolsSocket(settings.wsUrl);

  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const connected = useAppStore((s) => s.connected);

  const pauseLogs = useAppStore((s) => s.pauseLogs);
  const setPauseLogs = useAppStore((s) => s.setPauseLogs);
  const pauseNetwork = useAppStore((s) => s.pauseNetwork);
  const setPauseNetwork = useAppStore((s) => s.setPauseNetwork);

  const logs = useAppStore((s) => s.logs);
  const requests = useAppStore((s) => s.requests);
  const filters = useAppStore((s) => s.filters);

  useEffect(() => {
    if (settings.theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.dataset.theme = prefersDark ? "dark" : "light";
      return;
    }

    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const visibleLogs = useMemo(() => filterLogs(logs, filters), [logs, filters]);
  const visibleRequests = useMemo(() => filterNetwork(requests, filters), [requests, filters]);

  return (
    <main className="mx-auto flex h-screen max-w-[1400px] flex-col p-3 text-sm text-text">
      <header className="mb-3 flex items-center justify-between rounded-xl border border-border bg-panel/80 px-4 py-3">
        <div>
          <h1 className="font-mono text-lg">Server DevTools</h1>
          <p className="text-xs text-muted">Next.js server console and network activity</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx("h-2 w-2 rounded-full", connected ? "bg-emerald-400" : "bg-rose-400")} />
          <span className="text-xs text-muted">{connected ? "Connected" : "Disconnected"}</span>
        </div>
      </header>

      <div className="mb-3 flex gap-2">
        {(["console", "network", "settings"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={clsx(
              "rounded-md border px-3 py-1.5 capitalize",
              activeTab === tab ? "border-sky-400 bg-sky-500/20" : "border-border bg-panel",
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "console" ? (
        <ConsolePanel
          logs={visibleLogs}
          pause={pauseLogs}
          onPauseChange={(value) => {
            setPauseLogs(value);
            send({ type: "control", data: { pauseLogs: value } });
          }}
          onClear={() => send({ type: "clear", target: "logs" })}
        />
      ) : null}

      {activeTab === "network" ? (
        <NetworkPanel
          requests={visibleRequests}
          pause={pauseNetwork}
          onPauseChange={(value) => {
            setPauseNetwork(value);
            send({ type: "control", data: { pauseNetwork: value } });
          }}
          onClear={() => send({ type: "clear", target: "network" })}
        />
      ) : null}

      {activeTab === "settings" ? (
        <SettingsPanel
          settings={settings}
          setSettings={setSettings}
          onRuntimeUpdate={(patch) => send({ type: "control", data: patch })}
        />
      ) : null}
    </main>
  );
}

function ConsolePanel({
  logs,
  pause,
  onPauseChange,
  onClear,
}: {
  logs: LogEntry[];
  pause: boolean;
  onPauseChange: (value: boolean) => void;
  onClear: () => void;
}): JSX.Element {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const selectedLogId = useAppStore((s) => s.selectedLogId);
  const selectLog = useAppStore((s) => s.selectLog);
  const [queryInput, setQueryInput] = useState(filters.logQuery);
  const debouncedQuery = useDebouncedValue(queryInput, 300);

  useEffect(() => {
    setQueryInput(filters.logQuery);
  }, [filters.logQuery]);

  useEffect(() => {
    setFilters((f) => ({ ...f, logQuery: debouncedQuery }));
  }, [debouncedQuery, setFilters]);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: logs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 30,
    overscan: 12,
  });

  const selectedLog = logs.find((item) => item.id === selectedLogId) ?? logs[logs.length - 1];

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-panel/80">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <input
          placeholder="Search logs..."
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          className="min-w-56 rounded border border-border bg-bg px-2 py-1"
        />
        <select
          value={filters.logTimeRange}
          onChange={(event) =>
            setFilters((f) => ({
              ...f,
              logTimeRange: event.target.value as "all" | "5m" | "15m" | "1h",
            }))
          }
          className="rounded border border-border bg-bg px-2 py-1"
        >
          <option value="all">All time</option>
          <option value="5m">Last 5m</option>
          <option value="15m">Last 15m</option>
          <option value="1h">Last 1h</option>
        </select>
        {(["log", "info", "warn", "error", "debug"] as const).map((level) => {
          const checked = filters.logLevels.includes(level);
          return (
            <label key={level} className="flex items-center gap-1 text-xs text-muted">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  setFilters((f) => ({
                    ...f,
                    logLevels: event.target.checked
                      ? Array.from(new Set([...f.logLevels, level]))
                      : f.logLevels.filter((item) => item !== level),
                  }))
                }
              />
              {level}
            </label>
          );
        })}
        <label className="flex items-center gap-1 text-xs text-muted">
          <input
            type="checkbox"
            checked={filters.collapseLogs}
            onChange={(event) => setFilters((f) => ({ ...f, collapseLogs: event.target.checked }))}
          />
          Collapse identical
        </label>
        <button className="rounded border border-border px-2 py-1" onClick={onClear}>
          Clear
        </button>
        <button
          className="rounded border border-border px-2 py-1"
          onClick={() => onPauseChange(!pause)}
        >
          {pause ? "Resume" : "Pause"}
        </button>
      </div>
      <div ref={parentRef} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        {logs.length === 0 ? (
          <div className="p-4 text-muted">No logs yet.</div>
        ) : (
          <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((item) => {
              const log = logs[item.index];
              if (!log) return null;
              const active = selectedLog?.id === log.id;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectLog(log.id)}
                  className={clsx(
                    "absolute left-0 top-0 flex w-full gap-3 border-b border-border/40 px-3 py-1 text-left",
                    active ? "bg-sky-500/10" : "hover:bg-white/5",
                  )}
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <span className="w-24 text-muted">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  <span className={levelClass(log.level)}>[{log.level.toUpperCase()}]</span>
                  <span className="flex-1 truncate">{log.message}</span>
                  <CopyButton value={log.message} />
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        {!selectedLog ? (
          <div className="text-xs text-muted">Select a log entry for details.</div>
        ) : (
          <div className="space-y-2 font-mono text-xs">
            <DetailBlock title="Message" value={selectedLog.message} />
            <DetailBlock title="Arguments" value={JSON.stringify(selectedLog.args, null, 2)} />
            {selectedLog.stack ? <DetailBlock title="Stack" value={selectedLog.stack} /> : null}
          </div>
        )}
      </div>
    </section>
  );
}

function NetworkPanel({
  requests,
  pause,
  onPauseChange,
  onClear,
}: {
  requests: NetworkRequest[];
  pause: boolean;
  onPauseChange: (value: boolean) => void;
  onClear: () => void;
}): JSX.Element {
  const filters = useAppStore((s) => s.filters);
  const setFilters = useAppStore((s) => s.setFilters);
  const [queryInput, setQueryInput] = useState(filters.networkQuery);
  const debouncedQuery = useDebouncedValue(queryInput, 300);

  useEffect(() => {
    setQueryInput(filters.networkQuery);
  }, [filters.networkQuery]);

  useEffect(() => {
    setFilters((f) => ({ ...f, networkQuery: debouncedQuery }));
  }, [debouncedQuery, setFilters]);
  const selectedRequestId = useAppStore((s) => s.selectedRequestId);
  const selectRequest = useAppStore((s) => s.selectRequest);

  const selected = requests.find((req) => req.id === selectedRequestId) ?? requests[requests.length - 1];

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: requests.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 12,
  });

  return (
    <section className="grid min-h-0 flex-1 grid-cols-1 gap-2 rounded-xl border border-border bg-panel/80 lg:grid-cols-[1.6fr_1fr]">
      <div className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <input
            placeholder="Search URLs..."
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            className="min-w-56 rounded border border-border bg-bg px-2 py-1"
          />
          <select
            value={filters.networkStatus}
            onChange={(event) =>
              setFilters((f) => ({
                ...f,
                networkStatus: event.target.value as "all" | "2xx" | "3xx" | "4xx" | "5xx",
              }))
            }
            className="rounded border border-border bg-bg px-2 py-1"
          >
            <option value="all">All status</option>
            <option value="2xx">2xx</option>
            <option value="3xx">3xx</option>
            <option value="4xx">4xx</option>
            <option value="5xx">5xx</option>
          </select>
          <input
            type="number"
            min={0}
            value={filters.networkMinLatency}
            onChange={(event) =>
              setFilters((f) => ({
                ...f,
                networkMinLatency: Number.parseInt(event.target.value || "0", 10),
              }))
            }
            className="w-28 rounded border border-border bg-bg px-2 py-1"
          />
          <button className="rounded border border-border px-2 py-1" onClick={onClear}>
            Clear
          </button>
          <button
            className="rounded border border-border px-2 py-1"
            onClick={() => onPauseChange(!pause)}
          >
            {pause ? "Resume" : "Pause"}
          </button>
        </div>

        <div className="flex gap-2 px-3 pb-2 pt-1 text-xs">
          {methods.map((method) => {
            const checked = filters.networkMethods.includes(method);
            return (
              <label key={method} className="flex items-center gap-1 text-muted">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    setFilters((f) => ({
                      ...f,
                      networkMethods: event.target.checked
                        ? Array.from(new Set([...f.networkMethods, method]))
                        : f.networkMethods.filter((item) => item !== method),
                    }))
                  }
                />
                {method}
              </label>
            );
          })}
        </div>

        <div ref={parentRef} className="min-h-0 flex-1 overflow-auto text-xs">
          {requests.length === 0 ? (
            <div className="p-4 text-muted">No network requests yet.</div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((item) => {
                const req = requests[item.index];
                if (!req) return null;
                const active = req.id === selected?.id;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => selectRequest(req.id)}
                    className={clsx(
                      "absolute left-0 top-0 grid w-full grid-cols-[70px_1fr_60px_60px] gap-2 border-b border-border/40 px-3 py-2 text-left",
                      active ? "bg-sky-500/10" : "hover:bg-white/5",
                    )}
                    style={{ transform: `translateY(${item.start}px)` }}
                  >
                    <span className="font-mono text-sky-300">{req.method}</span>
                    <span className="truncate">{req.url}</span>
                    <span className={statusClass(req.status)}>{req.status || "ERR"}</span>
                    <span>{req.duration}ms</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside className="min-h-0 overflow-auto p-3">
        {!selected ? (
          <p className="text-muted">Select a request to inspect details.</p>
        ) : (
          <div className="space-y-3 font-mono text-xs">
            <div className="rounded border border-border p-2">
              <div className="mb-1 font-semibold">Overview</div>
              <div className="text-muted">{selected.method}</div>
              <div className="break-all">{selected.url}</div>
              <div className={statusClass(selected.status)}>{selected.status || "ERR"}</div>
              <div>{selected.duration}ms</div>
            </div>

            <DetailBlock title="Request Headers" value={JSON.stringify(selected.requestHeaders, null, 2)} />
            <DetailBlock title="Request Body" value={selected.requestBody ?? "[none]"} />
            <DetailBlock title="Response Headers" value={JSON.stringify(selected.responseHeaders, null, 2)} />
            <DetailBlock title="Response Body" value={selected.responseBody ?? "[none]"} />
            <DetailBlock
              title="Timing"
              value={JSON.stringify(
                {
                  start: new Date(selected.timing.start).toISOString(),
                  end: new Date(selected.timing.end).toISOString(),
                  duration: selected.duration,
                },
                null,
                2,
              )}
            />
          </div>
        )}
      </aside>
    </section>
  );
}

function SettingsPanel({
  settings,
  setSettings,
  onRuntimeUpdate,
}: {
  settings: SettingsState;
  setSettings: (updater: (value: SettingsState) => SettingsState) => void;
  onRuntimeUpdate: (patch: {
    truncateBodyBytes?: number;
    captureRequestBodies?: boolean;
    captureResponseBodies?: boolean;
    redactHeaders?: string[];
  }) => void;
}): JSX.Element {
  const updateHeaders = (value: string) => {
    const redactHeaders = value
      .split(",")
      .map((header) => header.trim().toLowerCase())
      .filter((header) => header.length > 0);
    onRuntimeUpdate({ redactHeaders });
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-panel/80 p-4">
      <h2 className="mb-3 font-mono text-base">Settings</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-border p-3">
          <div className="mb-1 font-medium">Connection</div>
          <label className="mb-2 block text-xs text-muted">WebSocket URL</label>
          <input
            value={settings.wsUrl}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                wsUrl: event.target.value,
              }))
            }
            className="w-full rounded border border-border bg-bg px-2 py-1 text-xs"
          />
          <p className="text-xs text-muted">UI port: 3002</p>
        </div>
        <div className="rounded border border-border p-3">
          <div className="mb-1 font-medium">Appearance</div>
          <label className="mb-2 block text-xs text-muted">Theme</label>
          <select
            value={settings.theme}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                theme: event.target.value as "dark" | "light" | "system",
              }))
            }
            className="w-full rounded border border-border bg-bg px-2 py-1 text-xs"
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </div>
        <div className="rounded border border-border p-3">
          <div className="mb-1 font-medium">Capture Options</div>
          <label className="mb-2 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={settings.captureRequestBodies}
              onChange={(event) => {
                const value = event.target.checked;
                setSettings((current) => ({ ...current, captureRequestBodies: value }));
                onRuntimeUpdate({ captureRequestBodies: value });
              }}
            />
            Capture request bodies
          </label>
          <label className="mb-2 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={settings.captureResponseBodies}
              onChange={(event) => {
                const value = event.target.checked;
                setSettings((current) => ({ ...current, captureResponseBodies: value }));
                onRuntimeUpdate({ captureResponseBodies: value });
              }}
            />
            Capture response bodies
          </label>
          <label className="mb-1 block text-xs text-muted">Body truncation bytes</label>
          <input
            type="number"
            min={1000}
            value={settings.truncateBodyBytes}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value || "1000", 10);
              setSettings((current) => ({ ...current, truncateBodyBytes: value }));
              onRuntimeUpdate({ truncateBodyBytes: value });
            }}
            className="w-full rounded border border-border bg-bg px-2 py-1 text-xs"
          />
        </div>
        <div className="rounded border border-border p-3">
          <div className="mb-1 font-medium">Header Redaction</div>
          <label className="mb-1 block text-xs text-muted">Comma-separated header names</label>
          <input
            value={settings.redactHeaders}
            onChange={(event) => {
              const value = event.target.value;
              setSettings((current) => ({ ...current, redactHeaders: value }));
              updateHeaders(value);
            }}
            className="w-full rounded border border-border bg-bg px-2 py-1 text-xs"
          />
          <p className="mt-2 text-xs text-muted">Persisted locally and applied to server capture immediately.</p>
        </div>
      </div>
    </section>
  );
}

function DetailBlock({ title, value }: { title: string; value: string }): JSX.Element {
  return (
    <div className="rounded border border-border p-2">
      <div className="mb-1 font-semibold">{title}</div>
      <pre className="overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5">{value}</pre>
      <CopyButton value={value} />
    </div>
  );
}

function CopyButton({ value }: { value: string }): JSX.Element {
  return (
    <button
      type="button"
      className="ml-auto rounded border border-border px-1.5 py-0.5 text-[10px] text-muted hover:text-text"
      onClick={() => navigator.clipboard.writeText(value)}
    >
      Copy
    </button>
  );
}

function levelClass(level: LogEntry["level"]): string {
  if (level === "error") return "w-16 text-rose-300";
  if (level === "warn") return "w-16 text-amber-300";
  if (level === "info") return "w-16 text-cyan-300";
  if (level === "debug") return "w-16 text-violet-300";
  return "w-16 text-emerald-300";
}

function statusClass(status: number): string {
  if (status >= 500) return "text-rose-300";
  if (status >= 400) return "text-amber-300";
  if (status >= 300) return "text-sky-300";
  if (status >= 200) return "text-emerald-300";
  return "text-muted";
}
