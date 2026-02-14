import { initServerDevTools } from "../packages/instrumentation/dist/index.js";

const marker = `[smoke] ${Date.now()}`;
const port = 3901;
const timeoutMs = 8_000;

async function run() {
  const runtime = initServerDevTools({
    wsHost: "127.0.0.1",
    wsPort: port,
  });

  const ws = new WebSocket(`ws://127.0.0.1:${port}`);

  try {
    await waitForOpen(ws, timeoutMs);

    const received = await waitForMarker(ws, marker, timeoutMs);
    if (!received) {
      throw new Error("Did not observe smoke marker in websocket stream");
    }

    console.log("[smoke] pass");
  } finally {
    ws.close();
    runtime.shutdown();
  }
}

function waitForOpen(ws, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), timeout);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("WebSocket failed to open"));
    };
  });
}

function waitForMarker(ws, value, timeout) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(false), timeout);

    ws.onmessage = (event) => {
      let parsed;
      try {
        parsed = JSON.parse(event.data.toString());
      } catch {
        return;
      }

      if (parsed.type === "batch") {
        console.log(marker);
      }

      if (parsed.type === "log" && typeof parsed.data?.message === "string" && parsed.data.message.includes(value)) {
        clearTimeout(timer);
        resolve(true);
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error("WebSocket error during smoke flow"));
    };
  });
}

run().catch((error) => {
  console.error("[smoke] fail", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
