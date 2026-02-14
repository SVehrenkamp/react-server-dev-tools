import { EventEmitter } from "node:events";

import { CircularBuffer } from "./circular-buffer";
import type { LogEntry, NetworkRequest } from "./types";

export interface DataCollectorOptions {
  maxLogs: number;
  maxRequests: number;
}

export class DataCollector extends EventEmitter {
  private readonly logs: CircularBuffer<LogEntry>;
  private readonly requests: CircularBuffer<NetworkRequest>;
  private pausedLogs = false;
  private pausedNetwork = false;

  public constructor(options: DataCollectorOptions) {
    super();
    this.logs = new CircularBuffer<LogEntry>(options.maxLogs);
    this.requests = new CircularBuffer<NetworkRequest>(options.maxRequests);
  }

  public addLog(entry: LogEntry): void {
    if (this.pausedLogs) {
      return;
    }

    this.logs.push(entry);
    this.emit("log", entry);
  }

  public addNetwork(entry: NetworkRequest): void {
    if (this.pausedNetwork) {
      return;
    }

    this.requests.push(entry);
    this.emit("network", entry);
  }

  public clear(target: "logs" | "network" | "all"): void {
    if (target === "logs" || target === "all") {
      this.logs.clear();
    }

    if (target === "network" || target === "all") {
      this.requests.clear();
    }

    this.emit("clear", target);
  }

  public getLogs(): LogEntry[] {
    return this.logs.toArray();
  }

  public getRequests(): NetworkRequest[] {
    return this.requests.toArray();
  }

  public setPaused(target: "logs" | "network", paused: boolean): void {
    if (target === "logs") {
      this.pausedLogs = paused;
    } else {
      this.pausedNetwork = paused;
    }

    this.emit("status", this.getStatus());
  }

  public getStatus(): { pausedLogs: boolean; pausedNetwork: boolean } {
    return {
      pausedLogs: this.pausedLogs,
      pausedNetwork: this.pausedNetwork,
    };
  }
}
