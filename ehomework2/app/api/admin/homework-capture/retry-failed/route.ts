/* eslint-disable @typescript-eslint/no-require-imports -- @ehomework/gradeflow-shared is CommonJS */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import {
  loadYujaDocById,
  writeYujaSegmentTranscript,
  writeYujaSegmentTranscriptFailed,
  yujaDocIdForUrl,
  type YujaSegmentRecord,
} from "@/lib/yuja-funny-urls";

export const maxDuration = 540;

const {
  transcribeWithGemini,
  uploadTextToBytescale,
} = require("@ehomework/gradeflow-shared") as {
  transcribeWithGemini: (url: string, mime: string) => Promise<string>;
  uploadTextToBytescale: (text: string, fileName: string) => Promise<string>;
};

/**
 * Re-run Gemini on every segment with `transcriptionStatus === "failed"` (and also any
 * segment with `chunkUrl` but no `transcriptUrl` — catches stuck "pending" entries).
 *
 * Body: { url } OR { yujaFunnyUrlsDocId }
 * Returns per-chunk results: { retried: [...], stillFailed: [...], skipped: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY is not configured (required for segment transcription)." },
        { status: 503 }
      );
    }

    const body = (await request.json()) as { url?: string; yujaFunnyUrlsDocId?: string };
    const referenceUrl = String(body.url || "").trim();
    const bodyDocId = String(body.yujaFunnyUrlsDocId || "").trim();

    if (!referenceUrl && !bodyDocId) {
      return NextResponse.json({ error: "url or yujaFunnyUrlsDocId is required" }, { status: 400 });
    }

    let docId = bodyDocId;
    if (!docId) {
      try {
        docId = yujaDocIdForUrl(referenceUrl).docId;
      } catch {
        return NextResponse.json({ error: "Invalid reference URL" }, { status: 400 });
      }
    }

    const db = getDb();
    const data = await loadYujaDocById(db, docId);
    if (!data) {
      return NextResponse.json({ error: "yuja_funny_urls doc not found" }, { status: 404 });
    }

    const segments = data.segments || {};
    const candidates: Array<{ idx: number; seg: YujaSegmentRecord }> = [];
    const skippedNoChunk: number[] = [];

    for (const [k, seg] of Object.entries(segments)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0) continue;
      const needsRetry =
        (seg.transcriptionStatus === "failed" || !seg.transcriptUrl) && !seg.transcriptUrl;
      if (!needsRetry) continue;
      if (!seg.chunkUrl) {
        skippedNoChunk.push(idx);
        continue;
      }
      candidates.push({ idx, seg });
    }

    candidates.sort((a, b) => a.idx - b.idx);

    const retried: Array<{ chunkIndex: number; transcriptUrl: string }> = [];
    const stillFailed: Array<{ chunkIndex: number; error: string }> = [];

    for (const { idx, seg } of candidates) {
      const mime = seg.chunkMimeType || "video/webm";
      try {
        const text = await transcribeWithGemini(seg.chunkUrl!, mime);
        const fileName = `yuja_funny_urls/${docId}/segment_${String(idx).padStart(4, "0")}.txt`;
        const transcriptUrl = await uploadTextToBytescale(text, fileName);
        await writeYujaSegmentTranscript(db, docId, idx, transcriptUrl);
        retried.push({ chunkIndex: idx, transcriptUrl });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await writeYujaSegmentTranscriptFailed(db, docId, idx, msg);
        stillFailed.push({ chunkIndex: idx, error: msg });
      }
    }

    return NextResponse.json({
      ok: true,
      yujaFunnyUrlsDocId: docId,
      attempted: candidates.length,
      retried,
      stillFailed,
      skippedNoChunk,
    });
  } catch (e) {
    console.error("[homework-capture/retry-failed]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Retry failed" },
      { status: 500 }
    );
  }
}
