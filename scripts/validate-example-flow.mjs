import { spawn } from "node:child_process";

const timeoutMs = 30_000;
const requiredMessageFragments = ["[example] demo started", "[example] upstream response"];

async function main() {
  const child = spawn(
    process.execPath,
    ["packages/cli/dist/index.js", "dev", "--", "pnpm", "dev:example"],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: process.env,
    },
  );

  let ws;
  try {
    await waitForHttp("http://127.0.0.1:3000", timeoutMs);
    ws = await connectWithRetry("ws://127.0.0.1:3001", 120, 250);

    const eventsPromise = collectEvents(ws, timeoutMs);
    const response = await fetch("http://127.0.0.1:3000/api/demo", { method: "POST" });
    if (!response.ok) {
      throw new Error(`Demo endpoint failed with status ${response.status}`);
    }

    const seen = await eventsPromise;
    const seenLogs = new Set(seen.logs);
    for (const fragment of requiredMessageFragments) {
      if (![...seenLogs].some((message) => message.includes(fragment))) {
        throw new Error(`Did not observe expected log fragment: ${fragment}`);
      }
    }

    if (!seen.network) {
      throw new Error("Did not observe network event over WebSocket stream");
    }

    console.log("[validate-example] pass");
  } finally {
    ws?.close();
    shutdown(child);
  }
}

function collectEvents(ws, timeout) {
  return new Promise((resolve, reject) => {
    const logs = [];
    let network = false;

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for example log/network events"));
    }, timeout);

    const onMessage = (event) => {
      try {
        const payload = JSON.parse(event.data.toString());
        if (payload.type === "log" && typeof payload.data?.message === "string") {
          logs.push(payload.data.message);
        }
        if (payload.type === "network") {
          network = true;
        }

        const hasAllLogs = requiredMessageFragments.every((fragment) =>
          logs.some((message) => message.includes(fragment)),
        );

        if (hasAllLogs && network) {
          cleanup();
          resolve({ logs, network });
        }
      } catch {
        // ignore malformed events
      }
    };

    const onError = () => {
      cleanup();
      reject(new Error("WebSocket error while validating example flow"));
    };

    const cleanup = () => {
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("error", onError);
    };

    ws.addEventListener("message", onMessage);
    ws.addEventListener("error", onError);
  });
}

function connectWithRetry(url, attempts, delayMs) {
  return new Promise((resolve, reject) => {
    let count = 0;

    const tryConnect = () => {
      count += 1;
      const ws = new WebSocket(url);
      let settled = false;

      ws.addEventListener("open", () => {
        settled = true;
        resolve(ws);
      });

      ws.addEventListener("error", () => {
        if (settled) {
          return;
        }
        settled = true;
        ws.close();
        if (count >= attempts) {
          reject(new Error(`Could not connect to ${url}`));
          return;
        }
        setTimeout(tryConnect, delayMs);
      });
    };

    tryConnect();
  });
}

async function waitForHttp(url, timeout) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        return;
      }
    } catch {
      // keep retrying until timeout
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for HTTP server at ${url}`);
}

function shutdown(child) {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error("[validate-example] fail", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
