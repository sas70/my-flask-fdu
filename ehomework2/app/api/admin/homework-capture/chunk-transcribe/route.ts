/* eslint-disable @typescript-eslint/no-require-imports -- @ehomework/gradeflow-shared is CommonJS */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { chunksCollection, sessionRef } from "@/lib/homework-capture-server";
import {
  ensureSessionYujaFunnyDoc,
  writeYujaSegmentTranscript,
  writeYujaSegmentTranscriptFailed,
} from "@/lib/yuja-funny-urls";

export const maxDuration = 300;

const {
  transcribeWithGemini,
  uploadTextToBytescale,
} = require("@ehomework/gradeflow-shared") as {
  transcribeWithGemini: (url: string, mime: string) => Promise<string>;
  uploadTextToBytescale: (text: string, fileName: string) => Promise<string>;
};

/**
 * Transcribe one uploaded WebM chunk (Gemini), upload .txt to ByteScale, update yuja_funny_urls segment.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY is not configured (required for segment transcription)." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { sessionId?: string; chunkIndex?: number };
    const sessionId = String(body.sessionId || "").trim();
    const chunkIndex = Number(body.chunkIndex);

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
      return NextResponse.json({ error: "chunkIndex must be a non-negative integer" }, { status: 400 });
    }

    const db = getDb();
    const sess = await sessionRef(db, sessionId).get();
    if (!sess.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const sessData = sess.data() as { status?: string };
    if (sessData.status !== "open") {
      return NextResponse.json({ error: "Session is not open" }, { status: 409 });
    }

    const yujaId = await ensureSessionYujaFunnyDoc(db, sessionId);
    if (!yujaId) {
      return NextResponse.json(
        { error: "No reference video URL on this session — segment transcripts are not tracked in yuja_funny_urls." },
        { status: 400 }
      );
    }

    const chunkSnap = await chunksCollection(db, sessionId).doc(String(chunkIndex)).get();
    if (!chunkSnap.exists) {
      return NextResponse.json({ error: "Chunk not found for this session" }, { status: 404 });
    }
    const ch = chunkSnap.data() as { url?: string; mimeType?: string; name?: string };
    const url = ch.url;
    if (!url) {
      return NextResponse.json({ error: "Chunk has no ByteScale url" }, { status: 400 });
    }
    const mime = ch.mimeType || "video/webm";

    let text: string;
    try {
      text = await transcribeWithGemini(url, mime);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await writeYujaSegmentTranscriptFailed(db, yujaId, chunkIndex, msg);
      return NextResponse.json({ error: msg, chunkIndex, transcriptionStatus: "failed" }, { status: 502 });
    }

    const fileName = `yuja_funny_urls/${yujaId}/segment_${String(chunkIndex).padStart(4, "0")}.txt`;
    const transcriptUrl = await uploadTextToBytescale(text, fileName);
    await writeYujaSegmentTranscript(db, yujaId, chunkIndex, transcriptUrl);

    return NextResponse.json({
      ok: true,
      chunkIndex,
      transcriptUrl,
      yujaFunnyUrlsDocId: yujaId,
    });
  } catch (e) {
    console.error("[homework-capture/chunk-transcribe]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Segment transcription failed" },
      { status: 500 }
    );
  }
}
