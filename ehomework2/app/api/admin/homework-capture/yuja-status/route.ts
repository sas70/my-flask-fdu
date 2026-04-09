import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { loadSortedChunks, sessionRef } from "@/lib/homework-capture-server";
import {
  YUJA_FUNNY_URLS,
  YUJA_MERGE_DEFAULT_MIN_RATIO,
  computeYujaProgress,
  ensureSessionYujaFunnyDoc,
  type YujaSegmentRecord,
} from "@/lib/yuja-funny-urls";

export const maxDuration = 15;

/**
 * Live progress for tab capture: Yuja doc segments vs session chunks (for UI polling).
 */
export async function GET(request: NextRequest) {
  try {
    const sessionId = String(new URL(request.url).searchParams.get("sessionId") || "").trim();
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const db = getDb();
    const sess = await sessionRef(db, sessionId).get();
    if (!sess.exists) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const chunks = await loadSortedChunks(db, sessionId);
    const orderedIndices = [...chunks.map((c) => c.chunkIndex)].sort((a, b) => a - b);

    const yujaId = await ensureSessionYujaFunnyDoc(db, sessionId);
    if (!yujaId) {
      return NextResponse.json({
        ok: true,
        sessionId,
        yujaFunnyUrlsDocId: null,
        segments: {},
        progress: null,
        message: "No reference URL — Yuja segment pipeline inactive.",
      });
    }

    const yujaSnap = await db.collection(YUJA_FUNNY_URLS).doc(yujaId).get();
    const yujaData = yujaSnap.data() as
      | { segments?: Record<string, YujaSegmentRecord>; combinedTranscriptionUrl?: string }
      | undefined;

    const segments = yujaData?.segments || {};
    const combinedTranscriptionUrl = yujaData?.combinedTranscriptionUrl;

    const progress = computeYujaProgress(
      orderedIndices,
      segments,
      combinedTranscriptionUrl,
      YUJA_MERGE_DEFAULT_MIN_RATIO
    );

    const segmentsOut: Record<
      string,
      {
        chunkUrl?: string;
        transcriptUrl?: string;
        transcriptionStatus?: string;
        transcriptionError?: string;
      }
    > = {};
    for (const idx of orderedIndices) {
      const s = segments[String(idx)];
      if (s) {
        segmentsOut[String(idx)] = {
          chunkUrl: s.chunkUrl,
          transcriptUrl: s.transcriptUrl,
          transcriptionStatus: s.transcriptionStatus,
          transcriptionError: s.transcriptionError,
        };
      }
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      yujaFunnyUrlsDocId: yujaId,
      minTranscribedRatio: YUJA_MERGE_DEFAULT_MIN_RATIO,
      segments: segmentsOut,
      combinedTranscriptionUrl: combinedTranscriptionUrl || null,
      progress,
    });
  } catch (e) {
    console.error("[homework-capture/yuja-status]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "yuja-status failed" },
      { status: 500 }
    );
  }
}
