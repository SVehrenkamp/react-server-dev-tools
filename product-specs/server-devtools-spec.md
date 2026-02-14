# Server DevTools - Product Specification & Implementation Guide

## Executive Summary

Build a local web-based debugging interface for Next.js App Router applications that provides a Chrome DevTools-like experience for viewing server-side console logs and monitoring Node.js server network activity.

**Target Users**: Developers working with Next.js 14+ App Router and React Server Components  
**Deployment**: Local-only web application (localhost)  
**Tech Stack**: Next.js, React, TypeScript, Tailwind CSS, WebSocket  
**Timeline**: 4-6 weeks to production-ready v1

---

## Problem Statement

Next.js App Router and React Server Components have shifted significant work server-side, but the debugging experience is poor:
- Server console is cluttered with warnings and logs from multiple teams
- No easy way to filter, search, or organize server logs
- No visibility into server-side network requests (API calls, database queries)
- Developers waste time scrolling through noisy terminal output

---

## Product Goals

### Primary Goals
1. **Clean Console Interface**: Provide filterable, searchable, collapsible log viewing
2. **Network Visibility**: Show chronological server-side network requests with timing data
3. **Zero Setup Friction**: Install and run in under 5 minutes
4. **Minimal Performance Impact**: <5% overhead on Next.js dev server

### Non-Goals (v1)
- Production monitoring/hosting
- Multi-project workspace support
- Performance profiling (CPU/memory)
- Database query analysis (unless via network requests)
- Distributed tracing

---

## Core Features

### Feature 1: Console Log Interface

**User Story**: As a developer, I want to view and filter server-side logs so I can quickly find relevant debugging information.

**Requirements**:

**Must Have**:
- Display all server-side `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug` output
- Real-time streaming of new logs as they occur
- Search: Full-text search across all log messages
- Filter by log level (info, warn, error, debug, all)
- Filter by timestamp range (last 5min, 15min, 1hr, custom)
- Clear console button (clears display, not history)
- Pause/Resume button (stops new logs from auto-scrolling)
- Timestamp display with toggle (relative "2s ago" vs absolute "14:23:45")
- Auto-scroll toggle (new logs push to bottom vs stay in place)
- Log message collapsing: Group identical messages with count badge
- Syntax highlighting for JSON objects, arrays, and primitives
- Expandable object inspection (click to expand nested objects)
- Stack trace display for errors with file/line linking
- Color coding by log level:
  - `info`: blue/cyan
  - `warn`: yellow/orange  
  - `error`: red
  - `debug`: gray/purple

**Nice to Have (v2)**:
- Export filtered logs to .txt or .json
- Save filter presets ("My Filters")
- Regular expression search support
- Filter by custom tags (if logs include metadata)

**UI Reference**: Chrome DevTools Console tab

---

### Feature 2: Network Activity Monitor

**User Story**: As a developer, I want to see all server-side network requests so I can debug API calls, track latency, and inspect request/response data.

**Requirements**:

**Must Have**:
- Display chronological list of all server-side HTTP/HTTPS requests
- For each request, show:
  - HTTP Method (GET, POST, PUT, DELETE, PATCH)
  - Full URL
  - Status code (with color coding: 2xx=green, 3xx=blue, 4xx=yellow, 5xx=red)
  - Total latency (ms)
  - Timestamp
- Click request to open details panel showing:
  - Request Headers (key-value table)
  - Request Body (formatted JSON if applicable, raw otherwise)
  - Response Headers (key-value table)
  - Response Body (formatted JSON if applicable, raw otherwise)
  - Timing breakdown: Total duration
- Filter by HTTP method (checkboxes: GET, POST, etc.)
- Filter by status code range (2xx, 3xx, 4xx, 5xx)
- Search by URL (text input with partial matching)
- Filter by minimum latency (show only requests >500ms)
- Clear network log button
- Pause/Resume capture

**Nice to Have (v2)**:
- Export as HAR (HTTP Archive) file
- Copy as cURL command
- Request waterfall visualization
- Timing breakdown (DNS, connection, wait, download if measurable)
- Request diff tool (compare two requests)

**UI Reference**: Chrome DevTools Network tab

---

## Technical Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     User's Next.js App                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Server Runtime (instrumented)                       │   │
│  │  - Console Interceptor                               │   │
│  │  - Fetch Wrapper                                     │   │
│  │  - HTTP Module Wrapper                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓ (capture data)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Data Collector & Buffer                             │   │
│  │  - In-memory circular buffer (last 10k logs/requests)│   │
│  │  - Event emitter for new data                        │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  WebSocket Server (on port 3001 or configurable)     │   │
│  │  - Broadcasts new logs/requests to connected clients │   │
│  │  - Sends historical buffer on initial connection     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            ↓ (WebSocket)
┌─────────────────────────────────────────────────────────────┐
│              Server DevTools UI (Web App)                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Next.js Frontend (port 3002)                        │   │
│  │  - Console Panel                                     │   │
│  │  - Network Panel                                     │   │
│  │  - Settings Panel                                    │   │
│  │  - WebSocket Client (receives real-time data)        │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### 1. Instrumentation Layer (npm package)

**Package Name**: `@server-devtools/instrumentation`

**Responsibilities**:
- Intercept console methods without breaking existing behavior
- Wrap `fetch` API to capture request/response
- Wrap Node.js `http`/`https` modules to capture requests
- Collect metadata (timestamp, stack trace, etc.)
- Emit events to WebSocket server

**Key Files**:
```
packages/instrumentation/
├── src/
│   ├── index.ts              # Main entry point, initialization
│   ├── console-interceptor.ts # Override console methods
│   ├── fetch-interceptor.ts   # Wrap global fetch
│   ├── http-interceptor.ts    # Wrap http/https modules
│   ├── data-collector.ts      # In-memory buffer & event emitter
│   └── websocket-server.ts    # WS server for real-time data
├── package.json
└── tsconfig.json
```

**Implementation Notes**:
- Use `async_hooks` for request context tracking (optional, for advanced features)
- Store last 10,000 logs and 5,000 network requests in circular buffers
- WebSocket server runs on configurable port (default: 3001)
- Graceful degradation: If WebSocket fails, logs still go to stdout

#### 2. Web UI Application (Next.js app)

**Package Name**: `@server-devtools/ui`

**Responsibilities**:
- Display logs and network requests in DevTools-like interface
- Real-time updates via WebSocket client
- Client-side filtering, searching, sorting
- Persist user preferences (filters, theme) in localStorage

**Key Files**:
```
packages/ui/
├── app/
│   ├── layout.tsx             # Root layout, theme provider
│   ├── page.tsx               # Main dashboard with tabs
│   ├── console/
│   │   └── page.tsx           # Console panel
│   ├── network/
│   │   └── page.tsx           # Network panel
│   └── settings/
│       └── page.tsx           # Settings panel
├── components/
│   ├── console/
│   │   ├── LogList.tsx        # Virtualized log list
│   │   ├── LogItem.tsx        # Individual log entry
│   │   ├── LogFilters.tsx     # Filter controls
│   │   └── LogDetails.tsx     # Expandable log details
│   ├── network/
│   │   ├── RequestList.tsx    # Virtualized request list
│   │   ├── RequestItem.tsx    # Individual request row
│   │   ├── RequestDetails.tsx # Details panel (headers, body, etc.)
│   │   └── NetworkFilters.tsx # Filter controls
│   ├── shared/
│   │   ├── SearchBar.tsx      # Reusable search input
│   │   ├── Toolbar.tsx        # Top toolbar with actions
│   │   └── JSONViewer.tsx     # Syntax-highlighted JSON
│   └── WebSocketProvider.tsx  # WebSocket context & connection
├── lib/
│   ├── websocket-client.ts    # WebSocket client logic
│   ├── data-store.ts          # Client-side data management (Zustand)
│   └── utils.ts               # Formatting, parsing helpers
├── package.json
└── tsconfig.json
```

**Implementation Notes**:
- Use **React Virtualized** or **TanStack Virtual** for log/request lists (performance)
- Use **Zustand** or **Jotai** for client state management (logs, requests, filters)
- Use **Tailwind CSS** for styling with dark theme by default
- WebSocket reconnection logic with exponential backoff

#### 3. CLI Wrapper (optional, for easy startup)

**Package Name**: `server-devtools` (main package)

```bash
# Install
npm install --save-dev server-devtools

# Run
npx server-devtools dev
# or
npm run dev:debug  (if added to package.json scripts)
```

**Responsibilities**:
- Start instrumentation + UI with single command
- Inject instrumentation into Next.js dev server
- Open browser automatically to UI

---

## Data Models

### Log Entry
```typescript
interface LogEntry {
  id: string;              // UUID
  timestamp: number;       // Unix timestamp (ms)
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;         // Stringified message
  args: any[];            // Original arguments passed to console
  stack?: string;         // Stack trace (for errors)
  collapsed?: boolean;    // Is this entry collapsed?
  count?: number;         // Collapse count (if grouped)
  hash?: string;          // For deduplication (hash of message)
}
```

### Network Request Entry
```typescript
interface NetworkRequest {
  id: string;              // UUID
  timestamp: number;       // Unix timestamp (ms)
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  url: string;             // Full URL
  status: number;          // HTTP status code
  statusText: string;      // Status message
  duration: number;        // Total latency (ms)
  requestHeaders: Record<string, string>;
  requestBody?: string;    // JSON or text
  responseHeaders: Record<string, string>;
  responseBody?: string;   // JSON or text (truncated if >1MB)
  timing?: {
    start: number;
    end: number;
  };
  error?: string;          // If request failed
}
```

### WebSocket Message Format
```typescript
type WSMessage = 
  | { type: 'log'; data: LogEntry }
  | { type: 'network'; data: NetworkRequest }
  | { type: 'batch'; data: { logs: LogEntry[]; requests: NetworkRequest[] } }
  | { type: 'clear'; target: 'logs' | 'network' | 'all' };
```

---

## User Interface Specifications

### Layout

```
┌────────────────────────────────────────────────────────────────┐
│  🔧 Server DevTools                         [⚙️ Settings] [●]  │ ← Header (60px)
├────────────────────────────────────────────────────────────────┤
│  [Console] [Network] [Settings]                                │ ← Tabs (48px)
├────────────────────────────────────────────────────────────────┤
│  🔍 [Search...] [Level▾] [Time▾] [Clear] [⏸️ Pause]           │ ← Toolbar (48px)
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ 14:23:01 [INFO] Server started on port 3000              │ │
│  │ 14:23:02 [DEBUG] Connected to database                   │ │
│  │ 14:23:05 [WARN] Slow query detected (450ms) ×3          │ │ ← Collapsed
│  │ 14:23:10 [ERROR] Failed to fetch user                    │ │
│  │   └─ TypeError: Cannot read property 'id' of undefined   │ │ ← Expanded
│  │      at getUserById (app/api/user/route.ts:23)           │ │
│  │                                                           │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  [▼ Selected Log Details]                                      │ ← Details Panel
│  {                                                             │   (Collapsible)
│    "user": { "id": 123, "name": "Alice" }                     │
│  }                                                             │
└────────────────────────────────────────────────────────────────┘
```

### Console Panel

**Toolbar Elements** (left to right):
- Search input (placeholder: "Search logs...")
- Level dropdown: [All Levels ▾] → All, Info, Warn, Error, Debug
- Time range dropdown: [All Time ▾] → Last 5m, 15m, 1h, 6h, Custom
- Clear button (🗑️ icon)
- Pause/Resume toggle (⏸️/▶️ icon)
- Settings: Auto-scroll toggle, collapse similar

**Log List**:
- Virtualized scrolling (render only visible items)
- Each log row shows:
  - Timestamp (left, 80px, gray)
  - Level badge (INFO/WARN/ERROR, 60px, colored)
  - Message (flex-grow, truncate if too long)
  - Collapse count badge (if >1, e.g. "×12")
  - Expand arrow (if has stack trace or object)
- Hover: Highlight row, show copy button
- Click: Expand/collapse details
- Click timestamp: Copy timestamp
- Right-click: Context menu (Copy, Copy message, Filter by level, etc.)

**Details Panel** (when log selected):
- Full message (no truncation)
- Syntax-highlighted JSON/objects
- Stack trace with clickable file paths (if possible)
- Copy buttons for each section

### Network Panel

**Toolbar Elements**:
- Search input (placeholder: "Search URLs...")
- Method filter: Checkboxes for GET, POST, PUT, DELETE, etc.
- Status filter: [All Status ▾] → 2xx, 3xx, 4xx, 5xx
- Latency filter: [Min latency] input (e.g., >500ms)
- Clear button
- Pause/Resume toggle

**Request List** (table layout):
| Method | URL | Status | Time | Size | Timeline |
|--------|-----|--------|------|------|----------|
| GET | /api/users | 200 | 245ms | 1.2KB | ████ |
| POST | /api/auth | 401 | 120ms | 0.3KB | ██ |

- Virtualized scrolling
- Sortable columns (click header to sort)
- Color-coded status badges
- Hover: Highlight row
- Click: Open details panel

**Details Panel** (when request selected):
Tabbed interface:
- **Headers** tab: Request & Response headers in key-value table
- **Payload** tab: Request body (formatted JSON or raw)
- **Response** tab: Response body (formatted JSON or raw, truncated if >10KB with "View full" link)
- **Timing** tab: Simple breakdown (start time, end time, duration)

Copy buttons for headers, payload, response

### Settings Panel

**Sections**:
1. **General**
   - Theme: Dark / Light / System
   - WebSocket Port (default: 3001)
   
2. **Console**
   - Auto-scroll: On / Off
   - Collapse similar logs: On / Off
   - Max logs to keep: 10000 (input)
   - Default log level filter: All / Info+ / Warn+ / Error
   
3. **Network**
   - Max requests to keep: 5000 (input)
   - Truncate large responses: On / Off (>1MB)
   - Default status filter: All / 4xx and 5xx only
   
4. **Performance**
   - Sample rate: 100% / 50% / 10% (for high-volume apps)
   - Disable request body capture: Checkbox (for sensitive data)
   - Disable response body capture: Checkbox

5. **About**
   - Version number
   - GitHub link
   - Clear all data button (warning modal)

---

## Technical Implementation Details

### Phase 1: Console Interception

**File**: `packages/instrumentation/src/console-interceptor.ts`

```typescript
import { DataCollector } from './data-collector';

const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

export function initConsoleInterceptor(collector: DataCollector) {
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  
  levels.forEach(level => {
    console[level] = (...args: any[]) => {
      // Capture stack trace for errors
      const stack = level === 'error' ? new Error().stack : undefined;
      
      // Send to collector
      collector.addLog({
        timestamp: Date.now(),
        level,
        message: args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
        ).join(' '),
        args,
        stack,
      });
      
      // Call original console method (preserve normal behavior)
      originalConsole[level](...args);
    };
  });
}
```

### Phase 2: Fetch Interception

**File**: `packages/instrumentation/src/fetch-interceptor.ts`

```typescript
import { DataCollector } from './data-collector';

export function initFetchInterceptor(collector: DataCollector) {
  const originalFetch = global.fetch;
  
  global.fetch = async (...args: Parameters<typeof fetch>) => {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();
    const url = typeof args[0] === 'string' ? args[0] : args[0].url;
    const method = args[1]?.method || 'GET';
    
    try {
      // Capture request
      const requestHeaders: Record<string, string> = {};
      const reqHeadersObj = args[1]?.headers;
      if (reqHeadersObj) {
        if (reqHeadersObj instanceof Headers) {
          reqHeadersObj.forEach((value, key) => {
            requestHeaders[key] = value;
          });
        } else {
          Object.assign(requestHeaders, reqHeadersObj);
        }
      }
      
      const requestBody = args[1]?.body 
        ? String(args[1].body) 
        : undefined;
      
      // Make actual request
      const response = await originalFetch(...args);
      
      // Capture response
      const endTime = Date.now();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      
      // Clone response to read body without consuming it
      const clonedResponse = response.clone();
      let responseBody: string | undefined;
      try {
        const text = await clonedResponse.text();
        responseBody = text.length > 1_000_000 
          ? text.slice(0, 1_000_000) + '... [truncated]'
          : text;
      } catch {
        responseBody = '[Unable to read response body]';
      }
      
      // Send to collector
      collector.addNetworkRequest({
        id: requestId,
        timestamp: startTime,
        method: method as any,
        url,
        status: response.status,
        statusText: response.statusText,
        duration: endTime - startTime,
        requestHeaders,
        requestBody,
        responseHeaders,
        responseBody,
        timing: { start: startTime, end: endTime },
      });
      
      return response;
    } catch (error) {
      // Capture failed request
      collector.addNetworkRequest({
        id: requestId,
        timestamp: startTime,
        method: method as any,
        url,
        status: 0,
        statusText: 'Failed',
        duration: Date.now() - startTime,
        requestHeaders: {},
        responseHeaders: {},
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  };
}
```

### Phase 3: HTTP Module Interception

**File**: `packages/instrumentation/src/http-interceptor.ts`

```typescript
import http from 'http';
import https from 'https';
import { DataCollector } from './data-collector';

export function initHttpInterceptor(collector: DataCollector) {
  // Intercept http.request
  const originalHttpRequest = http.request;
  http.request = function(...args: any[]) {
    const req = originalHttpRequest.apply(this, args);
    wrapRequest(req, 'http', collector);
    return req;
  } as any;
  
  // Intercept https.request
  const originalHttpsRequest = https.request;
  https.request = function(...args: any[]) {
    const req = originalHttpsRequest.apply(this, args);
    wrapRequest(req, 'https', collector);
    return req;
  } as any;
}

function wrapRequest(req: any, protocol: 'http' | 'https', collector: DataCollector) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  
  // Capture request details
  const method = req.method || 'GET';
  const host = req.host || req.getHeader('host') || 'unknown';
  const path = req.path || '/';
  const url = `${protocol}://${host}${path}`;
  
  const requestHeaders: Record<string, string> = {};
  const headers = req.getHeaders();
  Object.keys(headers).forEach(key => {
    requestHeaders[key] = String(headers[key]);
  });
  
  // Listen for response
  req.on('response', (res: any) => {
    const endTime = Date.now();
    
    const responseHeaders: Record<string, string> = {};
    Object.keys(res.headers).forEach(key => {
      responseHeaders[key] = String(res.headers[key]);
    });
    
    let responseBody = '';
    res.on('data', (chunk: Buffer) => {
      if (responseBody.length < 1_000_000) {
        responseBody += chunk.toString();
      }
    });
    
    res.on('end', () => {
      collector.addNetworkRequest({
        id: requestId,
        timestamp: startTime,
        method: method as any,
        url,
        status: res.statusCode || 0,
        statusText: res.statusMessage || '',
        duration: endTime - startTime,
        requestHeaders,
        responseHeaders,
        responseBody: responseBody.length > 1_000_000 
          ? responseBody.slice(0, 1_000_000) + '... [truncated]'
          : responseBody,
        timing: { start: startTime, end: endTime },
      });
    });
  });
  
  req.on('error', (error: Error) => {
    collector.addNetworkRequest({
      id: requestId,
      timestamp: startTime,
      method: method as any,
      url,
      status: 0,
      statusText: 'Failed',
      duration: Date.now() - startTime,
      requestHeaders,
      responseHeaders: {},
      error: error.message,
    });
  });
}
```

### Phase 4: Data Collector & WebSocket Server

**File**: `packages/instrumentation/src/data-collector.ts`

```typescript
import { EventEmitter } from 'events';
import type { LogEntry, NetworkRequest } from './types';

export class DataCollector extends EventEmitter {
  private logs: LogEntry[] = [];
  private requests: NetworkRequest[] = [];
  private maxLogs = 10000;
  private maxRequests = 5000;
  
  addLog(log: Omit<LogEntry, 'id' | 'hash'>) {
    const entry: LogEntry = {
      ...log,
      id: crypto.randomUUID(),
      hash: this.hashMessage(log.message),
    };
    
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift(); // Remove oldest
    }
    
    this.emit('log', entry);
  }
  
  addNetworkRequest(request: NetworkRequest) {
    this.requests.push(request);
    if (this.requests.length > this.maxRequests) {
      this.requests.shift(); // Remove oldest
    }
    
    this.emit('network', request);
  }
  
  getLogs() {
    return this.logs;
  }
  
  getRequests() {
    return this.requests;
  }
  
  clear(target: 'logs' | 'network' | 'all') {
    if (target === 'logs' || target === 'all') {
      this.logs = [];
    }
    if (target === 'network' || target === 'all') {
      this.requests = [];
    }
    this.emit('clear', target);
  }
  
  private hashMessage(message: string): string {
    // Simple hash for deduplication
    let hash = 0;
    for (let i = 0; i < message.length; i++) {
      const char = message.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }
}
```

**File**: `packages/instrumentation/src/websocket-server.ts`

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { DataCollector } from './data-collector';

export function startWebSocketServer(collector: DataCollector, port = 3001) {
  const wss = new WebSocketServer({ port });
  
  wss.on('connection', (ws: WebSocket) => {
    console.log('[ServerDevTools] Client connected');
    
    // Send historical data on connection
    ws.send(JSON.stringify({
      type: 'batch',
      data: {
        logs: collector.getLogs(),
        requests: collector.getRequests(),
      },
    }));
    
    // Forward new logs
    const onLog = (log: any) => {
      ws.send(JSON.stringify({ type: 'log', data: log }));
    };
    
    // Forward new network requests
    const onNetwork = (request: any) => {
      ws.send(JSON.stringify({ type: 'network', data: request }));
    };
    
    // Forward clear events
    const onClear = (target: string) => {
      ws.send(JSON.stringify({ type: 'clear', target }));
    };
    
    collector.on('log', onLog);
    collector.on('network', onNetwork);
    collector.on('clear', onClear);
    
    ws.on('close', () => {
      console.log('[ServerDevTools] Client disconnected');
      collector.off('log', onLog);
      collector.off('network', onNetwork);
      collector.off('clear', onClear);
    });
  });
  
  console.log(`[ServerDevTools] WebSocket server running on ws://localhost:${port}`);
  
  return wss;
}
```

### Phase 5: UI WebSocket Client

**File**: `packages/ui/lib/websocket-client.ts`

```typescript
import { useEffect, useState } from 'react';
import type { LogEntry, NetworkRequest } from '@server-devtools/instrumentation/types';

export function useWebSocket(url: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [requests, setRequests] = useState<NetworkRequest[]>([]);
  const [connected, setConnected] = useState(false);
  
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;
    
    function connect() {
      ws = new WebSocket(url);
      
      ws.onopen = () => {
        console.log('[DevTools] Connected to server');
        setConnected(true);
      };
      
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'batch':
            setLogs(message.data.logs);
            setRequests(message.data.requests);
            break;
            
          case 'log':
            setLogs(prev => [...prev, message.data]);
            break;
            
          case 'network':
            setRequests(prev => [...prev, message.data]);
            break;
            
          case 'clear':
            if (message.target === 'logs' || message.target === 'all') {
              setLogs([]);
            }
            if (message.target === 'network' || message.target === 'all') {
              setRequests([]);
            }
            break;
        }
      };
      
      ws.onerror = (error) => {
        console.error('[DevTools] WebSocket error:', error);
      };
      
      ws.onclose = () => {
        console.log('[DevTools] Disconnected from server');
        setConnected(false);
        
        // Reconnect after 2 seconds
        reconnectTimeout = setTimeout(connect, 2000);
      };
    }
    
    connect();
    
    return () => {
      if (ws) {
        ws.close();
      }
      clearTimeout(reconnectTimeout);
    };
  }, [url]);
  
  return { logs, requests, connected };
}
```

---

## Installation & Usage

### Installation

```bash
# In user's Next.js project
npm install --save-dev server-devtools
```

### Usage Option 1: Programmatic

```typescript
// server-devtools.config.ts or next.config.js
import { initServerDevTools } from 'server-devtools/instrumentation';

// Initialize before your Next.js app starts
initServerDevTools({
  wsPort: 3001,        // WebSocket port
  uiPort: 3002,        // DevTools UI port
  autoOpenUI: true,    // Open browser automatically
});

// Then run your Next.js dev server normally
```

### Usage Option 2: CLI Wrapper

```bash
# Add to package.json scripts
{
  "scripts": {
    "dev": "next dev",
    "dev:debug": "server-devtools dev"
  }
}

# Run
npm run dev:debug
```

The CLI wrapper:
1. Starts the instrumentation
2. Starts the Next.js dev server
3. Starts the DevTools UI
4. Opens browser to `http://localhost:3002`

### Usage Option 3: Middleware (Manual)

```typescript
// app/middleware.ts or instrumentation.ts (Next.js 13+)
import { register } from 'server-devtools/instrumentation';

export function register() {
  if (process.env.NODE_ENV === 'development') {
    const { initServerDevTools } = require('server-devtools/instrumentation');
    initServerDevTools();
  }
}
```

---

## Project Structure

```
server-devtools/
├── packages/
│   ├── instrumentation/          # Core instrumentation package
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── console-interceptor.ts
│   │   │   ├── fetch-interceptor.ts
│   │   │   ├── http-interceptor.ts
│   │   │   ├── data-collector.ts
│   │   │   ├── websocket-server.ts
│   │   │   └── types.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── ui/                        # Web UI (Next.js app)
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── console/
│   │   │   ├── network/
│   │   │   └── settings/
│   │   ├── components/
│   │   │   ├── console/
│   │   │   ├── network/
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── websocket-client.ts
│   │   │   ├── data-store.ts
│   │   │   └── utils.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cli/                       # CLI wrapper (optional)
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
│
├── examples/                      # Example Next.js projects
│   └── basic-app/
│
├── docs/                          # Documentation
├── package.json                   # Monorepo root
├── turbo.json                     # Turborepo config (optional)
└── README.md
```

---

## Technology Stack

### Backend (Instrumentation)
- **Runtime**: Node.js 18+
- **Language**: TypeScript
- **WebSocket**: `ws` library
- **Build**: tsup or esbuild

### Frontend (UI)
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand or Jotai
- **Virtualization**: @tanstack/react-virtual
- **Syntax Highlighting**: react-json-view or custom
- **WebSocket Client**: Native WebSocket API

### Development Tools
- **Monorepo**: pnpm workspaces or Turborepo
- **Linting**: ESLint
- **Formatting**: Prettier
- **Testing**: Vitest (unit), Playwright (E2E)

---

## Performance Considerations

### Instrumentation
- **Memory**: Circular buffers prevent unbounded growth
- **CPU**: Minimal overhead (<1% for typical workloads)
- **I/O**: WebSocket is non-blocking, batched updates every 100ms if high volume

### UI
- **Virtualization**: Only render visible log/request rows (handle 100k+ items)
- **Debouncing**: Search/filter inputs debounced by 300ms
- **Memoization**: React.memo on list items to prevent unnecessary re-renders
- **Web Workers**: Consider for heavy filtering/searching (v2)

### Configuration
- **Sample Rate**: For extremely high-volume apps, add sampling (e.g., log 10% of requests)
- **Body Truncation**: Truncate request/response bodies >1MB to prevent memory issues
- **Disable Options**: Allow disabling body capture for sensitive data

---

## Security Considerations

1. **Local-Only**: Never expose WebSocket server to public internet (bind to 127.0.0.1)
2. **Development-Only**: Instrumentation should never run in production
3. **Sensitive Data**: Provide options to disable body capture or redact headers (Authorization, Cookie)
4. **No Authentication**: Since it's local-only, no auth needed for v1
5. **CORS**: UI must handle CORS if served from different origin

---

## Testing Strategy

### Unit Tests
- Console interceptor: Verify logs captured correctly
- Fetch interceptor: Verify request/response captured
- Data collector: Verify circular buffer behavior
- UI components: Verify filtering, searching, rendering

### Integration Tests
- End-to-end: Start instrumentation + UI, verify data flows correctly
- WebSocket reconnection: Verify client reconnects after server restart
- Large datasets: Verify performance with 10k+ logs/requests

### Manual Testing
- Test with real Next.js App Router project
- Test with various API calls (fetch, axios, http.request)
- Test with errors, stack traces
- Test UI responsiveness, filtering speed

---

## Success Metrics

### Performance
- [ ] Instrumentation adds <5% overhead to dev server startup
- [ ] WebSocket latency <50ms for log delivery
- [ ] UI renders 10,000 logs without lag
- [ ] Search across 10,000 logs completes in <200ms

### Usability
- [ ] Setup takes <5 minutes from npm install to running
- [ ] Developers can find specific log in <10 seconds (vs 1+ min in terminal)
- [ ] Zero configuration works for 80% of use cases

### Reliability
- [ ] Captures 100% of console output
- [ ] Captures 95%+ of network requests (fetch + http module)
- [ ] No crashes or memory leaks after 8+ hours runtime
- [ ] WebSocket auto-reconnects after network interruption

---

## Roadmap

### v1.0 (MVP) - 4-6 weeks
- ✅ Console log capture & display
- ✅ Basic filtering (level, search)
- ✅ Fetch + http.request network monitoring
- ✅ Request/response viewing
- ✅ DevTools-like UI (dark theme)
- ✅ WebSocket real-time updates
- ✅ Log collapsing
- ✅ Basic settings panel

### v1.1 (Polish) - +2 weeks
- Export logs/requests to file
- Save filter presets
- Copy as cURL
- Regular expression search
- Better error stack trace formatting

### v1.2 (Performance) - +2 weeks
- Request waterfall visualization
- HAR export
- Timing breakdown (if measurable)
- Web Workers for filtering

### v2.0 (Advanced) - +4-6 weeks
- Request replay/mocking
- Custom tags/metadata support
- Multi-project support (switch between projects)
- Database query monitoring (Prisma, Drizzle integration)
- Lightweight VS Code extension wrapper (webview iframe)

---

## Open Questions / Future Investigation

1. **Source Maps**: Can we map stack traces back to original source code in dev mode?
2. **Axios/Other Clients**: Should we add explicit support for popular HTTP clients?
3. **GraphQL**: Should we parse GraphQL requests specially for better visibility?
4. **tRPC**: Should we add tRPC-specific features (procedure names, etc.)?
5. **Database Queries**: Can we intercept Prisma/Drizzle queries without library-specific code?
6. **Monorepo Support**: How to handle Next.js projects in monorepos with shared packages?

---

## Dependencies

### Instrumentation Package
```json
{
  "dependencies": {
    "ws": "^8.14.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/ws": "^8.5.0",
    "typescript": "^5.2.0",
    "tsup": "^7.2.0"
  }
}
```

### UI Package
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.0",
    "@tanstack/react-virtual": "^3.0.0",
    "tailwindcss": "^3.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "typescript": "^5.2.0",
    "eslint": "^8.50.0",
    "prettier": "^3.0.0"
  }
}
```

---

## Getting Started for Agent

### Phase 1: Setup (Day 1)
1. Create monorepo structure with pnpm workspaces
2. Set up TypeScript configs
3. Initialize packages: `instrumentation`, `ui`, `cli`
4. Set up basic build pipeline (tsup for instrumentation, Next.js for UI)

### Phase 2: Instrumentation (Days 2-7)
1. Implement console interceptor
2. Implement fetch interceptor
3. Implement http/https interceptor
4. Implement data collector with circular buffer
5. Implement WebSocket server
6. Test with example Next.js app

### Phase 3: UI Foundation (Days 8-14)
1. Set up Next.js app with Tailwind
2. Implement WebSocket client hook
3. Implement basic layout with tabs
4. Implement console panel (no filters yet)
5. Implement network panel (no filters yet)
6. Test real-time data flow

### Phase 4: Features (Days 15-25)
1. Add console filtering (level, search, time)
2. Add log collapsing
3. Add network filtering (method, status, URL)
4. Add details panels (expandable objects, headers, etc.)
5. Add syntax highlighting for JSON
6. Add copy/export buttons
7. Implement settings panel

### Phase 5: Polish (Days 26-35)
1. Performance optimization (virtualization, memoization)
2. Error handling & edge cases
3. UI/UX refinements (loading states, empty states, etc.)
4. Documentation (README, API docs)
5. Example project
6. End-to-end testing

### Phase 6: Release (Days 36-40)
1. Final testing
2. Package for npm
3. Write release notes
4. Publish to npm

---

## Constraints & Guidelines

### Code Quality
- **TypeScript**: Strict mode, no `any` types except where necessary
- **Error Handling**: All async operations must have try/catch
- **Performance**: Profile before optimizing, measure impact
- **Accessibility**: UI must be keyboard navigable, screen reader friendly

### User Experience
- **Zero Config**: Works out of the box for 80% of cases
- **Progressive Enhancement**: Basic features work immediately, advanced features discoverable
- **Fast Feedback**: Users see results within 500ms of action
- **Familiar**: UI should feel like Chrome DevTools (don't reinvent patterns)

### Development
- **Incremental**: Ship MVP first, iterate based on usage
- **Documented**: Every public API documented with TSDoc
- **Tested**: >80% code coverage for core instrumentation
- **Versioned**: Semantic versioning, changelog for every release

---

## Example Use Cases

### Use Case 1: Debug Server-Side API Call
1. Developer runs `npm run dev:debug`
2. DevTools UI opens, shows empty console/network
3. Developer triggers action in Next.js app that makes API call
4. Network panel shows POST to `/api/user` with 500 error
5. Developer clicks request, sees error response: `{"error": "Database connection failed"}`
6. Developer clicks console tab, filters by "error", sees stack trace
7. Developer clicks stack trace line, jumps to code (future feature)

### Use Case 2: Find Slow Database Queries
1. Developer filters network requests by latency >500ms
2. Sees multiple requests to `/api/products` taking 800ms+
3. Clicks request, sees it's a Prisma query
4. Checks console for Prisma query logs (if enabled)
5. Identifies N+1 query problem

### Use Case 3: Clean Up Noisy Logs
1. Developer sees 500+ logs in console
2. Types "deprecated" in search box
3. Sees all deprecation warnings from third-party libraries
4. Clicks "Filter by level" → "Warn+"
5. Now only sees warnings and errors
6. Finds actual error message in 10 seconds

---

## FAQ for Agent

**Q: Should I use WebSocket or Server-Sent Events (SSE)?**
A: WebSocket. It's bidirectional (for future features like pause/clear from UI), has better library support, and is more familiar to developers.

**Q: Should I use a state management library or just React Context?**
A: Use Zustand or Jotai. The state is complex (logs, requests, filters, settings) and Context will cause unnecessary re-renders.

**Q: How do I handle very large response bodies?**
A: Truncate at 1MB. Show a "View full response" button that opens in a modal or new tab. Consider streaming for v2.

**Q: Should I use a component library like shadcn/ui?**
A: Yes, it will speed up development and provide consistent, accessible components. Use their Table, Tabs, Input, Button components.

**Q: How do I handle reconnection if WebSocket drops?**
A: Implement exponential backoff (2s, 4s, 8s, max 30s). Show connection status in UI. Buffer new data on server during disconnect.

**Q: Should I support custom log formats (JSON structured logging)?**
A: Not in v1. Just capture what's passed to console.log. Add structured logging support in v1.1+.

**Q: How do I make this work with monorepos?**
A: Detect package.json in parent directories, allow configuring project root. For v1, assume single Next.js project.

**Q: Should I add authentication?**
A: No. It's local-only for v1. If we add remote monitoring in v2, add token-based auth.

**Q: What if user already has port 3001 or 3002 in use?**
A: Auto-detect and increment port (3001 → 3002 → 3003). Show actual ports in console output.

---

## Success Definition

This project is successful if:
1. ✅ A developer can install and run it in their Next.js project in <5 minutes
2. ✅ It reduces time to find relevant logs from 1-2 minutes to <10 seconds
3. ✅ It provides visibility into server-side network requests that was previously invisible
4. ✅ It adds <5% overhead to development server performance
5. ✅ Developers continue using it after trying it (measured by GitHub stars, npm downloads, testimonials)

---

## End of Specification

This spec is comprehensive and opinionated. It provides clear guidance on:
- What to build (features, UI, architecture)
- How to build it (tech stack, implementation details)
- Why decisions were made (performance, UX, DX)
- When to ship (phased approach, MVP first)

Agent: Follow this spec to build v1.0. Ask questions if anything is unclear. Prioritize shipping the MVP over perfection. Test with real Next.js projects early and often.

Good luck! 🚀
