import type { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend";

export function GET(request: NextRequest) {
  return proxyBackend(request, `/api/practicals${request.nextUrl.search}`);
}
