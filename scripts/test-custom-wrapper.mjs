import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const wsPort = 3900 + Math.floor(Math.random() * 200);
const marker = `custom-wrapper-marker-${Date.now()}`;
const timeoutMs = 20_000;

const registerPath = path.resolve("packages/instrumentation/dist/register.cjs");
const scriptPath = path.resolve("scripts/fixtures/custom-wrapper/dev-server.mjs");

const nodeOptions = `${process.env.NODE_OPTIONS ?? ""} --require ${registerPath}`.trim();

const child = spawn(process.execPath, [scriptPath], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    CUSTOM_WRAPPER_MARKER: marker,
    SERVER_DEVTOOLS_WS_PORT: String(wsPort),
  },
});

const ws = await connectWithRetry(`ws://127.0.0.1:${wsPort}`, 50, 100);

try {
  const observed = await waitForMarker(ws, marker, timeoutMs);
  if (!observed) {
    throw new Error("Did not observe custom wrapper marker in websocket log stream");
  }
  console.log("[custom-wrapper-test] pass");
} finally {
  ws.close();
  child.kill("SIGTERM");
}

function connectWithRetry(url, attempts, delayMs) {
  return new Promise((resolve, reject) => {
    let count = 0;

    const tryConnect = () => {
      count += 1;
      const ws = new WebSocket(url);
      let settled = false;

      ws.onopen = () => {
        settled = true;
        resolve(ws);
      };
      ws.onerror = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (count >= attempts) {
          reject(new Error(`Could not connect to ${url}`));
          return;
        }
        setTimeout(tryConnect, delayMs);
      };
    };

    tryConnect();
  });
}

function waitForMarker(ws, markerValue, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(false), timeout);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data.toString());
        if (payload.type === "batch") {
          const found = payload.data.logs.some(
            (entry) => typeof entry.message === "string" && entry.message.includes(markerValue),
          );
          if (found) {
            clearTimeout(timer);
            resolve(true);
            return;
          }
        }

        if (payload.type === "log" && typeof payload.data?.message === "string") {
          if (payload.data.message.includes(markerValue)) {
            clearTimeout(timer);
            resolve(true);
          }
        }
      } catch {
        // ignore malformed payloads
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("WebSocket error while waiting for custom wrapper marker"));
    };
  });
}
