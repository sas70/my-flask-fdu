import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { getHomeworkCaptureChunkMs } from "@/lib/homework-capture-constants";
import {
  YUJA_MERGE_DEFAULT_MIN_RATIO,
  computeYujaProgress,
  getOrCreateYujaDoc,
  loadYujaDocByUrl,
  yujaDocIdForUrl,
  type YujaSegmentRecord,
} from "@/lib/yuja-funny-urls";

export const maxDuration = 15;

/**
 * GET ?url=... — look up (or create) the yuja doc for this URL and return its
 * full state + computed progress. This is the ONE endpoint the UI needs to open
 * the Tab Capture page for a video — no session concept.
 *
 * Query params:
 *   - url (required): the reference playback URL
 *   - create=1 (optional): if present, creates an empty yuja doc when none exists
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const referenceUrl = String(searchParams.get("url") || "").trim();
    const createIfMissing = searchParams.get("create") === "1";

    if (!referenceUrl) {
      return NextResponse.json({ error: "url is required" }, { status: 400 });
    }

    let docId: string;
    try {
      docId = yujaDocIdForUrl(referenceUrl).docId;
    } catch {
      return NextResponse.json({ error: "Invalid reference URL" }, { status: 400 });
    }

    const db = getDb();
    const chunkMs = getHomeworkCaptureChunkMs();

    let existing = await loadYujaDocByUrl(db, referenceUrl);
    if (!existing && createIfMissing) {
      const created = await getOrCreateYujaDoc(db, referenceUrl, { chunkMs });
      existing = { docId: created.docId, data: created.data };
    }

    if (!existing) {
      return NextResponse.json({
        ok: true,
        yujaFunnyUrlsDocId: docId,
        exists: false,
        chunkMs,
        minTranscribedRatio: YUJA_MERGE_DEFAULT_MIN_RATIO,
        segments: {},
        progress: {
          totalChunks: 0,
          chunksWithMedia: 0,
          chunksTranscribed: 0,
          chunksFailed: 0,
          minRequiredTranscripts: 0,
          transcribeRatio: 0,
          mergeReady: false,
          combinedTranscriptionUrl: null,
          failedChunkIndices: [],
          missingChunkIndices: [],
        },
        nextChunkIndex: 0,
        combinedTranscriptionUrl: null,
      });
    }

    const segments: Record<string, YujaSegmentRecord> = existing.data.segments || {};
    const progress = computeYujaProgress(
      segments,
      existing.data.combinedTranscriptionUrl,
      YUJA_MERGE_DEFAULT_MIN_RATIO
    );

    return NextResponse.json({
      ok: true,
      yujaFunnyUrlsDocId: existing.docId,
      exists: true,
      referencePlaybackUrl: existing.data.referencePlaybackUrl,
      chunkMs: existing.data.chunkMs || chunkMs,
      minTranscribedRatio: YUJA_MERGE_DEFAULT_MIN_RATIO,
      segments,
      progress,
      nextChunkIndex: progress.totalChunks, // next chunk to record/upload
      combinedTranscriptionUrl: existing.data.combinedTranscriptionUrl || null,
    });
  } catch (e) {
    console.error("[homework-capture/yuja-state GET]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "yuja-state failed" },
      { status: 500 }
    );
  }
}
