import { NextRequest, NextResponse } from "next/server";
import { hostImageStore } from "@/lib/host-image-store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");

  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  const blob = file as Blob;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const contentType = blob.type || "application/octet-stream";
  const id = crypto.randomUUID();

  hostImageStore.set(id, { buffer, contentType });

  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://127.0.0.1:3000");

  const url = `${base}/api/host-image/${id}`;

  return NextResponse.json({ url, id });
}
