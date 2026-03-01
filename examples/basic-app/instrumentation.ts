import { initServerDevTools } from "server-devtools/instrumentation";

export async function register(): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    initServerDevTools({
      wsHost: "127.0.0.1",
      wsPort: 3001,
    });
  }
}
