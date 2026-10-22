import type { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return proxyBackend(request, `/api/practicals/${encodeURIComponent(id)}`);
}
