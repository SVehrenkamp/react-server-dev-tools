# Using Server DevTools in Any Next.js Project

This guide shows how to use Server DevTools with:

- Standard `next dev` scripts
- Next.js App Router `instrumentation.ts`
- Custom wrapper scripts (for example `web start` -> `web/scripts/dev-server.ts`)

## Prerequisites

- Node.js 18+
- Next.js 14+ App Router
- Development mode only (`NODE_ENV=development`)

## Install

```bash
npm install --save-dev server-devtools
```

## Quick Recipes

### npm

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:debug": "server-devtools dev -- npm run dev"
  }
}
```

Run:

```bash
npm run dev:debug
```

### pnpm

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:debug": "server-devtools dev -- pnpm dev"
  }
}
```

Run:

```bash
pnpm dev:debug
```

### yarn

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:debug": "server-devtools dev -- yarn dev"
  }
}
```

Run:

```bash
yarn dev:debug
```

### Monorepo package (pnpm workspace)

If your Next.js app is in `apps/web`:

```json
{
  "scripts": {
    "dev:web": "pnpm --filter web dev",
    "dev:web:debug": "server-devtools dev -- pnpm --filter web dev"
  }
}
```

### Turborepo

If your repo normally starts web with turbo:

```json
{
  "scripts": {
    "dev:web": "turbo run dev --filter=web",
    "dev:web:debug": "server-devtools dev -- turbo run dev --filter=web"
  }
}
```

### Custom wrapper command

```json
{
  "scripts": {
    "web:start": "tsx web/scripts/dev-server.ts",
    "web:start:debug": "server-devtools dev -- npm run web:start"
  }
}
```

## Fastest Setup (Recommended)

Add a debug script that wraps your normal dev command.

### If your app already uses `next dev`

```json
{
  "scripts": {
    "dev": "next dev",
    "dev:debug": "server-devtools dev -- next dev"
  }
}
```

Run:

```bash
npm run dev:debug
```

- Next app runs as usual
- DevTools UI runs on `http://127.0.0.1:3002`
- WS bridge listens on `ws://127.0.0.1:3001`

## Programmatic Setup via `instrumentation.ts`

If you prefer explicit wiring in the app:

```ts
// instrumentation.ts
import { initServerDevTools } from "@server-devtools/instrumentation";

export async function register() {
  if (process.env.NODE_ENV !== "production") {
    initServerDevTools({
      wsHost: "127.0.0.1",
      wsPort: 3001,
      maxLogs: 10_000,
      maxRequests: 5_000,
    });
  }
}
```

Then run your app normally (`next dev`) and open the UI.

## Custom Wrapper Scripts (`web start` style)

This is supported.

Example: your project has `web start` that runs `web/scripts/dev-server.ts`, performs custom logic/env setup, then starts Next.

### Package scripts

```json
{
  "scripts": {
    "web:start": "tsx web/scripts/dev-server.ts",
    "web:start:debug": "server-devtools dev -- npm run web:start"
  }
}
```

Run:

```bash
npm run web:start:debug
```

### Why this works

`server-devtools dev -- <your command>` injects instrumentation through `NODE_OPTIONS=--require @server-devtools/instrumentation/register` before your wrapper script executes. So your wrapper can:

- Set env vars
- Run business logic
- Call into libraries that eventually start `next dev`

and Server DevTools remains active in that process.

### Verified wrapper scenario

This repo includes a real compatibility check that simulates a custom wrapper script doing internal logic before calling a Next-like dev function.

Run:

```bash
pnpm test:custom-wrapper
```

Expected output includes:

```text
[custom-wrapper-test] pass
```

### Important for child processes

If your wrapper spawns child processes, make sure it keeps `NODE_OPTIONS` in child env.

```ts
import { spawn } from "node:child_process";

spawn("next", ["dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
    // keep NODE_OPTIONS so instrumentation preload survives
    NODE_OPTIONS: process.env.NODE_OPTIONS,
  },
});
```

If your wrapper overwrites env without forwarding `NODE_OPTIONS`, preload-based instrumentation will be lost in that child process.

## Optional Environment Variables

When using preload registration (`server-devtools dev -- ...`), you can override host/port via env vars:

- `SERVER_DEVTOOLS_WS_HOST`
- `SERVER_DEVTOOLS_WS_PORT`

Example:

```bash
SERVER_DEVTOOLS_WS_PORT=3101 server-devtools dev -- npm run web:start
```

## Runtime Controls in UI

In Settings, you can change at runtime:

- Request body capture on/off
- Response body capture on/off
- Body truncation size
- Header redaction list (comma-separated)

These are sent live to the server runtime via WebSocket control messages.

## Troubleshooting

- No logs showing:
  - Confirm app is running in development mode
  - Check UI connection indicator
  - Confirm `ws://127.0.0.1:3001` reachable
- Port conflicts:
  - Change `wsPort` in `initServerDevTools(...)`
  - Point UI settings `WebSocket URL` to that port
- Wrapper script works without debug but not with debug:
  - Verify wrapper does not clear `NODE_OPTIONS`
  - Verify wrapper child processes inherit env

## Security Notes

- Server socket binds to localhost only (`127.0.0.1`)
- Intended for local development only
- Avoid production usage
