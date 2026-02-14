import { describe, expect, it } from "vitest";

import { initConsoleInterceptor } from "../src/console-interceptor";
import { DataCollector } from "../src/data-collector";

describe("console interceptor", () => {
  it("captures logs while preserving behavior", () => {
    const collector = new DataCollector({ maxLogs: 10, maxRequests: 10 });
    const restore = initConsoleInterceptor(collector);

    console.info("hello", { id: 1 });

    restore();

    const logs = collector.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.level).toBe("info");
    expect(logs[0]?.message).toContain("hello");
  });
});
