import type { NextRequest } from "next/server";

const backendUrl = process.env.BACKEND_API_URL?.replace(/\/+$/, "");

export async function proxyBackend(
  request: NextRequest,
  backendPath: string,
  options: { forwardBody?: boolean } = {},
) {
  if (!backendUrl) {
    return Response.json(
      { detail: "The document service is not configured yet." },
      { status: 503 },
    );
  }

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const authorization = request.headers.get("authorization");
  if (contentType) headers.set("content-type", contentType);
  if (authorization) headers.set("authorization", authorization);

  let body: ArrayBuffer | undefined;
  if (options.forwardBody) body = await request.arrayBuffer();
  const upstream = await fetch(`${backendUrl}${backendPath}`, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  }).catch(() => null);

  if (!upstream) {
    return Response.json(
      { detail: "The document service is temporarily unavailable." },
      { status: 503 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of [
    "content-type",
    "content-disposition",
    "cache-control",
    "x-document-fields-updated",
  ]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
