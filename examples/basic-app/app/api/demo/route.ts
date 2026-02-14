import { NextResponse } from "next/server";

export async function POST(): Promise<Response> {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  console.info("[example] demo started", { requestId });

  try {
    const upstream = await fetch("https://jsonplaceholder.typicode.com/todos/1", {
      headers: {
        "x-request-id": requestId,
      },
      cache: "no-store",
    });

    const body = (await upstream.json()) as { title: string };
    console.log("[example] upstream response", {
      requestId,
      status: upstream.status,
      title: body.title,
      duration: Date.now() - startedAt,
    });

    return NextResponse.json({
      ok: true,
      requestId,
      upstreamStatus: upstream.status,
    });
  } catch (error) {
    console.error("[example] demo failed", error);
    return NextResponse.json(
      {
        ok: false,
        requestId,
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
