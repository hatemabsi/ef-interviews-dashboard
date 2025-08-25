// src/app/api/n8n/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

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
  const transcribePath = process.env.N8N_TRANSCRIBE_PATH || "";

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
    case "transcribe":
      path = transcribePath;
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

  // Multipart: rebuild FormData to preserve filename & content-type for File parts
  if (contentType.startsWith("multipart/form-data")) {
    const inForm = await request.formData();
    const outForm = new FormData();

    for (const [key, val] of inForm.entries()) {
      if (val instanceof File) {
        // Ensure filename is preserved; fall back to a sensible default
        const fname = val.name && val.name !== "blob" ? val.name : "upload.bin";
        outForm.append(key, val, fname);
      } else {
        outForm.append(key, String(val));
      }
    }

    const resp = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        authorization: authHeader,
        // IMPORTANT: do not set Content-Type; fetch will add correct multipart boundary
      },
      body: outForm,
    });

    const buf = Buffer.from(await resp.arrayBuffer());
    const headers = new Headers();
    const ct = resp.headers.get("content-type") || "application/octet-stream";
    headers.set("content-type", ct);
    // Pass through filename for downloads if present
    const cd = resp.headers.get("content-disposition");
    if (cd) headers.set("content-disposition", cd);

    return new Response(buf, { status: resp.status, headers });
  }

  // Other non-JSON bodies: stream through without forcing content-type
  const init: RequestInit & { duplex?: "half" } = {
    method: "POST",
    headers: {
      authorization: authHeader,
    },
    body: request.body ?? null,
    duplex: "half",
  };

  const resp = await fetch(upstreamUrl, init);
  const buf = Buffer.from(await resp.arrayBuffer());
  const headers = new Headers();
  headers.set(
    "content-type",
    resp.headers.get("content-type") || "application/octet-stream"
  );
  const cd = resp.headers.get("content-disposition");
  if (cd) headers.set("content-disposition", cd);

  return new Response(buf, {
    status: resp.status,
    headers,
  });
}
