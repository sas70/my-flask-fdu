import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";
import { uploadBinaryToBytescale } from "@/lib/bytescale-binary";
import { chunksCollection, sessionRef } from "@/lib/homework-capture-server";
import { ensureSessionYujaFunnyDoc, writeYujaSegmentChunk } from "@/lib/yuja-funny-urls";

export const maxDuration = 60;

/** Vercel ~4.5 MB max body; local dev allows larger chunks after next.config body limits. */
const MAX_CHUNK_BYTES = process.env.VERCEL ? 4_200_000 : 32 * 1024 * 1024;

/**
 * Uploads one recorded chunk to ByteScale and stores metadata under the session.
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const sessionId = String(formData.get("sessionId") || "").trim();
    const indexRaw = formData.get("chunkIndex");
    const chunkIndex =
      typeof indexRaw === "string" ? Number(indexRaw) : Number(indexRaw ?? NaN);
    const file = formData.get("file");

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: "chunkIndex must be a non-negative integer" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > MAX_CHUNK_BYTES) {
      return NextResponse.json(
        {
          error: `Chunk too large (${file.size} bytes). Max ${MAX_CHUNK_BYTES} bytes per request${
            process.env.VERCEL
              ? " (Vercel limit). Shorten NEXT_PUBLIC_HOMEWORK_CAPTURE_CHUNK_MS or record at lower quality."
              : "."
          }`,
        },
        { status: 413 }
      );
    }

    const db = getDb();
    const sess = await sessionRef(db, sessionId).get();
    if (!sess.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (sess.data()?.status !== "open") {
      return NextResponse.json({ error: "Session is not open for uploads" }, { status: 409 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || "video/webm";
    const name = `capture_${sessionId}_part${String(chunkIndex).padStart(4, "0")}.webm`;
    const prefix = `homework/capture/${sessionId}`;
    const fileUrl = await uploadBinaryToBytescale(buf, `${prefix}_${name}`, mime);

    await chunksCollection(db, sessionId).doc(String(chunkIndex)).set({
      chunkIndex,
      url: fileUrl,
      name,
      mimeType: mime,
      uploadedAt: FieldValue.serverTimestamp(),
    });
    await sessionRef(db, sessionId).update({ updatedAt: FieldValue.serverTimestamp() });

    try {
      const yujaId = await ensureSessionYujaFunnyDoc(db, sessionId);
      if (yujaId) {
        await writeYujaSegmentChunk(db, yujaId, chunkIndex, fileUrl, mime);
      }
    } catch (yujaErr) {
      console.error("[homework-capture/chunk] yuja_funny_urls update", yujaErr);
    }

    return NextResponse.json({ ok: true, chunkIndex, url: fileUrl });
  } catch (e) {
    console.error("[homework-capture/chunk]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Chunk upload failed" },
      { status: 500 }
    );
  }
}
