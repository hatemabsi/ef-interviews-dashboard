// src/app/api/n8n/route.ts
import { NextResponse } from "next/server";

function basicHeader() {
  const u = process.env.N8N_BASIC_USER || "";
  const p = process.env.N8N_BASIC_PASS || process.env.N8N_BASIC_PASSWORD || "";
  const token = Buffer.from(`${u}:${p}`).toString("base64");
  return `Basic ${token}`;
}

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const base = process.env.N8N_BASE_URL;
  if (!base) {
    return NextResponse.json(
      { error: "N8N_BASE_URL missing" },
      { status: 500 }
    );
  }

  const url = new URL(request.url);
  const target = url.searchParams.get("target") || "";

  // Safe defaults if envs are not set
  const ingestPath = process.env.N8N_INGEST_PATH || "";
  const startIdeaPath = process.env.N8N_START_IDEA_PATH || "";
  const updatePath = process.env.N8N_UPDATE_IDEA_PATH || "";

  let path = "";
  switch (target) {
    case "ingest":
      path = ingestPath;
      break;
    case "start-idea":
      path = startIdeaPath;
      break;
    case "update-status":
      path = updatePath;
      break;
    default:
      return NextResponse.json({ error: "Unknown target" }, { status: 400 });
  }

  const upstreamUrl = `${base}${path}`;
  const authHeader = basicHeader();

  // Decide body handling by content-type
  const contentType = request.headers.get("content-type") || "";

  if (contentType.startsWith("application/json")) {
    const body = await request.text(); // raw JSON string
    const resp = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        authorization: authHeader,
        "content-type": "application/json",
      },
      body,
    });

    const ct = resp.headers.get("content-type") || "application/json";
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: { "content-type": ct },
    });
  }

  // Multipart / other: stream through
  // Convert Web ReadableStream to Node stream for compatibility with undici if needed,
  // but here we can just forward the web stream directly.
  const init: RequestInit & { duplex?: "half" } = {
    method: "POST",
    headers: {
      authorization: authHeader,
      // do NOT set content-type; boundary is preserved by runtime
    },
    body: request.body, // web stream
    duplex: "half",
  };

  const resp = await fetch(upstreamUrl, init);
  const buf = Buffer.from(await resp.arrayBuffer());
  const ct = resp.headers.get("content-type") || "application/octet-stream";
  return new Response(buf, {
    status: resp.status,
    headers: { "content-type": ct },
  });
}
