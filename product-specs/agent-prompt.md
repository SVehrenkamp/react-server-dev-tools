# Agent Prompt: Build Server DevTools for Next.js

## Context
You are building a local web-based debugging tool for Next.js App Router applications. The tool provides a Chrome DevTools-like interface for viewing server-side console logs and monitoring Node.js network activity.

**Full Specification**: See `server-devtools-spec.md` for complete product requirements, technical architecture, and implementation details.

---

## Your Mission

Build **Server DevTools v1.0 (MVP)** - a production-ready tool that developers can install and use immediately.

### Core Deliverables

1. **Instrumentation Package** (`@server-devtools/instrumentation`)
   - Intercept `console.log/warn/error/info/debug` without breaking existing behavior
   - Wrap `fetch` API to capture HTTP requests/responses
   - Wrap Node.js `http`/`https` modules for comprehensive network monitoring
   - Store data in circular buffers (last 10k logs, 5k requests)
   - Broadcast real-time updates via WebSocket server (port 3001)

2. **Web UI Application** (`@server-devtools/ui`)
   - Next.js 14+ app with Tailwind CSS
   - **Console Panel**: Virtualized log list with search, filtering (level, time), collapsing, syntax highlighting
   - **Network Panel**: Request list with method/status/latency, details panel showing headers/body/timing
   - **Settings Panel**: Configure ports, theme, retention limits, performance options
   - Real-time updates via WebSocket client with auto-reconnect

3. **Easy Installation & Usage**
   - NPM package: `npm install --save-dev server-devtools`
   - CLI wrapper: `npx server-devtools dev` or programmatic init
   - Works out-of-box with zero config for 80% of Next.js projects

---

## Key Requirements

### Functional
- ✅ Capture 100% of server console output
- ✅ Capture 95%+ of network requests (fetch + http module)
- ✅ Filter logs by level, time range, search text
- ✅ Filter requests by method, status, URL, latency
- ✅ Collapse identical log messages with count badge
- ✅ Expand objects/JSON with syntax highlighting
- ✅ Display stack traces for errors
- ✅ Real-time updates (<50ms latency)
- ✅ Clear console/network buttons
- ✅ Pause/resume log capture

### Non-Functional
- ✅ <5% performance overhead on Next.js dev server
- ✅ UI handles 10k+ logs without lag (use virtualization)
- ✅ Setup takes <5 minutes
- ✅ WebSocket auto-reconnects after disruption
- ✅ Memory-safe (circular buffers prevent unbounded growth)
- ✅ Local-only (bind WebSocket to 127.0.0.1)
- ✅ Development-only (never run in production)

### UI/UX
- ✅ Dark theme by default (Chrome DevTools aesthetic)
- ✅ Keyboard navigable, accessible
- ✅ Responsive (works on smaller screens)
- ✅ Loading states, empty states, error states
- ✅ Copy buttons for logs, headers, responses
- ✅ Color-coded status badges (2xx=green, 4xx=yellow, 5xx=red)

---

## Technical Constraints

### Stack (Non-Negotiable)
- **Instrumentation**: TypeScript, Node.js 18+, `ws` library
- **UI**: Next.js 14+ (App Router), React 18+, TypeScript, Tailwind CSS
- **State Management**: Zustand or Jotai (NOT Context API)
- **Virtualization**: @tanstack/react-virtual (for log/request lists)
- **Monorepo**: pnpm workspaces or Turborepo

### Architecture Patterns
- **Interception**: Wrap global methods, preserve original behavior
- **Data Flow**: Interceptors → Collector → WebSocket → UI
- **Memory**: Circular buffers (FIFO, max 10k logs / 5k requests)
- **Transport**: WebSocket for bidirectional real-time communication
- **Error Handling**: All async operations in try/catch, graceful degradation

### Code Quality
- **TypeScript**: Strict mode enabled, minimize `any` types
- **Performance**: Virtualize lists, debounce search (300ms), memoize components
- **Security**: Bind to localhost only, never run in production
- **Testing**: Unit tests for core logic, integration test for WebSocket flow

---

## Development Phases

### Phase 1: Project Setup (1 day)
- [ ] Initialize monorepo with pnpm workspaces
- [ ] Create packages: `instrumentation`, `ui`
- [ ] Configure TypeScript (strict mode)
- [ ] Set up build tools (tsup for instrumentation, Next.js for UI)

### Phase 2: Instrumentation Core (3-5 days)
- [ ] Implement console interceptor (log, warn, error, info, debug)
- [ ] Implement fetch interceptor (capture request/response)
- [ ] Implement http/https interceptor (Node.js modules)
- [ ] Implement DataCollector with circular buffers
- [ ] Implement WebSocket server (broadcast new data, send history on connect)
- [ ] Test with minimal Next.js app

### Phase 3: UI Foundation (3-5 days)
- [ ] Create Next.js app with Tailwind CSS (dark theme)
- [ ] Implement WebSocket client hook (with auto-reconnect)
- [ ] Create layout with tabs (Console, Network, Settings)
- [ ] Implement basic Console panel (display logs, no filters)
- [ ] Implement basic Network panel (display requests, no filters)
- [ ] Verify real-time data flow end-to-end

### Phase 4: Features & Filters (5-7 days)
- [ ] Console: Add search, filter by level/time, clear button, pause/resume
- [ ] Console: Implement log collapsing (group identical messages)
- [ ] Console: Syntax highlight JSON, expandable objects
- [ ] Console: Display stack traces for errors
- [ ] Network: Add filters (method, status, URL, latency)
- [ ] Network: Implement details panel (headers, request/response bodies)
- [ ] Network: Color-code status badges
- [ ] Settings: Add port config, theme toggle, retention limits

### Phase 5: Performance & Polish (3-5 days)
- [ ] Virtualize log/request lists (handle 10k+ items)
- [ ] Debounce search inputs (300ms)
- [ ] Memoize list item components
- [ ] Add loading states, empty states, connection status indicators
- [ ] Truncate large responses (>1MB)
- [ ] Add copy buttons (logs, headers, bodies)
- [ ] Implement graceful error handling

### Phase 6: Package & Document (2-3 days)
- [ ] Create npm package configuration
- [ ] Write README with installation & usage examples
- [ ] Create example Next.js project demonstrating usage
- [ ] Write inline documentation (TSDoc for public APIs)
- [ ] Add basic unit tests (console/fetch interceptors)
- [ ] Test installation flow from scratch

**Total Estimated Time**: 18-28 days for production-ready v1.0

---

## Critical Implementation Notes

### Console Interception Pattern
```typescript
const original = console.log;
console.log = (...args) => {
  // 1. Capture data (timestamp, level, args, stack if error)
  collector.addLog({ timestamp: Date.now(), level: 'log', args });
  
  // 2. Preserve original behavior (CRITICAL - don't break existing logs)
  original(...args);
};
```

### Fetch Interception Pattern
```typescript
const originalFetch = global.fetch;
global.fetch = async (...args) => {
  const start = Date.now();
  try {
    const response = await originalFetch(...args);
    // Clone response to read body without consuming
    const clone = response.clone();
    const body = await clone.text();
    collector.addRequest({ url, status, duration: Date.now() - start, body });
    return response; // Return original, not clone
  } catch (error) {
    collector.addRequest({ url, status: 0, error: error.message });
    throw error; // Re-throw to preserve error behavior
  }
};
```

### Circular Buffer Pattern
```typescript
class CircularBuffer<T> {
  private items: T[] = [];
  constructor(private maxSize: number) {}
  
  add(item: T) {
    this.items.push(item);
    if (this.items.length > this.maxSize) {
      this.items.shift(); // Remove oldest
    }
  }
}
```

### WebSocket Reconnection Pattern
```typescript
function connect() {
  const ws = new WebSocket(url);
  ws.onclose = () => {
    setTimeout(connect, 2000); // Exponential backoff in production
  };
}
```

---

## What Good Looks Like

### Installation Experience
```bash
# User runs this in their Next.js project
npm install --save-dev server-devtools

# Add to package.json
"dev:debug": "server-devtools dev"

# Run
npm run dev:debug
# → Opens browser to http://localhost:3002
# → Shows empty console/network panels
# → Ready to capture logs/requests
```

### Usage Experience
```
User triggers action in Next.js app
  ↓
Server makes API call to external service
  ↓
Network panel shows: POST https://api.stripe.com/v1/charges | 200 | 340ms
  ↓
User clicks request
  ↓
Details panel shows: Request headers, body, response, timing
  ↓
User sees issue (missing API key in header)
  ↓
Problem solved in 30 seconds (vs 10 minutes digging through terminal)
```

---

## Red Flags to Avoid

❌ **Don't**: Use browser localStorage (not available in server-side Next.js)  
✅ **Do**: Use in-memory state with circular buffers

❌ **Don't**: Try to capture ALL network activity (TCP, UDP, DNS)  
✅ **Do**: Focus on HTTP/HTTPS (fetch + http module covers 95% of cases)

❌ **Don't**: Block the main thread with heavy filtering  
✅ **Do**: Debounce search, use virtualization, consider Web Workers for v2

❌ **Don't**: Expose WebSocket server publicly  
✅ **Do**: Bind to 127.0.0.1 (localhost only)

❌ **Don't**: Run instrumentation in production  
✅ **Do**: Add NODE_ENV checks, warn if production detected

❌ **Don't**: Reinvent UI patterns  
✅ **Do**: Steal from Chrome DevTools (users already know this UX)

❌ **Don't**: Overcomplicate v1  
✅ **Do**: Ship MVP first, iterate based on real usage

---

## Testing Checklist

Before considering v1 done:

### Instrumentation
- [ ] Console logs captured without breaking existing output
- [ ] Fetch requests captured (GET, POST, with/without body)
- [ ] HTTP module requests captured (http.get, https.request)
- [ ] Errors don't crash the dev server
- [ ] Memory doesn't grow unbounded (circular buffer works)
- [ ] WebSocket broadcasts new data in real-time

### UI
- [ ] Logs appear in real-time (<100ms latency)
- [ ] Search works across all logs
- [ ] Filters work (level, time range)
- [ ] Log collapsing groups identical messages
- [ ] Network requests appear with correct method/status/latency
- [ ] Request details panel shows headers/body correctly
- [ ] UI doesn't freeze with 10k+ logs (virtualization works)
- [ ] WebSocket reconnects automatically after server restart
- [ ] Dark theme is readable and polished

### Integration
- [ ] Install from scratch takes <5 minutes
- [ ] Works with Next.js 14+ App Router project
- [ ] Doesn't conflict with existing dev server (different ports)
- [ ] Can be disabled easily (remove from package.json scripts)

---

## Success Metrics

**You've succeeded when:**
1. A developer can install and see their first log in <5 minutes
2. Finding a specific log takes <10 seconds (vs 1-2 minutes in terminal)
3. Network requests are visible that were previously invisible
4. Performance overhead is <5% (measure Next.js startup time before/after)
5. Developers say "This is exactly what I needed" 🎯

---

## Resources

**Reference Implementations** (for inspiration, don't copy):
- Chrome DevTools Console: https://developer.chrome.com/docs/devtools/console/
- Chrome DevTools Network: https://developer.chrome.com/docs/devtools/network/
- React DevTools: https://github.com/facebook/react/tree/main/packages/react-devtools

**Key Libraries**:
- WebSocket: https://github.com/websockets/ws
- TanStack Virtual: https://tanstack.com/virtual/latest
- Zustand: https://github.com/pmndrs/zustand
- Tailwind: https://tailwindcss.com

**Next.js Docs**:
- App Router: https://nextjs.org/docs/app
- Instrumentation: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

---

## Final Notes

**Philosophy**: 
- Favor **simplicity** over features
- Favor **performance** over completeness
- Favor **shipping** over perfection

**Priorities**:
1. Make it work (capture logs/requests, display in UI)
2. Make it fast (virtualization, debouncing, circular buffers)
3. Make it easy (zero config, <5 min setup)
4. Make it polished (DevTools aesthetic, smooth UX)

**When in doubt**:
- Refer to the full spec: `server-devtools-spec.md`
- Ask yourself: "Would this help me debug a Next.js app?"
- Ship the simplest thing that works, iterate later

---

## Start Here

1. Read the full spec (`server-devtools-spec.md`)
2. Set up the monorepo structure
3. Build the console interceptor first (easiest to test)
4. Build the WebSocket server
5. Build the basic UI to display logs
6. Verify end-to-end flow works
7. Add features incrementally (filters, network, etc.)
8. Test with a real Next.js project
9. Package and ship

**Time to build**: 4-6 weeks to production-ready v1.0

**Let's ship something developers will love.** 🚀
