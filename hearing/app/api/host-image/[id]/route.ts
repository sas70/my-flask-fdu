import { NextRequest, NextResponse } from "next/server";
import { hostImageStore } from "@/lib/host-image-store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const entry = hostImageStore.get(id);
  if (!entry) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(entry.buffer), {
    headers: {
      "Content-Type": entry.contentType,
      "Cache-Control": "no-store",
      // Allow canvas export when crops are same-origin; Flask fetch does not need CORS for server-side GET
      "Access-Control-Allow-Origin": "*"
    }
  });
}
