import type { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend";

async function documentRoute(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyBackend(
    request,
    `/api/admin/documents/${encodeURIComponent(id)}`,
    { forwardBody: request.method === "PATCH" },
  );
}

export const PATCH = documentRoute;
export const DELETE = documentRoute;
