import type { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend";

export function GET(request: NextRequest) {
  return proxyBackend(
    request,
    `/api/admin/documents${request.nextUrl.search}`,
  );
}

export function POST(request: NextRequest) {
  return proxyBackend(request, "/api/admin/documents", {
    forwardBody: true,
  });
}
