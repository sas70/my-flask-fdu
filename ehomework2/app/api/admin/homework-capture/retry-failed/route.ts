/* eslint-disable @typescript-eslint/no-require-imports -- @ehomework/gradeflow-shared is CommonJS */
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { getHomeworkCaptureChunkMs } from "@/lib/homework-capture-constants";
import {
  YUJA_MERGE_DEFAULT_MIN_RATIO,
  computeYujaProgress,
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
    const chunkMs =
      data.chunkMs && Number.isFinite(data.chunkMs) && data.chunkMs > 0
        ? data.chunkMs
        : getHomeworkCaptureChunkMs();
    const progress = computeYujaProgress(
      segments,
      data.combinedTranscriptionUrl,
      YUJA_MERGE_DEFAULT_MIN_RATIO,
      { chunkMs, sourceDurationMs: data.sourceDurationMs }
    );
    const mergeCap = progress.mergeTargetChunks;

    const candidates: Array<{ idx: number; seg: YujaSegmentRecord }> = [];
    const skippedNoChunk: number[] = [];
    const skippedBeyondMergeWindow: number[] = [];

    for (const [k, seg] of Object.entries(segments)) {
      const idx = Number(k);
      if (!Number.isInteger(idx) || idx < 0) continue;
      const needsRetry =
        (seg.transcriptionStatus === "failed" || !seg.transcriptUrl) && !seg.transcriptUrl;
      if (mergeCap > 0 && idx >= mergeCap) {
        if (needsRetry) skippedBeyondMergeWindow.push(idx);
        continue;
      }
      if (!needsRetry) continue;
      if (!seg.chunkUrl) {
        skippedNoChunk.push(idx);
        continue;
      }
      candidates.push({ idx, seg });
    }

    candidates.sort((a, b) => a.idx - b.idx);

    skippedBeyondMergeWindow.sort((a, b) => a - b);
    console.log(
      `[homework-capture/retry-failed] doc=${docId.slice(0, 12)}… mergeCap=${mergeCap} candidates=${candidates.length} skippedNoChunk=${skippedNoChunk.join(",") || "none"} skippedBeyondMerge=${skippedBeyondMergeWindow.join(",") || "none"}`
    );

    const retried: Array<{ chunkIndex: number; transcriptUrl: string }> = [];
    const stillFailed: Array<{ chunkIndex: number; error: string }> = [];

    for (const { idx, seg } of candidates) {
      const mime = seg.chunkMimeType || "video/webm";
      try {
        console.log(`[homework-capture/retry-failed] try chunkIndex=${idx} mime=${mime}`);
        const text = await transcribeWithGemini(seg.chunkUrl!, mime);
        const fileName = `yuja_funny_urls/${docId}/segment_${String(idx).padStart(4, "0")}.txt`;
        const transcriptUrl = await uploadTextToBytescale(text, fileName);
        await writeYujaSegmentTranscript(db, docId, idx, transcriptUrl);
        retried.push({ chunkIndex: idx, transcriptUrl });
        console.log(`[homework-capture/retry-failed] ok chunkIndex=${idx} chars=${text.length}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[homework-capture/retry-failed] FAIL chunkIndex=${idx} ${msg}`);
        await writeYujaSegmentTranscriptFailed(db, docId, idx, msg);
        stillFailed.push({ chunkIndex: idx, error: msg });
      }
    }

    console.log(
      `[homework-capture/retry-failed] done retried=${retried.length} stillFailed=${stillFailed.length}`
    );

    return NextResponse.json({
      ok: true,
      yujaFunnyUrlsDocId: docId,
      attempted: candidates.length,
      retried,
      stillFailed,
      skippedNoChunk,
      skippedBeyondMergeWindow,
    });
  } catch (e) {
    console.error("[homework-capture/retry-failed]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Retry failed" },
      { status: 500 }
    );
  }
}
