import { initServerDevTools } from "./index";

if (process.env.NODE_ENV !== "production") {
  const parsedPort = Number.parseInt(process.env.SERVER_DEVTOOLS_WS_PORT ?? "", 10);
  const options: { wsHost?: string; wsPort?: number } = {};

  if (process.env.SERVER_DEVTOOLS_WS_HOST) {
    options.wsHost = process.env.SERVER_DEVTOOLS_WS_HOST;
  }

  if (Number.isFinite(parsedPort)) {
    options.wsPort = parsedPort;
  }

  initServerDevTools(options);
}
