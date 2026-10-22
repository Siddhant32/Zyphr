import type { NextRequest } from "next/server";
import { proxyBackend } from "@/lib/backend";

export function POST(request: NextRequest) {
  return proxyBackend(request, "/api/generate", { forwardBody: true });
}
