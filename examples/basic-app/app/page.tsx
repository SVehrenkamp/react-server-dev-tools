"use client";

import { useState } from "react";

export default function Page(): JSX.Element {
  const [result, setResult] = useState<string>("No request yet.");
  const [loading, setLoading] = useState(false);

  const runDemo = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/demo", { method: "POST" });
      const json = (await response.json()) as { ok: boolean; upstreamStatus: number; requestId: string };
      setResult(JSON.stringify(json, null, 2));
    } catch (error) {
      setResult(String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ margin: "0 auto", maxWidth: 780, padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Server DevTools Example</h1>
      <p>
        Click to trigger server logs and an upstream fetch call. Then inspect Console and Network in
        Server DevTools.
      </p>
      <button onClick={runDemo} disabled={loading} style={{ padding: "8px 12px" }}>
        {loading ? "Running..." : "Trigger Server Activity"}
      </button>
      <pre style={{ marginTop: 16, padding: 12, background: "#f3f5f7", overflow: "auto" }}>{result}</pre>
    </main>
  );
}
