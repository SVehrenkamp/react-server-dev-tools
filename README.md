# server-devtools

Local Server DevTools for Next.js App Router.

Full usage guide: `docs/using-server-devtools-in-nextjs.md`

## Monorepo Packages

- `packages/instrumentation`: runtime interceptors + collector + WebSocket server
- `packages/ui`: Next.js web interface
- `packages/cli`: `server-devtools` executable

## Quick Start (Monorepo)

```bash
pnpm install
pnpm dev
```

This starts the UI on `http://127.0.0.1:3002`.

## Instrument a Next.js App

```ts
// instrumentation.ts in your Next.js app
import { initServerDevTools } from "@server-devtools/instrumentation";

export function register() {
  if (process.env.NODE_ENV !== "production") {
    initServerDevTools({
      wsHost: "127.0.0.1",
      wsPort: 3001,
    });
  }
}
```

Then run your app and open the UI at `http://127.0.0.1:3002`.

## CLI

```bash
server-devtools dev -- next dev
```

This starts the DevTools UI and launches your command with server instrumentation preloaded via `NODE_OPTIONS`.

Custom wrapper commands are supported too:

```bash
server-devtools dev -- npm run web:start
```

## New in this slice

- Server-side pause/resume controls over WebSocket (`control` + `status` protocol messages)
- Persisted UI settings and filters (localStorage via Zustand persist)
- End-to-end websocket integration test for history, streaming, and pause behavior
- Example app at `examples/basic-app` for quick local validation

## Smoke Check

```bash
pnpm smoke
```

This verifies that instrumentation publishes console logs to WebSocket in a CI-friendly way.

Wrapper compatibility check:

```bash
pnpm test:custom-wrapper
```

This validates preload instrumentation for a custom dev wrapper script flow.
